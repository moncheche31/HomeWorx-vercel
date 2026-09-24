CREATE OR REPLACE FUNCTION public.derive_geometry_quantities(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_est public.estimates%ROWTYPE;
  v_geo jsonb;
  v_measurement uuid;
  v_updated int := 0;
  v_assumed int := 0;
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
      -- Contractor/manual/unmatched quantities are authoritative and untouched.
      -- A NULL source means "not priced yet" (freshly inserted line), which is
      -- exactly the case that most needs measured geometry.
      AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual','unmatched')
      AND li.quantity_reviewed_at IS NULL
      AND public.is_measured_unit(li.unit_key::text)
      AND COALESCE(li.is_quantity_placeholder, false)
      AND COALESCE(li.quantity, 0) <= 1
  ),
  applied AS (
    UPDATE public.estimate_line_items li SET
      quantity = round((v_geo->>c.surface)::numeric, 2),
      is_quantity_placeholder = false,
      quantity_basis = public.geometry_basis_kind(c.surface),
      quantity_source_measurement_id = v_measurement,
      quantity_basis_note = CASE
        WHEN c.surface = 'structuralSpanLf'
          THEN 'Assumed from the widest measured room span (' || (v_geo->>c.surface) || ' ft). Confirm the engineered length.'
        ELSE 'Derived from saved project measurements (' || c.surface || ')' END,
      quantity_basis_formula = jsonb_build_object('surface', c.surface, 'geometry', v_geo),
      pricing_provenance = COALESCE(li.pricing_provenance,'{}'::jsonb)
        || jsonb_build_object('quantity', jsonb_build_object(
             'source', public.geometry_basis_kind(c.surface), 'surface', c.surface,
             'value',(v_geo->>c.surface)::numeric,'derivedAt', now()))
    FROM candidate c
    WHERE li.id = c.id
      AND c.surface IS NOT NULL
      AND COALESCE((v_geo->>c.surface)::numeric, 0) > 0
    RETURNING li.quantity_basis)
  SELECT count(*), count(*) FILTER (WHERE quantity_basis = 'assumed')
    INTO v_updated, v_assumed FROM applied;

  RETURN jsonb_build_object('updated', v_updated, 'assumed', v_assumed, 'geometry', v_geo);
END
$fn$;

CREATE OR REPLACE FUNCTION public.repair_estimate_pricing(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_geo jsonb; v_geo2 jsonb; v_priced jsonb; v_band jsonb; v_bind jsonb;
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
  v_geo := public.derive_geometry_quantities(_estimate_id);
  v_priced := public.kb_apply_pricing(_estimate_id, NULL, false);
  -- Second pass: catalog binding during pricing can reveal a surface mapping
  -- that was not knowable before. Re-derive, then re-price if anything moved.
  v_geo2 := public.derive_geometry_quantities(_estimate_id);
  IF COALESCE((v_geo2->>'updated')::int, 0) > 0 THEN
    v_priced := public.kb_apply_pricing(_estimate_id, NULL, false);
  END IF;
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
                       'geometrySecondPass', v_geo2 - 'geometry',
                       'pricing', v_priced, 'binding', v_bind,
                       'pinnedRates', v_pinned, 'ballpark', v_band));

  RETURN jsonb_build_object('before', v_before, 'after', v_after, 'geometry', v_geo,
    'geometrySecondPass', v_geo2 - 'geometry',
    'pricing', v_priced, 'binding', v_bind, 'pinnedRates', v_pinned, 'ballpark', v_band);
END
$fn$;
