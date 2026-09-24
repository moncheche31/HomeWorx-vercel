CREATE OR REPLACE FUNCTION public.price_unmatched_lines(_estimate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rate numeric := 65;
  v_org uuid;
  r RECORD; v_trade text; v_rule jsonb; v_amount numeric;
  v_priced int := 0; v_skipped int := 0; v_collapsed int := 0;
  v_evidenced boolean; v_qty numeric; v_unit public.scope_unit; v_note text;
BEGIN
  IF _estimate_id IS NULL THEN RAISE EXCEPTION 'estimate_id_required'; END IF;
  SELECT organization_id, COALESCE(NULLIF(default_labor_rate,0), 65)
    INTO v_org, v_rate FROM public.estimates WHERE id = _estimate_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'estimate_not_found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_org) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT * FROM public.estimate_line_items
    WHERE estimate_id = _estimate_id AND archived_at IS NULL
      AND NOT COALESCE(is_price_overridden, false)
      AND COALESCE(pricing_source,'') NOT IN ('contractor','manual')
      AND NOT public.is_fee_basis(cost_basis)
      /* Re-check lines this routine owns so rule fixes propagate. */
      AND (resolution_status = 'unresolved' OR COALESCE(pricing_source,'') = 'generic_fallback')
  LOOP
    v_trade := CASE WHEN COALESCE(r.trade_key,'unassigned') <> 'unassigned' THEN r.trade_key
                    ELSE public.infer_trade_key(r.description, r.category_key) END;
    v_rule := public.generic_trade_fallback_rate(v_trade, r.unit_key::text);
    IF v_rule IS NULL OR COALESCE(r.quantity,0) <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_amount := public.money_round(
      public.round_quarter_hour((v_rule->>'laborHoursPerUnit')::numeric) * v_rate
      + (v_rule->>'materialCostPerUnit')::numeric);
    IF v_amount <= 0 THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    v_evidenced := COALESCE(r.pricing_provenance->'genericTradeFallback'->>'quantityEvidenced','')= 'true'
      OR COALESCE(r.quantity_basis,'') IN
        ('measurement','geometry_derived','contractor_entered','scope_stated_count')
      OR r.quantity_reviewed_at IS NOT NULL;
    v_qty := r.quantity; v_unit := r.unit_key;
    v_note := 'No catalog assembly covers this task yet. Priced from a generic '
      || v_trade || ' allowance rate - review before the detailed estimate.';

    IF NOT v_evidenced AND r.quantity > 1 THEN
      v_qty := 1; v_unit := 'allowance';
      v_collapsed := v_collapsed + 1;
      v_note := 'No catalog assembly and no confirmed quantity. Priced as a single '
        || v_trade || ' allowance (original quantity ' || trim(to_char(r.quantity,'FM999999.99'))
        || ' ' || r.unit_key::text || ' kept in history) - confirm the real quantity.';
    END IF;

    UPDATE public.estimate_line_items SET
      trade_key = COALESCE(NULLIF(trade_key,'unassigned'), v_trade),
      trade_source = COALESCE(trade_source, 'inferred'),
      cost_basis = 'allowance',
      cost_basis_source = 'generic_trade_fallback',
      quantity = v_qty,
      unit_key = v_unit,
      labor_hours = 0, labor_hours_per_unit = 0, labor_hours_setup = 0,
      labor_convention = 'none',
      labor_hours_basis = 'fee_no_labor',
      labor_hours_formula = 'allowance includes labour and material',
      material_cost = 0, equipment_cost = 0, subcontractor_cost = 0,
      other_cost = v_amount,
      is_quantity_placeholder = false,
      quantity_basis = 'ballpark_allowance',
      quantity_basis_note = v_note,
      pricing_source = 'generic_fallback',
      pricing_provenance = COALESCE(pricing_provenance,'{}'::jsonb) || jsonb_build_object(
        'genericTradeFallback', v_rule || jsonb_build_object(
          'laborRate', v_rate, 'allowancePerUnit', v_amount,
          'originalQuantity', COALESCE(
            (r.pricing_provenance->'genericTradeFallback'->>'originalQuantity')::numeric, r.quantity),
          'originalUnit', COALESCE(
            r.pricing_provenance->'genericTradeFallback'->>'originalUnit', r.unit_key::text),
          'quantityEvidenced', v_evidenced, 'appliedAt', now())),
      resolution_status = 'resolved', unresolved_reason = NULL,
      priced_at = now(), updated_at = now()
    WHERE id = r.id;
    v_priced := v_priced + 1;
  END LOOP;

  RETURN jsonb_build_object('priced', v_priced, 'collapsedToAllowance', v_collapsed,
                            'stillUnpriced', v_skipped);
END $fn$;

REVOKE ALL ON FUNCTION public.price_unmatched_lines(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.price_unmatched_lines(uuid) TO authenticated, service_role;
