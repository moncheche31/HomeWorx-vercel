-- 1) Quantity-only contractor edits must NOT masquerade as price overrides.
CREATE OR REPLACE FUNCTION public.set_estimate_line_manual_pricing(
  _line_id uuid, _quantity numeric DEFAULT NULL, _unit_key scope_unit DEFAULT NULL,
  _description text DEFAULT NULL, _labor_hours numeric DEFAULT NULL, _labor_rate numeric DEFAULT NULL,
  _material_cost numeric DEFAULT NULL, _equipment_cost numeric DEFAULT NULL,
  _subcontractor_cost numeric DEFAULT NULL, _other_cost numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_li public.estimate_line_items%ROWTYPE;
  v_qty numeric;
  v_priced boolean;
BEGIN
  v_li := public.assert_editable_estimate_line(_line_id);
  v_qty := COALESCE(_quantity, v_li.quantity, 1);
  IF v_qty < 0 THEN RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023'; END IF;

  /*
   * A price override is claimed ONLY when the contractor actually supplied a
   * cost or hours input. A quantity/description edit alone used to stamp
   * is_price_overridden = true, which permanently excluded the line from every
   * pricing pipeline and left it "resolved" at $0.
   */
  v_priced := (_labor_hours IS NOT NULL OR _labor_rate IS NOT NULL OR _material_cost IS NOT NULL
    OR _equipment_cost IS NOT NULL OR _subcontractor_cost IS NOT NULL OR _other_cost IS NOT NULL);

  UPDATE public.estimate_line_items li SET
    description = COALESCE(NULLIF(btrim(_description), ''), li.description),
    quantity = v_qty,
    unit_key = COALESCE(_unit_key, li.unit_key),
    labor_hours = GREATEST(COALESCE(_labor_hours, li.labor_hours), 0),
    labor_rate = GREATEST(COALESCE(_labor_rate, li.labor_rate), 0),
    material_cost = GREATEST(COALESCE(_material_cost, li.material_cost), 0),
    equipment_cost = GREATEST(COALESCE(_equipment_cost, li.equipment_cost), 0),
    subcontractor_cost = GREATEST(COALESCE(_subcontractor_cost, li.subcontractor_cost), 0),
    other_cost = GREATEST(COALESCE(_other_cost, li.other_cost), 0),
    is_price_overridden = CASE WHEN v_priced THEN true ELSE li.is_price_overridden END,
    pricing_source = CASE WHEN v_priced THEN 'contractor' ELSE li.pricing_source END,
    priced_at = CASE WHEN v_priced THEN now() ELSE li.priced_at END,
    is_quantity_placeholder = false,
    quantity_reviewed_by = auth.uid(),
    quantity_reviewed_at = now(),
    pricing_provenance = jsonb_strip_nulls(jsonb_build_object(
      'mappingSource', CASE WHEN v_priced THEN 'contractor_manual' ELSE 'contractor_quantity' END,
      'confirmedBy', auth.uid(),
      'confirmedAt', now(),
      'quantity', v_qty,
      'contractorPriced', v_priced,
      'previous', COALESCE(li.pricing_provenance, '{}'::jsonb)
    ))
  WHERE li.id = _line_id;

  INSERT INTO public.estimate_audit_events (
    organization_id, project_id, estimate_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_li.organization_id, v_li.project_id, v_li.estimate_id,
    CASE WHEN v_priced THEN 'line_manual_priced' ELSE 'line_quantity_reviewed' END,
    'estimate_line_item', _line_id, v_li.description,
    jsonb_build_object('quantity', v_qty, 'contractorPriced', v_priced));

  RETURN jsonb_build_object('lineId', _line_id, 'contractorPriced', v_priced);
END $function$;

-- 2) Release phantom overrides: "contractor" lines with no contractor money at all.
CREATE OR REPLACE FUNCTION public.clear_phantom_price_overrides(_estimate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_cleared int := 0;
BEGIN
  WITH released AS (
    UPDATE public.estimate_line_items li SET
      is_price_overridden = false,
      pricing_source = 'unmatched',
      resolution_status = 'unresolved',
      unresolved_reason = COALESCE(NULLIF(li.unresolved_reason,''), 'zero_contractor_price'),
      pricing_provenance = COALESCE(li.pricing_provenance,'{}'::jsonb)
        || jsonb_build_object('phantomOverrideClearedAt', now())
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND (li.is_price_overridden OR COALESCE(li.pricing_source,'') IN ('contractor','manual'))
      AND COALESCE(li.direct_cost,0) = 0
      AND COALESCE(li.labor_rate,0) = 0
      AND COALESCE(li.material_cost,0) = 0
      AND COALESCE(li.equipment_cost,0) = 0
      AND COALESCE(li.subcontractor_cost,0) = 0
      AND COALESCE(li.other_cost,0) = 0
      AND NOT public.is_fee_basis(COALESCE(li.cost_basis,'labor_production'::public.task_cost_basis))
      AND li.rate_override_at IS NULL
      AND li.rate_override_hours_per_unit IS NULL
      AND li.rate_override_setup_hours IS NULL
      AND li.rate_override_labor_rate IS NULL
      AND li.rate_override_material_unit_cost IS NULL
      AND COALESCE(li.pricing_provenance->>'contractorPriced','false') <> 'true'
      AND COALESCE(li.pricing_provenance->>'noCharge','false') <> 'true'
    RETURNING 1)
  SELECT count(*) INTO v_cleared FROM released;
  RETURN jsonb_build_object('cleared', v_cleared);
END $function$;

-- 3) A zero-dollar non-fee line is never a valid resolved price.
CREATE OR REPLACE FUNCTION public.flag_zero_priced_estimate_lines(_estimate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_flagged int := 0;
BEGIN
  WITH flagged AS (
    UPDATE public.estimate_line_items li SET
      resolution_status = 'unresolved',
      unresolved_reason = COALESCE(NULLIF(li.unresolved_reason,''), 'zero_price_no_evidence')
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.resolution_status = 'resolved'
      AND COALESCE(li.quantity,0) > 0
      AND COALESCE(li.direct_cost,0) = 0
      AND NOT public.is_fee_basis(COALESCE(li.cost_basis,'labor_production'::public.task_cost_basis))
      AND COALESCE(li.pricing_provenance->>'noCharge','false') <> 'true'
    RETURNING 1)
  SELECT count(*) INTO v_flagged FROM flagged;
  RETURN jsonb_build_object('flagged', v_flagged);
END $function$;

GRANT EXECUTE ON FUNCTION public.clear_phantom_price_overrides(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.flag_zero_priced_estimate_lines(uuid) TO authenticated, service_role;

-- 4) Wire both guards into the canonical repair pipeline.
CREATE OR REPLACE FUNCTION public.repair_estimate_pricing(_estimate_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_geo jsonb; v_geo2 jsonb; v_priced jsonb; v_band jsonb; v_bind jsonb; v_evi jsonb;
  v_residue jsonb; v_phantom jsonb; v_zero jsonb;
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

  v_phantom := public.clear_phantom_price_overrides(_estimate_id);
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
  v_zero := public.flag_zero_priced_estimate_lines(_estimate_id);

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
    'pinned', v_pinned, 'residue', v_residue, 'phantomOverrides', v_phantom,
    'zeroPriced', v_zero, 'ballpark', v_band);
END
$function$;
