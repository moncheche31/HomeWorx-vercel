CREATE OR REPLACE FUNCTION public.enforce_estimate_line_cost_basis()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_contractor boolean := COALESCE(NEW.is_price_overridden, false)
                          OR COALESCE(NEW.pricing_source,'') IN ('contractor','manual');
  v_authored boolean := COALESCE(NEW.labor_hours_basis,'') IN ('contractor_entered','contractor_confirmed')
                        OR NEW.labor_hours_confirmed_at IS NOT NULL;
  v_qty_owned boolean := NEW.quantity_reviewed_at IS NOT NULL
                         OR COALESCE(NEW.quantity_basis,'') IN ('contractor_entered','measurement','geometry_derived');
  v_low_confidence boolean := COALESCE(NEW.pricing_provenance->>'bindConfidence','') = 'low'
                              AND NEW.catalog_confirmed_at IS NULL;
  v_basis public.task_cost_basis;
  v_qty numeric := COALESCE(NEW.quantity, 0);
  v_unmeasured boolean;
  v_setup numeric := COALESCE(NEW.labor_hours_setup, 0);
BEGIN
  v_basis := COALESCE(NEW.cost_basis,
               public.infer_cost_basis(NEW.description, NEW.category_key, NEW.unit_key::text));
  NEW.cost_basis := v_basis;
  NEW.cost_basis_source := COALESCE(NEW.cost_basis_source,
                             CASE WHEN v_contractor THEN 'contractor' ELSE 'inferred' END);

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

  IF NOT v_contractor AND public.is_labor_bearing_basis(v_basis) THEN
    IF v_unmeasured THEN
      NEW.labor_hours := 0;
      NEW.labor_convention := 'hours_per_unit';
      NEW.labor_hours_formula := 'awaiting measured quantity';
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

  IF v_contractor THEN
    NEW.resolution_status := 'resolved'; NEW.unresolved_reason := NULL;
  ELSIF NEW.pricing_source IS NULL OR NEW.pricing_source = 'unmatched' THEN
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := COALESCE(NULLIF(NEW.unresolved_reason,''), 'no_catalog_match');
  ELSIF v_unmeasured THEN
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := CASE WHEN COALESCE(NEW.labor_hours_per_unit,0) > 0
                                  THEN 'quantity_required' ELSE 'quantity_unmeasured' END;
  ELSIF COALESCE(NEW.is_quantity_placeholder,false)
        AND COALESCE(NEW.quantity_basis,'') = 'size_not_count' THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'count_required';
  ELSIF v_low_confidence THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'catalog_match_unconfirmed';
  ELSIF public.is_labor_bearing_basis(v_basis)
        AND COALESCE(NEW.labor_hours,0) = 0 AND COALESCE(NEW.labor_hours_per_unit,0) = 0 THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'no_productivity_rate';
  ELSE
    NEW.resolution_status := 'resolved'; NEW.unresolved_reason := NULL;
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.bind_unpriced_estimate_lines(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_rate numeric;
  v_bound int := 0;
  v_priced int := 0;
  v_flagged int := 0;
  v_preserved int := 0;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_e.organization_id) THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;
  v_rate := COALESCE(NULLIF(v_e.default_labor_rate,0), 65);

  SELECT count(*) INTO v_preserved FROM public.estimate_line_items
   WHERE estimate_id = _estimate_id AND archived_at IS NULL
     AND (is_price_overridden OR COALESCE(pricing_source,'') IN ('contractor','manual'));

  PERFORM set_config('vw.kb_pricing', 'on', true);

  WITH lib AS (SELECT * FROM public.kb_resolved_assemblies(v_e.organization_id)),
  target AS (
    SELECT li.*
    FROM public.estimate_line_items li
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.is_price_overridden = false
      AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual')
      AND NOT public.is_fee_basis(COALESCE(li.cost_basis,'labor_production'::public.task_cost_basis))
      AND COALESCE(li.labor_hours_per_unit,0) = 0
      AND (li.resolution_status = 'unresolved' OR COALESCE(li.pricing_source,'') = 'unmatched')
  ),
  best AS (
    SELECT t.id AS line_id, m.*
    FROM target t
    LEFT JOIN LATERAL (
      SELECT a.assembly_key, a.work_item, a.unit_key, a.trade_key, a.category_key,
             a.subcategory_key, a.cost_basis, a.default_overhead_pct, a.suggested_profit_pct,
             a.productivity_convention,
             public.assembly_hours_per_unit(a.productivity_convention,
               a.default_labor_hours, a.production_rate) AS hours_per_unit,
             COALESCE(a.setup_hours,0) AS setup_hours,
             round(COALESCE(a.material_allowance,0) * (1 + COALESCE(a.waste_factor,0)), 2) AS material_cost,
             public.kb_overlap(t.description, a.work_item) AS overlap,
             (public.kb_overlap(t.description, a.work_item)
              + CASE WHEN t.trade_key IS NOT NULL AND a.trade_key = t.trade_key THEN 0.15 ELSE 0 END
              + CASE WHEN t.unit_key IS NOT NULL AND a.unit_key = t.unit_key THEN 0.10 ELSE 0 END
              + CASE WHEN a.origin = 'organization' THEN 0.05 ELSE 0 END) AS score
      FROM lib a
      WHERE (t.unit_key IS NULL OR a.unit_key IS NULL OR a.unit_key = t.unit_key)
      ORDER BY score DESC, a.assembly_key ASC
      LIMIT 1
    ) m ON true
  ),
  bound AS (
    UPDATE public.estimate_line_items li SET
      unit_key = COALESCE(li.unit_key, b.unit_key),
      trade_key = COALESCE(li.trade_key, b.trade_key),
      category_key = COALESCE(li.category_key, b.category_key),
      subcategory_key = COALESCE(li.subcategory_key, b.subcategory_key),
      cost_basis = COALESCE(li.cost_basis, b.cost_basis),
      labor_hours_per_unit = b.hours_per_unit,
      labor_hours_setup = b.setup_hours,
      labor_hours_basis = 'catalog_production',
      labor_convention = 'hours_per_unit',
      labor_rate = CASE WHEN COALESCE(li.labor_rate,0) = 0 THEN v_rate ELSE li.labor_rate END,
      material_cost = CASE WHEN COALESCE(li.material_cost,0) = 0
                           THEN b.material_cost ELSE li.material_cost END,
      overhead_pct = CASE WHEN COALESCE(li.overhead_pct,0) = 0
                          THEN COALESCE(b.default_overhead_pct,0) ELSE li.overhead_pct END,
      profit_pct = CASE WHEN COALESCE(li.profit_pct,0) = 0
                        THEN COALESCE(b.suggested_profit_pct,0) ELSE li.profit_pct END,
      catalog_item_key = COALESCE(li.catalog_item_key, b.assembly_key),
      catalog_mapping_source = COALESCE(li.catalog_mapping_source, 'auto'),
      pricing_source = 'knowledge_base',
      priced_at = now(),
      pricing_provenance = li.pricing_provenance || jsonb_build_object(
        'boundAssemblyKey', b.assembly_key,
        'boundWorkItem', b.work_item,
        'boundBy', 'bind_unpriced_estimate_lines',
        'boundScore', round(b.score, 3),
        'boundOverlap', round(b.overlap, 3),
        'bindConfidence', CASE WHEN b.score >= 0.75 THEN 'high' ELSE 'low' END,
        'productivityConvention', b.productivity_convention,
        'laborHoursPerUnit', b.hours_per_unit,
        'setupHours', b.setup_hours,
        'boundAt', now())
    FROM best b
    WHERE li.id = b.line_id
      AND b.assembly_key IS NOT NULL
      AND b.hours_per_unit IS NOT NULL
      AND b.hours_per_unit > 0
      AND b.score >= 0.45
    RETURNING li.resolution_status
  )
  SELECT count(*), count(*) FILTER (WHERE resolution_status = 'resolved'),
         count(*) FILTER (WHERE resolution_status = 'unresolved')
    INTO v_bound, v_priced, v_flagged FROM bound;

  PERFORM set_config('vw.kb_pricing', 'off', true);

  RETURN jsonb_build_object(
    'bound', v_bound, 'priced', v_priced, 'flagged', v_flagged,
    'contractorPreserved', v_preserved);
END
$$;

REVOKE ALL ON FUNCTION public.bind_unpriced_estimate_lines(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bind_unpriced_estimate_lines(uuid) TO authenticated, service_role;
