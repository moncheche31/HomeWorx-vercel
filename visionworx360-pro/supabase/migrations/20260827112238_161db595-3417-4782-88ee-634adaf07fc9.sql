CREATE OR REPLACE FUNCTION public.apply_ballpark_task_pricing(
  _estimate_id uuid,
  _tasks jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_est public.estimates%ROWTYPE;
  v_task jsonb;
  v_feature_key text;
  v_quantity numeric;
  v_labor_hours numeric;
  v_labor_cost numeric;
  v_material_total numeric;
  v_other_total numeric;
  v_labor_rate numeric;
  v_updated integer := 0;
  v_rows integer := 0;
BEGIN
  SELECT * INTO v_est FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;
  PERFORM public.assert_project_in_active_org(v_est.project_id);
  IF v_est.locked_at IS NOT NULL OR v_est.superseded_by_id IS NOT NULL
     OR v_est.status IN ('approved','sent','accepted','declined','superseded')
  THEN RAISE EXCEPTION 'estimate_locked'; END IF;
  IF COALESCE(v_est.intake_mode, '') <> 'ballpark' THEN
    RAISE EXCEPTION 'ballpark_estimate_required';
  END IF;
  IF jsonb_typeof(_tasks) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_ballpark_tasks';
  END IF;

  PERFORM set_config('vw.kb_pricing', 'on', true);
  FOR v_task IN SELECT value FROM jsonb_array_elements(_tasks)
  LOOP
    v_feature_key := NULLIF(btrim(v_task->>'id'), '');
    v_quantity := NULLIF(v_task->>'quantity', '')::numeric;
    v_labor_hours := GREATEST(COALESCE(NULLIF(v_task->>'laborHours', '')::numeric, 0), 0);
    v_labor_cost := GREATEST(COALESCE(NULLIF(v_task->>'laborCost', '')::numeric, 0), 0);
    v_material_total := GREATEST(COALESCE(NULLIF(v_task->>'materialCost', '')::numeric, 0), 0);
    v_other_total := GREATEST(COALESCE(NULLIF(v_task->>'otherCost', '')::numeric, 0), 0);
    v_labor_rate := CASE WHEN v_labor_hours > 0 THEN round(v_labor_cost / v_labor_hours, 2) ELSE 0 END;
    CONTINUE WHEN v_feature_key IS NULL OR v_quantity IS NULL OR v_quantity <= 0;

    UPDATE public.estimate_line_items li
       SET quantity = v_quantity,
           unit_key = COALESCE(NULLIF(v_task->>'unitKey', '')::public.scope_unit, li.unit_key),
           is_quantity_placeholder = false,
           quantity_basis = CASE WHEN COALESCE(si.quantity_basis, '') = 'assumed' THEN 'ballpark_allowance' ELSE li.quantity_basis END,
           quantity_basis_note = COALESCE(si.quantity_basis_note, li.quantity_basis_note),
           labor_hours_per_unit = CASE WHEN v_labor_hours > 0 THEN round(v_labor_hours / v_quantity, 4) ELSE 0 END,
           labor_hours_setup = 0,
           labor_hours = round(v_labor_hours * 4) / 4,
           labor_rate = v_labor_rate,
           material_cost = round(v_material_total / v_quantity, 2),
           equipment_cost = 0,
           subcontractor_cost = 0,
           other_cost = round(v_other_total / v_quantity, 2),
           cost_basis = 'labor_production',
           cost_basis_source = 'ballpark_snapshot',
           labor_hours_basis = 'ballpark_snapshot',
           labor_convention = 'hours_per_unit',
           labor_hours_formula = format('%s x %s hr/unit — selected ballpark snapshot', v_quantity, round(CASE WHEN v_quantity > 0 THEN v_labor_hours / v_quantity ELSE 0 END, 4)),
           pricing_source = 'ballpark_snapshot',
           catalog_item_key = NULL,
           catalog_mapping_source = 'contractor',
           priced_at = now(),
           resolution_status = 'resolved',
           unresolved_reason = NULL,
           pricing_provenance = jsonb_strip_nulls(jsonb_build_object(
             'source', 'selected_ballpark_snapshot', 'featureKey', v_feature_key,
             'assemblyKey', v_task->>'assemblyKey', 'pricingBasis', v_task->>'pricingBasis',
             'needsReview', COALESCE((v_task->>'needsReview')::boolean, false),
             'quantityBasis', v_task->>'quantityBasis', 'quantity', v_quantity,
             'unitKey', v_task->>'unitKey', 'laborHours', v_labor_hours,
             'laborCost', v_labor_cost, 'materialCost', v_material_total,
             'otherCost', v_other_total,
             'total', COALESCE(NULLIF(v_task->>'total', '')::numeric, v_labor_cost + v_material_total + v_other_total),
             'appliedAt', now()
           ))
      FROM public.scope_items si
     WHERE li.estimate_id = _estimate_id
       AND li.scope_item_id = si.id
       AND li.archived_at IS NULL AND si.archived_at IS NULL
       AND si.scope_item_key = 'photos_video:' || v_feature_key
       AND COALESCE(si.quantity, 0) > 0
       AND COALESCE(li.is_price_overridden, false) = false
       AND COALESCE(li.pricing_source, '') NOT IN ('contractor', 'manual');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_updated := v_updated + v_rows;
  END LOOP;
  PERFORM set_config('vw.kb_pricing', 'off', true);
  RETURN v_updated;
END
$function$;

REVOKE ALL ON FUNCTION public.apply_ballpark_task_pricing(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_ballpark_task_pricing(uuid, jsonb) TO authenticated, service_role;
