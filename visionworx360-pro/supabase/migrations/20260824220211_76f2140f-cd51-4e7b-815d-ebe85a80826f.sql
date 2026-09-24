-- C1: remove anonymous execute on privileged mutation routines
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'execute')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- C2: the SQL band engine no longer competes with the canonical cost pipeline
CREATE OR REPLACE FUNCTION public.sync_estimate_ballpark_after_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_snapshot jsonb;
  v_has_lines boolean;
BEGIN
  FOR v_id IN
    SELECT DISTINCT estimate_id FROM changed_lines WHERE estimate_id IS NOT NULL
  LOOP
    SELECT e.range_snapshot INTO v_snapshot
      FROM public.estimates e WHERE e.id = v_id;

    /* Only refresh a band that already exists; never invent one. */
    CONTINUE WHEN v_snapshot IS NULL OR v_snapshot = '{}'::jsonb;

    SELECT EXISTS (
      SELECT 1 FROM public.estimate_line_items li
      WHERE li.estimate_id = v_id AND COALESCE(li.is_archived, false) = false
    ) INTO v_has_lines;

    IF v_has_lines OR COALESCE(v_snapshot->>'source','') = 'canonical_lines' THEN
      /* Canonical estimate lines own the price. Flag for a canonical refresh
         instead of writing a second engine's band over the authoritative one. */
      UPDATE public.estimates
         SET range_snapshot = jsonb_set(
               range_snapshot, '{needsCanonicalRefresh}', 'true'::jsonb, true)
       WHERE id = v_id
         AND COALESCE(range_snapshot->>'needsCanonicalRefresh','') <> 'true';
    ELSE
      PERFORM public.rebuild_estimate_ballpark(v_id);
    END IF;
  END LOOP;
  RETURN NULL;
END $function$;

-- C3: a contractor-owned line with no money and no time is not "resolved"
CREATE OR REPLACE FUNCTION public.enforce_estimate_line_cost_basis()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contractor boolean := COALESCE(NEW.is_price_overridden, false)
                          OR COALESCE(NEW.pricing_source,'') IN ('contractor','manual');
  v_authored boolean := COALESCE(NEW.labor_hours_basis,'') IN ('contractor_entered','contractor_confirmed')
                        OR NEW.labor_hours_confirmed_at IS NOT NULL;
  v_qty_owned boolean := NEW.quantity_reviewed_at IS NOT NULL
                         OR COALESCE(NEW.quantity_basis,'') IN ('contractor_entered','measurement','geometry_derived');
  v_low_confidence boolean := COALESCE(NEW.pricing_provenance->>'bindConfidence','') = 'low'
                              AND NEW.catalog_confirmed_at IS NULL;
  v_trade_owned boolean := COALESCE(NEW.trade_source,'') IN ('contractor','manual');
  v_inferred_trade text;
  v_basis public.task_cost_basis;
  v_qty numeric := COALESCE(NEW.quantity, 0);
  v_unmeasured boolean;
  v_needs_count boolean;
  v_setup numeric := COALESCE(NEW.labor_hours_setup, 0);
  v_no_charge boolean := COALESCE(NEW.pricing_provenance->>'noCharge','') = 'true';
  v_has_money boolean;
BEGIN
  v_basis := COALESCE(NEW.cost_basis,
               public.infer_cost_basis(NEW.description, NEW.category_key, NEW.unit_key::text));
  NEW.cost_basis := v_basis;
  NEW.cost_basis_source := COALESCE(NEW.cost_basis_source,
                             CASE WHEN v_contractor THEN 'contractor' ELSE 'inferred' END);

  IF NOT v_trade_owned THEN
    v_inferred_trade := public.infer_trade_key(NEW.description, NEW.category_key::text);
    IF v_inferred_trade IS NOT NULL AND v_inferred_trade IS DISTINCT FROM NEW.trade_key THEN
      NEW.trade_key := v_inferred_trade;
      NEW.trade_source := COALESCE(NEW.trade_source, 'inferred');
    END IF;
  END IF;

  IF NOT v_contractor AND NEW.unit_key::text = 'square_foot'
     AND lower(COALESCE(NEW.description,'')) ~ '\m(trim|baseboard|casing|crown|handrail)\M' THEN
    NEW.unit_key := 'linear_foot';
    NEW.is_quantity_placeholder := true;
  END IF;

  IF NOT v_contractor AND NOT v_qty_owned
     AND public.quantity_is_size_not_count(NEW.description, v_qty, NEW.unit_key::text) THEN
    NEW.quantity_basis := 'size_not_count';
    NEW.quantity_basis_note := COALESCE(NEW.quantity_basis_note,
      'Quantity ' || trim(to_char(v_qty,'FM999999')) ||
      ' looked like a size in the description, not a count. Reset to 1 - confirm the real count.');
    NEW.quantity := 1;
    NEW.is_quantity_placeholder := true;
    v_qty := 1;
  END IF;

  IF public.is_fee_basis(v_basis) AND NOT v_contractor THEN
    IF COALESCE(NEW.material_cost,0) > 0 AND COALESCE(NEW.other_cost,0) = 0 THEN
      NEW.other_cost := NEW.material_cost;
      NEW.material_cost := 0;
    END IF;
    NEW.labor_hours := 0;
    NEW.labor_hours_per_unit := 0;
    NEW.labor_hours_setup := 0;
    NEW.labor_hours_basis := 'fee_no_labor';
    NEW.labor_convention := 'none';
    NEW.labor_hours_formula := 'fee - no labor by cost basis';
    IF NEW.unit_key IS NULL OR NEW.unit_key::text NOT IN ('each','lump_sum','allowance','other') THEN
      NEW.unit_key := public.default_unit_for_basis(v_basis);
    END IF;
    IF v_qty <= 0 THEN NEW.quantity := 1; v_qty := 1; END IF;
    NEW.is_quantity_placeholder := false;
    v_setup := 0;
  END IF;

  v_unmeasured := public.is_measured_unit(NEW.unit_key::text)
                  AND COALESCE(NEW.is_quantity_placeholder, false)
                  AND v_qty <= 1;

  -- A plural scope phrase priced at "1 each" is an invented count, not an estimate.
  v_needs_count := NOT v_contractor AND NOT v_qty_owned
                   AND NOT public.is_fee_basis(v_basis)
                   AND public.quantity_needs_count(NEW.description, NEW.unit_key::text, v_qty,
                                                   COALESCE(NEW.is_quantity_placeholder,false));

  IF NOT v_contractor AND public.is_labor_bearing_basis(v_basis) THEN
    IF v_unmeasured OR v_needs_count THEN
      NEW.labor_hours := 0;
      NEW.labor_convention := 'hours_per_unit';
      NEW.labor_hours_formula := CASE WHEN v_needs_count
        THEN 'awaiting item count' ELSE 'awaiting measured quantity' END;
    ELSIF COALESCE(NEW.labor_hours_per_unit,0) > 0 THEN
      NEW.labor_hours := round(v_setup + v_qty * NEW.labor_hours_per_unit, 4);
      NEW.labor_convention := 'hours_per_unit';
      NEW.labor_hours_formula := CASE WHEN v_setup > 0
        THEN v_setup || ' hr setup + ' || v_qty || ' x ' || NEW.labor_hours_per_unit || ' hr/unit'
        ELSE v_qty || ' x ' || NEW.labor_hours_per_unit || ' hr/unit' END;
    ELSIF v_authored AND COALESCE(NEW.labor_hours,0) > 0 THEN
      NEW.labor_convention := 'total_hours';
      NEW.labor_hours_formula := COALESCE(NEW.labor_hours_formula, 'contractor-entered total hours');
    ELSE
      NEW.labor_hours := 0;
      NEW.labor_convention := 'unresolved';
      NEW.labor_hours_formula := 'no productivity rate';
    END IF;
  END IF;

  v_has_money := COALESCE(NEW.labor_hours,0) > 0
                 OR COALESCE(NEW.labor_hours_per_unit,0) > 0
                 OR COALESCE(NEW.material_cost,0) > 0
                 OR COALESCE(NEW.equipment_cost,0) > 0
                 OR COALESCE(NEW.subcontractor_cost,0) > 0
                 OR COALESCE(NEW.other_cost,0) > 0
                 OR COALESCE(NEW.unit_cost,0) > 0
                 OR COALESCE(NEW.labor_cost,0) > 0
                 OR COALESCE(NEW.direct_cost,0) > 0;

  -- Evidence gate: a task whose quantity was stripped for lack of matching
  -- evidence can never present as priced, regardless of pricing source.
  IF COALESCE(NEW.quantity_basis,'') = 'needs_evidence' THEN
    NEW.labor_hours := 0;
    NEW.is_quantity_placeholder := true;
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := 'quantity_unmeasured';
  ELSIF v_contractor THEN
    IF v_has_money OR v_no_charge THEN
      NEW.resolution_status := 'resolved'; NEW.unresolved_reason := NULL;
    ELSE
      /* Contractor-owned but zero money and zero time: never silently resolved. */
      NEW.resolution_status := 'unresolved';
      NEW.unresolved_reason := 'contractor_price_missing';
    END IF;
  ELSIF NEW.pricing_source IS NULL OR NEW.pricing_source = 'unmatched' THEN
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := COALESCE(NULLIF(NEW.unresolved_reason,''), 'no_catalog_match');
  ELSIF v_unmeasured THEN
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := CASE WHEN COALESCE(NEW.labor_hours_per_unit,0) > 0
                                  THEN 'quantity_required' ELSE 'quantity_unmeasured' END;
  ELSIF v_needs_count OR (COALESCE(NEW.is_quantity_placeholder,false)
        AND COALESCE(NEW.quantity_basis,'') = 'size_not_count') THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'count_required';
  ELSIF v_low_confidence THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'catalog_match_unconfirmed';
  ELSIF public.is_labor_bearing_basis(v_basis)
        AND COALESCE(NEW.labor_hours,0) = 0 AND COALESCE(NEW.labor_hours_per_unit,0) = 0 THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'no_productivity_rate';
  ELSIF NOT v_has_money AND NOT v_no_charge THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'zero_priced';
  ELSE
    NEW.resolution_status := 'resolved'; NEW.unresolved_reason := NULL;
  END IF;

  RETURN NEW;
END
$function$;

-- H1: enforce project linkage on estimate lines
ALTER TABLE public.estimate_line_items
  ADD CONSTRAINT estimate_line_items_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.validate_estimate_line_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  e RECORD;
  v_scope_project uuid;
BEGIN
  SELECT organization_id, project_id INTO e FROM public.estimates WHERE id = NEW.estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found' USING ERRCODE='42501'; END IF;
  NEW.organization_id := e.organization_id;
  NEW.project_id := e.project_id;

  IF NEW.scope_item_id IS NOT NULL THEN
    SELECT project_id INTO v_scope_project FROM public.scope_items WHERE id = NEW.scope_item_id;
    IF v_scope_project IS NOT NULL AND v_scope_project IS DISTINCT FROM e.project_id THEN
      RAISE EXCEPTION 'Scope item belongs to a different project' USING ERRCODE='42501';
    END IF;
  END IF;

  RETURN NEW;
END $function$;

-- M1: an explicit overhead_profit choice is not an "unset" pricing method
CREATE OR REPLACE FUNCTION public.apply_org_pricing_method_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  org_method text;
  org_target numeric;
  org_oh numeric;
  org_profit numeric;
BEGIN
  SELECT default_pricing_method, default_target_gross_margin_pct,
         default_overhead_pct, default_profit_pct
    INTO org_method, org_target, org_oh, org_profit
    FROM public.organizations WHERE id = NEW.organization_id;

  IF org_method IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only fill in what the caller did not explicitly choose. An explicit
  -- overhead_profit method is a contractor decision, never an "unset" value.
  IF NEW.pricing_method IS NULL THEN
    NEW.pricing_method := org_method;
    IF COALESCE(NEW.target_gross_margin_pct, 0) = 0 THEN
      NEW.target_gross_margin_pct := COALESCE(org_target, 0);
    END IF;
    IF COALESCE(NEW.default_overhead_pct, 0) = 0 THEN
      NEW.default_overhead_pct := COALESCE(org_oh, 0);
    END IF;
    IF COALESCE(NEW.default_profit_pct, 0) = 0 THEN
      NEW.default_profit_pct := COALESCE(org_profit, 0);
    END IF;
  ELSIF NEW.pricing_method = 'overhead_profit' THEN
    IF COALESCE(NEW.default_overhead_pct, 0) = 0 THEN
      NEW.default_overhead_pct := COALESCE(org_oh, 0);
    END IF;
    IF COALESCE(NEW.default_profit_pct, 0) = 0 THEN
      NEW.default_profit_pct := COALESCE(org_profit, 0);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
