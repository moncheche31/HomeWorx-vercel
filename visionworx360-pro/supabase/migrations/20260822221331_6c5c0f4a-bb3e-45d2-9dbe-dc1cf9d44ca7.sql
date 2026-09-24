CREATE OR REPLACE FUNCTION public.repair_estimate_pricing(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_geo jsonb; v_priced jsonb; v_band jsonb; v_bind jsonb;
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

  -- Order matters: bind lines to the catalog first so geometry derivation can
  -- see them, then apply measured quantities, and only then compute money.
  v_bind := public.bind_unpriced_estimate_lines(_estimate_id);
  v_geo := public.derive_geometry_quantities(_estimate_id);
  v_priced := public.kb_apply_pricing(_estimate_id, NULL, false);
  v_pinned := public.apply_pinned_catalog_productivity(_estimate_id);

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
    jsonb_build_object('before', v_before, 'after', v_after, 'geometry', v_geo,
                       'pricing', v_priced, 'binding', v_bind,
                       'pinnedRates', v_pinned, 'ballpark', v_band));

  RETURN jsonb_build_object('before', v_before, 'after', v_after, 'geometry', v_geo,
    'pricing', v_priced, 'binding', v_bind, 'pinnedRates', v_pinned, 'ballpark', v_band);
END
$fn$;
