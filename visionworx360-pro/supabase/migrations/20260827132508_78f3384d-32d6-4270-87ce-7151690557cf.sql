CREATE OR REPLACE FUNCTION public.apply_ballpark_task_pricing(_estimate_id uuid, _tasks jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_est public.estimates%ROWTYPE; v_task jsonb; v_feature_key text;
  v_quantity numeric; v_source_hours numeric; v_labor_cost numeric;
  v_material_total numeric; v_other_total numeric;
  v_hours_per_unit numeric; v_rate numeric; v_material_unit numeric; v_other_unit numeric;
  v_updated integer := 0; v_rows integer := 0;
BEGIN
  SELECT * INTO v_est FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;
  PERFORM public.assert_project_in_active_org(v_est.project_id);
  IF v_est.locked_at IS NOT NULL OR v_est.superseded_by_id IS NOT NULL
     OR v_est.status IN ('approved','sent','accepted','declined','superseded')
  THEN RAISE EXCEPTION 'estimate_locked'; END IF;
  IF COALESCE(v_est.intake_mode, '') <> 'ballpark' THEN RAISE EXCEPTION 'ballpark_estimate_required'; END IF;
  IF jsonb_typeof(_tasks) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_ballpark_tasks'; END IF;

  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR v_task IN SELECT value FROM jsonb_array_elements(_tasks) LOOP
    v_feature_key := NULLIF(btrim(v_task->>'id'), '');
    v_quantity := NULLIF(v_task->>'quantity', '')::numeric;
    v_source_hours := GREATEST(COALESCE(NULLIF(v_task->>'laborHours', '')::numeric, 0), 0);
    v_labor_cost := GREATEST(COALESCE(NULLIF(v_task->>'laborCost', '')::numeric, 0), 0);
    v_material_total := GREATEST(COALESCE(NULLIF(v_task->>'materialCost', '')::numeric, 0), 0);
    v_other_total := GREATEST(COALESCE(NULLIF(v_task->>'otherCost', '')::numeric, 0), 0);

    CONTINUE WHEN v_feature_key IS NULL OR v_quantity IS NULL OR v_quantity <= 0;

    /* Real components only. Labor is a production rate; material is a real
       per-unit cost. Nothing is solved backwards from a target total. */
    v_hours_per_unit := CASE WHEN v_source_hours > 0 THEN round(v_source_hours / v_quantity, 4) ELSE 0 END;
    v_rate := CASE WHEN v_source_hours > 0 AND v_labor_cost > 0
                   THEN round(v_labor_cost / v_source_hours, 2) ELSE 0 END;
    v_material_unit := round(v_material_total / v_quantity, 4);
    v_other_unit := round(v_other_total / v_quantity, 4);

    CONTINUE WHEN v_hours_per_unit <= 0 AND v_material_unit <= 0 AND v_other_unit <= 0;

    UPDATE public.estimate_line_items li
       SET quantity = v_quantity,
           unit_key = COALESCE(NULLIF(v_task->>'unitKey', '')::public.scope_unit, li.unit_key),
           is_quantity_placeholder = false,
           quantity_basis = CASE WHEN COALESCE(si.quantity_basis, '') = 'assumed'
                                 THEN 'ballpark_allowance' ELSE li.quantity_basis END,
           quantity_basis_note = COALESCE(si.quantity_basis_note, li.quantity_basis_note),
           labor_hours_per_unit = v_hours_per_unit,
           labor_hours_setup = 0,
           labor_hours = round(v_quantity * v_hours_per_unit, 4),
           labor_rate = v_rate,
           material_cost = v_material_unit,
           equipment_cost = 0,
           subcontractor_cost = 0,
           other_cost = v_other_unit,
           cost_basis = CASE WHEN v_hours_per_unit > 0 THEN 'labor_production'::public.task_cost_basis
                             ELSE 'material_unit'::public.task_cost_basis END,
           cost_basis_source = 'catalog',
           labor_hours_basis = 'catalog_production',
           labor_convention = 'hours_per_unit',
           labor_hours_formula = format('%s x %s hr/unit at $%s/hr', v_quantity, v_hours_per_unit, v_rate),
           pricing_source = 'ballpark_catalog',
           catalog_item_key = NULLIF(v_task->>'assemblyKey', ''),
           catalog_mapping_source = 'auto',
           priced_at = now(),
           pricing_provenance = jsonb_strip_nulls(jsonb_build_object(
             'source', 'ballpark_catalog_rate',
             'assemblyKey', v_task->>'assemblyKey',
             'pricingBasis', v_task->>'pricingBasis',
             'needsReview', COALESCE((v_task->>'needsReview')::boolean, false),
             'quantityBasis', v_task->>'quantityBasis',
             'quantity', v_quantity,
             'unitKey', v_task->>'unitKey',
             'laborHoursPerUnit', v_hours_per_unit,
             'laborRate', v_rate,
             'materialCostPerUnit', v_material_unit,
             'otherCostPerUnit', v_other_unit,
             'appliedAt', now()))
      FROM public.scope_items si
     WHERE li.estimate_id = _estimate_id AND li.scope_item_id = si.id
       AND li.archived_at IS NULL AND si.archived_at IS NULL
       AND si.scope_item_key = 'photos_video:' || v_feature_key
       AND COALESCE(si.quantity, 0) > 0
       AND COALESCE(li.is_price_overridden, false) = false
       AND COALESCE(li.pricing_source, '') NOT IN ('contractor', 'manual');
    GET DIAGNOSTICS v_rows = ROW_COUNT; v_updated := v_updated + v_rows;
  END LOOP;

  PERFORM set_config('vw.kb_pricing', 'off', true);
  RETURN v_updated;
END
$fn$;
