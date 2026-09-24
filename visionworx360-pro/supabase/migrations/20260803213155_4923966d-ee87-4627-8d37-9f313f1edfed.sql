CREATE OR REPLACE FUNCTION public.apply_composite_assembly(
  _line_id uuid,
  _composite_key text,
  _components jsonb,
  _quantity numeric DEFAULT NULL::numeric,
  _unit_key public.scope_unit DEFAULT NULL::public.scope_unit,
  _description text DEFAULT NULL::text,
  _pricing jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_li public.estimate_line_items%ROWTYPE;
  v_qty numeric;
  v_unit public.scope_unit;
  v_comp jsonb;
  v_key text;
  v_role text;
  v_factor numeric;
  v_comp_qty numeric;
  v_idx int := 0;
  v_target uuid;
  v_line_ids uuid[] := ARRAY[]::uuid[];
  a RECORD;
BEGIN
  v_li := public.assert_editable_estimate_line(_line_id);

  IF _components IS NULL OR jsonb_typeof(_components) <> 'array'
     OR jsonb_array_length(_components) = 0 THEN
    RAISE EXCEPTION 'composite_components_required' USING ERRCODE = '22023';
  END IF;

  v_qty := COALESCE(_quantity, v_li.quantity, 0);
  IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023'; END IF;
  v_unit := COALESCE(_unit_key, v_li.unit_key);

  /* Every component must resolve before anything is written. */
  FOR v_comp IN SELECT * FROM jsonb_array_elements(_components) LOOP
    v_key := v_comp->>'assemblyKey';
    SELECT r.assembly_key INTO a
      FROM public.kb_resolved_assemblies(v_li.organization_id) r
     WHERE r.assembly_key = v_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'composite_component_missing:%', v_key USING ERRCODE = '42501';
    END IF;
  END LOOP;

  /* Refresh: drop previously generated sibling lines for this composite. */
  UPDATE public.estimate_line_items li
     SET archived_at = now()
   WHERE li.estimate_id = v_li.estimate_id
     AND li.id <> _line_id
     AND li.archived_at IS NULL
     AND li.is_price_overridden = false
     AND li.pricing_provenance->'composite'->>'sourceLineId' = _line_id::text;

  FOR v_comp IN SELECT * FROM jsonb_array_elements(_components) LOOP
    v_key := v_comp->>'assemblyKey';
    v_role := COALESCE(v_comp->>'role', v_key);
    v_factor := COALESCE((v_comp->>'quantityFactor')::numeric, 1);
    v_comp_qty := round(v_qty * v_factor, 4);

    IF v_idx = 0 THEN
      /* First component keeps the original line: scope link, audit, documents. */
      v_target := _line_id;
    ELSE
      INSERT INTO public.estimate_line_items (
        organization_id, project_id, estimate_id, scope_item_id, scope_section_id,
        room_id, group_label, description, category_key, subcategory_key, trade_key,
        quantity, unit_key, labor_rate, overhead_pct, profit_pct, contingency_pct,
        is_taxable, is_client_visible, sort_order, created_by
      ) VALUES (
        v_li.organization_id, v_li.project_id, v_li.estimate_id, v_li.scope_item_id,
        v_li.scope_section_id, v_li.room_id, v_li.group_label,
        COALESCE(NULLIF(btrim(_description), ''), v_li.description),
        v_li.category_key, v_li.subcategory_key, v_li.trade_key,
        v_comp_qty, v_unit, v_li.labor_rate, v_li.overhead_pct, v_li.profit_pct,
        v_li.contingency_pct, v_li.is_taxable, v_li.is_client_visible,
        v_li.sort_order + v_idx, COALESCE(auth.uid(), v_li.created_by)
      ) RETURNING id INTO v_target;
    END IF;

    PERFORM public.confirm_estimate_line_catalog(
      v_target, v_key, v_comp_qty, v_unit,
      CASE WHEN v_idx = 0 THEN NULLIF(btrim(_description), '') ELSE NULL END,
      _pricing);

    /* Durable component provenance on top of the catalog provenance. */
    UPDATE public.estimate_line_items li
       SET pricing_provenance = li.pricing_provenance || jsonb_build_object(
             'composite', jsonb_build_object(
               'compositeKey', _composite_key,
               'role', v_role,
               'componentIndex', v_idx,
               'quantityFactor', v_factor,
               'baseQuantity', v_qty,
               'sourceLineId', _line_id,
               'appliedAt', now()
             ))
     WHERE li.id = v_target;

    v_line_ids := v_line_ids || v_target;
    v_idx := v_idx + 1;
  END LOOP;

  INSERT INTO public.estimate_audit_events (
    organization_id, project_id, estimate_id, event_type, entity_type, entity_id,
    summary, metadata)
  VALUES (v_li.organization_id, v_li.project_id, v_li.estimate_id,
    'composite_assembly_applied', 'estimate_line_item', _line_id,
    _composite_key,
    jsonb_build_object('compositeKey', _composite_key, 'quantity', v_qty,
      'unitKey', v_unit, 'lineIds', to_jsonb(v_line_ids)));

  RETURN jsonb_build_object(
    'sourceLineId', _line_id,
    'compositeKey', _composite_key,
    'quantity', v_qty,
    'lineIds', to_jsonb(v_line_ids));
END $function$;

REVOKE ALL ON FUNCTION public.apply_composite_assembly(uuid, text, jsonb, numeric, public.scope_unit, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_composite_assembly(uuid, text, jsonb, numeric, public.scope_unit, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_composite_assembly(uuid, text, jsonb, numeric, public.scope_unit, text, jsonb) TO service_role;
