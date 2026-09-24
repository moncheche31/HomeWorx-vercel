CREATE OR REPLACE FUNCTION public.price_unmatched_lines(_estimate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rate numeric := 65;
  v_org uuid;
  r RECORD; v_trade text; v_rule jsonb; v_amount numeric; v_priced int := 0; v_skipped int := 0;
BEGIN
  IF _estimate_id IS NULL THEN RAISE EXCEPTION 'estimate_id_required'; END IF;
  SELECT organization_id, COALESCE(NULLIF(default_labor_rate,0), 65)
    INTO v_org, v_rate FROM public.estimates WHERE id = _estimate_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'estimate_not_found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_org) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  FOR r IN
    SELECT * FROM public.estimate_line_items
    WHERE estimate_id = _estimate_id AND archived_at IS NULL
      AND resolution_status = 'unresolved'
      AND NOT COALESCE(is_price_overridden, false)
      AND COALESCE(pricing_source,'') NOT IN ('contractor','manual')
      AND NOT public.is_fee_basis(cost_basis)
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

    UPDATE public.estimate_line_items SET
      trade_key = COALESCE(NULLIF(trade_key,'unassigned'), v_trade),
      trade_source = COALESCE(trade_source, 'inferred'),
      cost_basis = 'allowance',
      cost_basis_source = 'generic_trade_fallback',
      labor_hours = 0, labor_hours_per_unit = 0, labor_hours_setup = 0,
      labor_convention = 'none',
      /* Allowance rolls labour into the dollar amount; no separate hours. */
      labor_hours_basis = 'fee_no_labor',
      labor_hours_formula = 'allowance includes labour and material',
      material_cost = 0, equipment_cost = 0, subcontractor_cost = 0,
      other_cost = v_amount,
      is_quantity_placeholder = false,
      quantity_basis = 'ballpark_allowance',
      quantity_basis_note = 'No catalog assembly covers this task yet. Priced from a generic '
        || v_trade || ' allowance rate - review before the detailed estimate.',
      pricing_source = 'generic_fallback',
      pricing_provenance = COALESCE(pricing_provenance,'{}'::jsonb) || jsonb_build_object(
        'genericTradeFallback', v_rule || jsonb_build_object(
          'laborRate', v_rate, 'allowancePerUnit', v_amount, 'appliedAt', now())),
      resolution_status = 'resolved', unresolved_reason = NULL,
      priced_at = now(), updated_at = now()
    WHERE id = r.id;
    v_priced := v_priced + 1;
  END LOOP;

  RETURN jsonb_build_object('priced', v_priced, 'stillUnpriced', v_skipped);
END $fn$;

REVOKE ALL ON FUNCTION public.price_unmatched_lines(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.price_unmatched_lines(uuid) TO authenticated, service_role;
