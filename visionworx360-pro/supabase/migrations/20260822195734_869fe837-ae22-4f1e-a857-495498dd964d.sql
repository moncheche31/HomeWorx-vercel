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
      AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual','unmatched')
      AND li.pricing_source IS NOT NULL
      AND li.quantity_reviewed_at IS NULL
      AND public.is_measured_unit(li.unit_key::text)
      AND COALESCE(li.is_quantity_placeholder, false)
      AND COALESCE(li.quantity, 0) <= 1
  ),
  applied AS (
    UPDATE public.estimate_line_items li SET
      quantity = round((v_geo->>c.surface)::numeric, 2),
      is_quantity_placeholder = false,
      quantity_basis = 'geometry_derived',
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

/* A contractor-confirmed catalog MATCH is not a contractor-authored PRICE:
   re-price it against its own pinned assembly instead of leaving it rateless. */
CREATE OR REPLACE FUNCTION public.kb_repricing_targets(_estimate_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT li.id FROM public.estimate_line_items li
  WHERE li.estimate_id = _estimate_id
    AND li.archived_at IS NULL
    AND li.is_price_overridden = false
    AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual');
$$;
REVOKE ALL ON FUNCTION public.kb_repricing_targets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kb_repricing_targets(uuid) TO authenticated, service_role;
