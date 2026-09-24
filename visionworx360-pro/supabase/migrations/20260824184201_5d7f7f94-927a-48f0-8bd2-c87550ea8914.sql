CREATE OR REPLACE FUNCTION public.clear_generic_fallback_residue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_basis public.task_cost_basis;
BEGIN
  IF COALESCE(NEW.pricing_source, '') <> 'knowledge_base'
     OR COALESCE(NEW.cost_basis_source, '') <> 'generic_trade_fallback' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_basis := NULLIF(NEW.pricing_provenance->>'costBasis', '')::public.task_cost_basis;
  EXCEPTION WHEN others THEN
    v_basis := NULL;
  END;
  v_basis := COALESCE(v_basis, NEW.cost_basis);

  NEW.cost_basis := v_basis;
  NEW.cost_basis_source := 'catalog';

  IF NOT public.is_fee_basis(v_basis) THEN
    NEW.other_cost := 0;
  END IF;

  NEW.pricing_provenance :=
    (COALESCE(NEW.pricing_provenance, '{}'::jsonb) - 'genericTradeFallback')
    || jsonb_build_object('clearedGenericFallbackAt', now());

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS eli_clear_generic_fallback_residue ON public.estimate_line_items;
CREATE TRIGGER eli_clear_generic_fallback_residue
  BEFORE INSERT OR UPDATE ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION public.clear_generic_fallback_residue();

CREATE OR REPLACE FUNCTION public.repair_generic_fallback_residue(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_repaired int := 0;
BEGIN
  IF _estimate_id IS NULL THEN RAISE EXCEPTION 'estimate_id_required'; END IF;
  SELECT organization_id INTO v_org FROM public.estimates WHERE id = _estimate_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'estimate_not_found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_org) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  PERFORM set_config('vw.kb_pricing', 'on', true);

  WITH touched AS (
    UPDATE public.estimate_line_items
       SET updated_at = now()
     WHERE estimate_id = _estimate_id
       AND archived_at IS NULL
       AND COALESCE(pricing_source, '') = 'knowledge_base'
       AND COALESCE(cost_basis_source, '') = 'generic_trade_fallback'
    RETURNING 1)
  SELECT count(*) INTO v_repaired FROM touched;

  PERFORM set_config('vw.kb_pricing', 'off', true);

  RETURN jsonb_build_object('repaired', v_repaired);
END
$function$;

CREATE OR REPLACE FUNCTION public.repair_estimate_pricing(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_geo jsonb; v_geo2 jsonb; v_priced jsonb; v_band jsonb; v_bind jsonb; v_evi jsonb;
  v_residue jsonb;
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

  PERFORM public.resync_estimate_scope_quantities(_estimate_id);
  v_bind := public.bind_unpriced_estimate_lines(_estimate_id);
  v_evi := public.repair_quantity_evidence(_estimate_id);
  v_geo := public.derive_geometry_quantities(_estimate_id);
  v_priced := public.kb_apply_pricing(_estimate_id, NULL, false);
  v_geo2 := public.derive_geometry_quantities(_estimate_id);
  IF COALESCE((v_geo2->>'updated')::int, 0) > 0 THEN
    v_priced := public.kb_apply_pricing(_estimate_id, NULL, false);
  END IF;
  v_pinned := public.apply_pinned_catalog_productivity(_estimate_id);
  PERFORM public.repair_quantity_evidence(_estimate_id);
  v_residue := public.repair_generic_fallback_residue(_estimate_id);

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
    'pinned', v_pinned, 'residue', v_residue, 'ballpark', v_band);
END
$function$;
