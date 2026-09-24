REVOKE EXECUTE ON FUNCTION public.repair_quantity_evidence(uuid) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.repair_estimate_pricing(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_geo jsonb; v_geo2 jsonb; v_priced jsonb; v_band jsonb; v_bind jsonb; v_evi jsonb;
  v_pinned int;
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

  v_bind := public.bind_unpriced_estimate_lines(_estimate_id);
  -- Evidence gate first: strip quantities that no longer belong to the task.
  v_evi := public.repair_quantity_evidence(_estimate_id);
  v_geo := public.derive_geometry_quantities(_estimate_id);
  v_priced := public.kb_apply_pricing(_estimate_id, NULL, false);
  v_geo2 := public.derive_geometry_quantities(_estimate_id);
  IF COALESCE((v_geo2->>'updated')::int, 0) > 0 THEN
    v_priced := public.kb_apply_pricing(_estimate_id, NULL, false);
  END IF;
  v_pinned := public.apply_pinned_catalog_productivity(_estimate_id);
  PERFORM public.repair_quantity_evidence(_estimate_id);

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

  RETURN jsonb_build_object('before', v_before, 'after', v_after,
    'bound', v_bind, 'evidence', v_evi, 'geometry', v_geo, 'priced', v_priced,
    'pinned', v_pinned, 'ballpark', v_band);
END
$function$;
