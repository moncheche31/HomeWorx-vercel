DROP FUNCTION IF EXISTS public.kb_repricing_targets(uuid);

CREATE OR REPLACE FUNCTION public.apply_pinned_catalog_productivity(_estimate_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_count int := 0;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;

  WITH lib AS (SELECT * FROM public.kb_resolved_assemblies(v_e.organization_id)),
  fixed AS (
    UPDATE public.estimate_line_items li SET
      labor_hours_per_unit = public.assembly_hours_per_unit(
        a.productivity_convention, a.default_labor_hours, a.production_rate),
      labor_hours_setup = COALESCE(a.setup_hours, 0),
      labor_hours_basis = 'catalog_production',
      labor_convention = 'hours_per_unit',
      labor_rate = CASE WHEN COALESCE(li.labor_rate,0) = 0 THEN v_e.default_labor_rate
                        ELSE li.labor_rate END,
      material_cost = CASE WHEN COALESCE(li.material_cost,0) = 0
                           THEN round(COALESCE(a.material_allowance,0)
                                      * (1 + COALESCE(a.waste_factor,0)), 2)
                           ELSE li.material_cost END,
      pricing_provenance = COALESCE(li.pricing_provenance,'{}'::jsonb)
        || jsonb_build_object(
             'productivityConvention', a.productivity_convention,
             'laborConvention', 'hours_per_unit',
             'laborHoursPerUnit', public.assembly_hours_per_unit(
               a.productivity_convention, a.default_labor_hours, a.production_rate),
             'setupHours', COALESCE(a.setup_hours, 0),
             'rateSource', 'pinned_catalog_item')
    FROM lib a
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.is_price_overridden = false
      AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual')
      AND li.catalog_item_key = a.assembly_key
      AND public.is_labor_bearing_basis(COALESCE(li.cost_basis, a.cost_basis))
      AND COALESCE(li.labor_hours_per_unit, 0) = 0
      AND public.assembly_hours_per_unit(a.productivity_convention,
            a.default_labor_hours, a.production_rate) IS NOT NULL
    RETURNING 1)
  SELECT count(*) INTO v_count FROM fixed;

  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.apply_pinned_catalog_productivity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_pinned_catalog_productivity(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.repair_estimate_pricing(_estimate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_geo jsonb; v_priced jsonb; v_band jsonb;
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
                       'pricing', v_priced, 'pinnedRates', v_pinned, 'ballpark', v_band));

  RETURN jsonb_build_object('before', v_before, 'after', v_after, 'geometry', v_geo,
    'pricing', v_priced, 'pinnedRates', v_pinned, 'ballpark', v_band);
END $$;
REVOKE ALL ON FUNCTION public.repair_estimate_pricing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_estimate_pricing(uuid) TO authenticated, service_role;
