ALTER TABLE public.catalog_assemblies
  ADD COLUMN IF NOT EXISTS productivity_convention text,
  ADD COLUMN IF NOT EXISTS setup_hours numeric NOT NULL DEFAULT 0;
ALTER TABLE public.org_assemblies
  ADD COLUMN IF NOT EXISTS productivity_convention text,
  ADD COLUMN IF NOT EXISTS setup_hours numeric NOT NULL DEFAULT 0;
ALTER TABLE public.org_assembly_overrides
  ADD COLUMN IF NOT EXISTS productivity_convention text,
  ADD COLUMN IF NOT EXISTS setup_hours numeric;

COMMENT ON COLUMN public.catalog_assemblies.productivity_convention IS
  'hours_per_unit | units_per_hour | none (fee) | unresolved. Explicit, never inferred at pricing time.';

UPDATE public.catalog_assemblies SET productivity_convention =
  CASE
    WHEN public.is_fee_basis(COALESCE(cost_basis,
           public.infer_cost_basis(work_item, category_key, unit_key::text))) THEN 'none'
    WHEN COALESCE(default_labor_hours,0) > 0
         AND (production_rate IS NULL
              OR abs(default_labor_hours * production_rate - 1) <= 0.15) THEN 'hours_per_unit'
    WHEN COALESCE(default_labor_hours,0) = 0 AND COALESCE(production_rate,0) > 0 THEN 'units_per_hour'
    WHEN COALESCE(default_labor_hours,0) > 0 THEN 'hours_per_unit'
    ELSE 'unresolved'
  END
WHERE productivity_convention IS NULL;

UPDATE public.org_assemblies SET productivity_convention =
  CASE
    WHEN public.is_fee_basis(COALESCE(cost_basis,
           public.infer_cost_basis(work_item, category_key, unit_key::text))) THEN 'none'
    WHEN COALESCE(default_labor_hours,0) > 0
         AND (production_rate IS NULL
              OR abs(default_labor_hours * production_rate - 1) <= 0.15) THEN 'hours_per_unit'
    WHEN COALESCE(default_labor_hours,0) = 0 AND COALESCE(production_rate,0) > 0 THEN 'units_per_hour'
    WHEN COALESCE(default_labor_hours,0) > 0 THEN 'hours_per_unit'
    ELSE 'unresolved'
  END
WHERE productivity_convention IS NULL;

CREATE OR REPLACE FUNCTION public.assembly_hours_per_unit(
  _convention text, _hours numeric, _rate numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _convention = 'none' THEN 0
    WHEN _convention = 'hours_per_unit' AND COALESCE(_hours,0) > 0 THEN round(_hours, 4)
    WHEN _convention = 'units_per_hour' AND COALESCE(_rate,0) > 0 THEN round(1 / _rate, 4)
    ELSE NULL
  END;
$$;
REVOKE ALL ON FUNCTION public.assembly_hours_per_unit(text,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assembly_hours_per_unit(text,numeric,numeric) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.kb_resolved_assemblies(uuid);
CREATE OR REPLACE FUNCTION public.kb_resolved_assemblies(_org uuid)
RETURNS TABLE(assembly_key text, origin text, trade_key text, category_key text,
  subcategory_key text, work_item text, default_scope_description text, unit_key scope_unit,
  production_rate numeric, default_labor_hours numeric, crew_size numeric,
  material_allowance numeric, waste_factor numeric, suggested_markup_pct numeric,
  default_overhead_pct numeric, suggested_profit_pct numeric, keywords text[],
  synonyms text[], is_sample_data boolean, cost_basis task_cost_basis,
  productivity_convention text, setup_hours numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH v AS (SELECT version FROM public.catalog_library_versions WHERE is_current LIMIT 1)
  SELECT a.assembly_key, 'library'::text,
         a.trade_key, a.category_key, a.subcategory_key,
         COALESCE(o.work_item, a.work_item),
         COALESCE(o.default_scope_description, a.default_scope_description),
         COALESCE(o.unit_key, a.unit_key),
         COALESCE(o.production_rate, a.production_rate),
         COALESCE(o.default_labor_hours, a.default_labor_hours),
         COALESCE(o.crew_size, a.crew_size),
         COALESCE(o.material_allowance, a.material_allowance),
         COALESCE(o.waste_factor, a.waste_factor),
         COALESCE(o.suggested_markup_pct, a.suggested_markup_pct),
         COALESCE(o.default_overhead_pct, a.default_overhead_pct),
         COALESCE(o.suggested_profit_pct, a.suggested_profit_pct),
         COALESCE(o.keywords, a.keywords), a.synonyms, a.is_sample_data,
         COALESCE(o.cost_basis, a.cost_basis,
                  public.infer_cost_basis(COALESCE(o.work_item, a.work_item),
                                          a.category_key, COALESCE(o.unit_key,a.unit_key)::text)),
         COALESCE(o.productivity_convention, a.productivity_convention, 'unresolved'),
         COALESCE(o.setup_hours, a.setup_hours, 0)
  FROM public.catalog_assemblies a
  JOIN v ON v.version = a.library_version
  LEFT JOIN public.org_assembly_overrides o
    ON o.assembly_key = a.assembly_key AND o.organization_id = _org
  WHERE a.is_active
    AND COALESCE(o.is_disabled, false) = false
    AND o.archived_at IS NULL
  UNION ALL
  SELECT c.assembly_key, 'organization'::text,
         c.trade_key, c.category_key, c.subcategory_key,
         c.work_item, c.default_scope_description, c.unit_key,
         c.production_rate, c.default_labor_hours, c.crew_size,
         c.material_allowance, c.waste_factor,
         c.suggested_markup_pct, c.default_overhead_pct, c.suggested_profit_pct,
         c.keywords, c.synonyms, false,
         COALESCE(c.cost_basis, public.infer_cost_basis(c.work_item, c.category_key, c.unit_key::text)),
         COALESCE(c.productivity_convention, 'unresolved'),
         COALESCE(c.setup_hours, 0)
  FROM public.org_assemblies c
  WHERE c.organization_id = _org
    AND c.is_disabled = false AND c.archived_at IS NULL;
$function$;
REVOKE ALL ON FUNCTION public.kb_resolved_assemblies(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kb_resolved_assemblies(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_estimate_line_cost_basis()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_contractor boolean := COALESCE(NEW.is_price_overridden, false)
                          OR COALESCE(NEW.pricing_source,'') IN ('contractor','manual');
  v_authored boolean := COALESCE(NEW.labor_hours_basis,'') IN ('contractor_entered','contractor_confirmed')
                        OR NEW.labor_hours_confirmed_at IS NOT NULL;
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
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'quantity_unmeasured';
  ELSIF public.is_labor_bearing_basis(v_basis)
        AND COALESCE(NEW.labor_hours,0) = 0 AND COALESCE(NEW.labor_hours_per_unit,0) = 0 THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'no_productivity_rate';
  ELSE
    NEW.resolution_status := 'resolved'; NEW.unresolved_reason := NULL;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.project_geometry_basis(_project_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH m AS (
    SELECT COALESCE(sum(pm.length_ft * pm.width_ft), 0) AS floor_area,
           COALESCE(sum(2 * (pm.length_ft + pm.width_ft)), 0) AS perimeter,
           COALESCE(sum(2 * (pm.length_ft + pm.width_ft) * COALESCE(pm.ceiling_height_ft, 8)), 0) AS gross_wall,
           COALESCE(sum(pm.interior_partition_lf), 0) AS partition_lf,
           COALESCE(max(pm.floor_waste_pct), 10) AS waste_pct,
           COALESCE(sum((
             SELECT COALESCE(sum(COALESCE((o->>'count')::numeric,1)
                                 * COALESCE((o->>'widthFt')::numeric,0)
                                 * COALESCE((o->>'heightFt')::numeric,0)), 0)
             FROM jsonb_array_elements(pm.openings) o)), 0) AS opening_area,
           COALESCE(sum((
             SELECT COALESCE(sum(COALESCE((o->>'count')::numeric,1)
                                 * COALESCE((o->>'widthFt')::numeric,0)), 0)
             FROM jsonb_array_elements(pm.openings) o
             WHERE COALESCE((o->>'interruptsTrim')::boolean, false))), 0) AS trim_gaps
    FROM public.project_measurements pm
    WHERE pm.project_id = _project_id
  )
  SELECT jsonb_build_object(
    'floorArea', round(floor_area, 2),
    'ceilingArea', round(floor_area, 2),
    'floorAreaWithWaste', round(floor_area * (1 + waste_pct / 100.0), 2),
    'wallArea', round(GREATEST(gross_wall - opening_area, 0), 2),
    'perimeter', round(perimeter, 2),
    'trimLf', round(GREATEST(perimeter - trim_gaps, 0), 2),
    'partitionLf', round(partition_lf, 2),
    'wastePct', waste_pct)
  FROM m;
$$;
REVOKE ALL ON FUNCTION public.project_geometry_basis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_geometry_basis(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.geometry_surface_for_line(_description text, _catalog_key text, _unit text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  WITH t AS (SELECT lower(COALESCE(_description,'') || ' ' || COALESCE(_catalog_key,'')) AS s)
  SELECT CASE
    WHEN _unit = 'linear_foot' AND (SELECT s FROM t) ~ 'partition|interior wall|nonbearing|non-bearing|demo\.wall|wall\.interior' THEN 'partitionLf'
    WHEN _unit = 'linear_foot' AND (SELECT s FROM t) ~ 'baseboard|base trim|casing|crown|trim\.' THEN 'trimLf'
    WHEN _unit = 'linear_foot' THEN NULL
    WHEN _unit = 'square_foot' AND (SELECT s FROM t) ~ 'ceiling' THEN 'ceilingArea'
    WHEN _unit = 'square_foot' AND (SELECT s FROM t) ~ 'floor|subfloor|underlayment|slab|carpet|lvp|laminate' THEN 'floorAreaWithWaste'
    WHEN _unit = 'square_foot' AND (SELECT s FROM t) ~ 'wall|drywall|paint|insulat|furring|sheathing' THEN 'wallArea'
    WHEN _unit = 'square_foot' THEN 'floorArea'
    ELSE NULL
  END;
$$;
REVOKE ALL ON FUNCTION public.geometry_surface_for_line(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.geometry_surface_for_line(text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.derive_geometry_quantities(_estimate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_est public.estimates%ROWTYPE;
  v_geo jsonb;
  v_measurement uuid;
  v_updated int := 0;
BEGIN
  SELECT * INTO v_est FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found' USING ERRCODE = '42501'; END IF;
  v_geo := public.project_geometry_basis(v_est.project_id);
  SELECT pm.id INTO v_measurement FROM public.project_measurements pm
   WHERE pm.project_id = v_est.project_id LIMIT 1;

  WITH candidate AS (
    SELECT li.id,
           public.geometry_surface_for_line(li.description, li.catalog_item_key, li.unit_key::text) AS surface
    FROM public.estimate_line_items li
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.is_price_overridden = false
      AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual')
      AND li.quantity_reviewed_at IS NULL
      AND public.is_measured_unit(li.unit_key::text)
      AND COALESCE(li.is_quantity_placeholder, false)
      AND COALESCE(li.quantity, 0) <= 1
  ),
  applied AS (
    UPDATE public.estimate_line_items li SET
      quantity = round((v_geo->>c.surface)::numeric, 2),
      is_quantity_placeholder = false,
      quantity_basis = 'geometry',
      quantity_source_measurement_id = v_measurement,
      quantity_basis_note = 'Derived from saved project measurements (' || c.surface || ')',
      quantity_basis_formula = jsonb_build_object('surface', c.surface, 'geometry', v_geo),
      pricing_provenance = COALESCE(li.pricing_provenance,'{}'::jsonb)
        || jsonb_build_object('quantity', jsonb_build_object(
             'source','geometry','surface',c.surface,
             'value',(v_geo->>c.surface)::numeric,'derivedAt', now()))
    FROM candidate c
    WHERE li.id = c.id
      AND c.surface IS NOT NULL
      AND COALESCE((v_geo->>c.surface)::numeric, 0) > 0
    RETURNING 1)
  SELECT count(*) INTO v_updated FROM applied;

  RETURN jsonb_build_object('updated', v_updated, 'geometry', v_geo);
END $$;
REVOKE ALL ON FUNCTION public.derive_geometry_quantities(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.derive_geometry_quantities(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.estimate_invariant_cost(_estimate_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_target boolean;
  r RECORD;
  v_labor_hours numeric := 0; v_labor numeric := 0; v_material numeric := 0;
  v_equipment numeric := 0; v_sub numeric := 0; v_other numeric := 0;
  v_direct numeric := 0; v_oh numeric := 0; v_profit numeric := 0;
  v_cont numeric := 0; v_taxable numeric := 0;
  v_job numeric; v_subtotal numeric; v_tax numeric; v_margin numeric;
  v_resolved int := 0; v_unresolved int := 0;
  v_line_direct numeric; v_line_oh numeric; v_line_profit numeric; v_line_cont numeric;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;
  v_target := v_e.pricing_method = 'target_gross_margin';

  SELECT count(*) FILTER (WHERE resolution_status = 'unresolved') INTO v_unresolved
  FROM public.estimate_line_items
  WHERE estimate_id = _estimate_id AND archived_at IS NULL;

  FOR r IN
    SELECT * FROM public.estimate_line_items
    WHERE estimate_id = _estimate_id AND archived_at IS NULL
      AND resolution_status = 'resolved'
  LOOP
    v_resolved := v_resolved + 1;
    v_line_direct := round(COALESCE(r.labor_hours,0) * COALESCE(r.labor_rate,0), 2)
                   + round(COALESCE(r.material_cost,0) * COALESCE(r.quantity,0), 2)
                   + round(COALESCE(r.equipment_cost,0) * COALESCE(r.quantity,0), 2)
                   + round(COALESCE(r.subcontractor_cost,0) * COALESCE(r.quantity,0), 2)
                   + round(COALESCE(r.other_cost,0) * COALESCE(r.quantity,0), 2);
    v_labor_hours := v_labor_hours + COALESCE(r.labor_hours,0);
    v_labor := v_labor + round(COALESCE(r.labor_hours,0) * COALESCE(r.labor_rate,0), 2);
    v_material := v_material + round(COALESCE(r.material_cost,0) * COALESCE(r.quantity,0), 2);
    v_equipment := v_equipment + round(COALESCE(r.equipment_cost,0) * COALESCE(r.quantity,0), 2);
    v_sub := v_sub + round(COALESCE(r.subcontractor_cost,0) * COALESCE(r.quantity,0), 2);
    v_other := v_other + round(COALESCE(r.other_cost,0) * COALESCE(r.quantity,0), 2);

    v_line_oh := CASE WHEN v_target THEN 0 ELSE round(v_line_direct * COALESCE(r.overhead_pct,0) / 100, 2) END;
    v_line_profit := CASE WHEN v_target THEN 0
                     ELSE round((v_line_direct + v_line_oh) * COALESCE(r.profit_pct,0) / 100, 2) END;
    v_line_cont := round((v_line_direct + v_line_oh + v_line_profit) * COALESCE(r.contingency_pct,0) / 100, 2);

    v_direct := v_direct + v_line_direct;
    v_oh := v_oh + v_line_oh;
    v_profit := v_profit + v_line_profit;
    v_cont := v_cont + v_line_cont;
    IF r.is_taxable THEN
      v_taxable := v_taxable + (v_line_direct + v_line_oh + v_line_profit + v_line_cont);
    END IF;
  END LOOP;

  v_job := round(v_direct + v_cont, 2);
  IF v_target THEN
    v_margin := LEAST(GREATEST(COALESCE(v_e.target_gross_margin_pct,0), 0), 95);
    v_subtotal := CASE WHEN v_margin > 0 THEN round(v_job / (1 - v_margin / 100), 2) ELSE v_job END;
    v_taxable := CASE WHEN v_job > 0 THEN round(v_taxable * (v_subtotal / v_job), 2) ELSE 0 END;
  ELSE
    v_subtotal := round(v_direct + v_oh + v_profit + v_cont, 2);
  END IF;
  v_tax := round(v_taxable * COALESCE(v_e.tax_rate,0) / 100, 2);

  RETURN jsonb_build_object(
    'currency', v_e.currency,
    'laborHours', round(v_labor_hours, 2), 'laborCost', round(v_labor,2),
    'materialCost', round(v_material,2), 'equipmentCost', round(v_equipment,2),
    'subcontractorCost', round(v_sub,2), 'otherCost', round(v_other,2),
    'directCost', round(v_direct,2), 'contingency', round(v_cont,2),
    'jobCost', v_job, 'overhead', round(v_oh,2), 'profit', round(v_profit,2),
    'canonicalSubtotal', v_subtotal, 'canonicalGrandTotal', round(v_subtotal + v_tax, 2),
    'taxableSubtotal', round(v_taxable,2),
    'pricing', jsonb_build_object(
      'method', v_e.pricing_method,
      'targetGrossMarginPct', CASE WHEN v_target THEN v_e.target_gross_margin_pct ELSE NULL END,
      'overheadPct', CASE WHEN v_target THEN NULL ELSE v_e.default_overhead_pct END,
      'profitPct', CASE WHEN v_target THEN NULL ELSE v_e.default_profit_pct END,
      'contingencyPct', v_e.default_contingency_pct,
      'laborRate', v_e.default_labor_rate),
    'engineVersion', v_e.pricing_engine_version,
    'resolvedLines', v_resolved, 'unresolvedLines', v_unresolved,
    'computedAt', now());
END $$;
REVOKE ALL ON FUNCTION public.estimate_invariant_cost(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estimate_invariant_cost(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rebuild_estimate_ballpark(_estimate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_cost jsonb;
  v_snap jsonb;
  v_prior jsonb;
  v_tiers jsonb;
  v_expected numeric;
  v_spread numeric;
  v_unresolved int;
  v_band jsonb;
  v_ballpark jsonb;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;

  v_cost := public.estimate_invariant_cost(_estimate_id);
  v_expected := (v_cost->>'canonicalGrandTotal')::numeric;
  IF COALESCE(v_expected,0) <= 0 THEN
    RETURN jsonb_build_object('rebuilt', false, 'reason', 'no_priced_lines');
  END IF;

  v_unresolved := COALESCE((v_cost->>'unresolvedLines')::int, 0);
  v_spread := LEAST(0.10 + 0.02 * v_unresolved, 0.35);

  v_snap := COALESCE(v_e.range_snapshot, '{}'::jsonb);
  v_prior := CASE
    WHEN v_snap->>'kind' = 'ballpark' OR v_snap->>'mode' = 'ballpark' THEN v_snap
    ELSE v_snap->'ballpark' END;
  v_tiers := CASE
    WHEN jsonb_typeof(v_snap->'finishTiers') = 'object' THEN v_snap->'finishTiers'
    WHEN jsonb_typeof(v_snap->'tiers') = 'array' THEN v_snap
    ELSE NULL END;

  v_band := jsonb_build_object(
    'low', round(v_expected * (1 - v_spread), 2),
    'expected', round(v_expected, 2),
    'high', round(v_expected * (1 + v_spread), 2));

  v_ballpark := jsonb_strip_nulls(jsonb_build_object(
    'kind', 'ballpark',
    'currency', v_e.currency,
    'band', v_band,
    'confidence', CASE WHEN v_unresolved = 0 THEN 'high'
                       WHEN v_unresolved <= 3 THEN 'medium' ELSE 'low' END,
    'savedAt', now(),
    'calculatedAt', now(),
    'source', 'detailed_invariant_cost',
    'spreadPct', round(v_spread * 100, 2),
    'unresolvedLineCount', v_unresolved,
    'selectedPosition', COALESCE(v_prior->>'selectedPosition', 'expected'),
    'costBasis', v_cost,
    'originalBallpark', COALESCE(v_prior->'originalBallpark', v_prior),
    'previous', v_prior));

  UPDATE public.estimates SET
    range_snapshot = jsonb_strip_nulls(jsonb_build_object(
      'version', 2, 'ballpark', v_ballpark, 'finishTiers', v_tiers)),
    reconciliation_snapshot = jsonb_build_object(
      'rebuiltAt', now(), 'source', 'rebuild_estimate_ballpark',
      'recommended', round(v_expected, 2),
      'detailedGrandTotal', round(v_expected, 2),
      'delta', 0, 'costBasis', v_cost),
    updated_at = now()
  WHERE id = _estimate_id;

  RETURN jsonb_build_object('rebuilt', true, 'band', v_band, 'costBasis', v_cost);
END $$;
REVOKE ALL ON FUNCTION public.rebuild_estimate_ballpark(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebuild_estimate_ballpark(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.repair_estimate_pricing(_estimate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_geo jsonb; v_priced jsonb; v_band jsonb;
  v_before jsonb; v_after jsonb;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;

  SELECT jsonb_build_object(
      'lines', count(*),
      'laborHours', round(COALESCE(sum(labor_hours),0), 2),
      'unresolved', count(*) FILTER (WHERE resolution_status = 'unresolved'))
    INTO v_before
  FROM public.estimate_line_items
  WHERE estimate_id = _estimate_id AND archived_at IS NULL;

  v_geo := public.derive_geometry_quantities(_estimate_id);
  v_priced := public.kb_apply_pricing(_estimate_id, NULL, false);

  UPDATE public.estimate_line_items
     SET cost_basis_repaired_at = now()
   WHERE estimate_id = _estimate_id
     AND archived_at IS NULL
     AND is_price_overridden = false
     AND COALESCE(pricing_source,'') NOT IN ('contractor','manual');

  v_band := public.rebuild_estimate_ballpark(_estimate_id);

  SELECT jsonb_build_object(
      'lines', count(*),
      'laborHours', round(COALESCE(sum(labor_hours),0), 2),
      'unresolved', count(*) FILTER (WHERE resolution_status = 'unresolved'))
    INTO v_after
  FROM public.estimate_line_items
  WHERE estimate_id = _estimate_id AND archived_at IS NULL;

  INSERT INTO public.estimate_audit_events (
    organization_id, project_id, estimate_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_e.organization_id, v_e.project_id, _estimate_id,
    'pricing_repaired', 'estimate', _estimate_id,
    'Authoritative calculator repair applied',
    jsonb_build_object('before', v_before, 'after', v_after,
                       'geometry', v_geo, 'pricing', v_priced, 'ballpark', v_band));

  RETURN jsonb_build_object('before', v_before, 'after', v_after,
    'geometry', v_geo, 'pricing', v_priced, 'ballpark', v_band);
END $$;
REVOKE ALL ON FUNCTION public.repair_estimate_pricing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_estimate_pricing(uuid) TO authenticated, service_role;
