CREATE OR REPLACE FUNCTION public.money_round(_v numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT round(COALESCE(_v, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.round_estimate_line_money()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.labor_total := public.money_round(COALESCE(NEW.labor_total, COALESCE(NEW.labor_hours,0) * COALESCE(NEW.labor_rate,0)));
  NEW.material_total := public.money_round(COALESCE(NEW.material_total, COALESCE(NEW.material_cost,0) * COALESCE(NEW.quantity,0)));
  NEW.equipment_total := public.money_round(COALESCE(NEW.equipment_total, COALESCE(NEW.equipment_cost,0) * COALESCE(NEW.quantity,0)));
  NEW.subcontractor_total := public.money_round(COALESCE(NEW.subcontractor_total, COALESCE(NEW.subcontractor_cost,0) * COALESCE(NEW.quantity,0)));
  NEW.other_total := public.money_round(COALESCE(NEW.other_total, COALESCE(NEW.other_cost,0) * COALESCE(NEW.quantity,0)));
  NEW.direct_cost := public.money_round(
    COALESCE(NEW.labor_total,0) + COALESCE(NEW.material_total,0) + COALESCE(NEW.equipment_total,0)
    + COALESCE(NEW.subcontractor_total,0) + COALESCE(NEW.other_total,0));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_round_estimate_line_money ON public.estimate_line_items;
CREATE TRIGGER zz_round_estimate_line_money
BEFORE INSERT OR UPDATE ON public.estimate_line_items
FOR EACH ROW EXECUTE FUNCTION public.round_estimate_line_money();

CREATE OR REPLACE FUNCTION public.estimate_invariant_cost(_estimate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_target boolean;
  r RECORD;
  v_labor_hours numeric := 0; v_labor numeric := 0; v_material numeric := 0;
  v_equipment numeric := 0; v_sub numeric := 0; v_other numeric := 0;
  v_direct numeric := 0; v_oh numeric := 0; v_profit numeric := 0;
  v_cont numeric := 0; v_taxable numeric := 0;
  v_job numeric; v_subtotal numeric; v_tax numeric; v_margin numeric;
  v_resolved int := 0; v_unresolved int := 0;
  v_line_direct numeric; v_line_oh numeric; v_line_profit numeric; v_line_cont numeric;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;
  v_target := v_e.pricing_method = 'target_gross_margin';

  SELECT count(*) FILTER (WHERE resolution_status = 'unresolved') INTO v_unresolved
  FROM public.estimate_line_items
  WHERE estimate_id = _estimate_id AND archived_at IS NULL;

  FOR r IN
    SELECT * FROM public.estimate_line_items
    WHERE estimate_id = _estimate_id AND archived_at IS NULL
      AND resolution_status = 'resolved'
  LOOP
    v_resolved := v_resolved + 1;
    /* Whole-dollar money policy: every extension is a whole dollar. */
    v_line_direct := public.money_round(COALESCE(r.labor_hours,0) * COALESCE(r.labor_rate,0))
                   + public.money_round(COALESCE(r.material_cost,0) * COALESCE(r.quantity,0))
                   + public.money_round(COALESCE(r.equipment_cost,0) * COALESCE(r.quantity,0))
                   + public.money_round(COALESCE(r.subcontractor_cost,0) * COALESCE(r.quantity,0))
                   + public.money_round(COALESCE(r.other_cost,0) * COALESCE(r.quantity,0));
    v_labor_hours := v_labor_hours + COALESCE(r.labor_hours,0);
    v_labor := v_labor + public.money_round(COALESCE(r.labor_hours,0) * COALESCE(r.labor_rate,0));
    v_material := v_material + public.money_round(COALESCE(r.material_cost,0) * COALESCE(r.quantity,0));
    v_equipment := v_equipment + public.money_round(COALESCE(r.equipment_cost,0) * COALESCE(r.quantity,0));
    v_sub := v_sub + public.money_round(COALESCE(r.subcontractor_cost,0) * COALESCE(r.quantity,0));
    v_other := v_other + public.money_round(COALESCE(r.other_cost,0) * COALESCE(r.quantity,0));

    v_line_oh := CASE WHEN v_target THEN 0 ELSE public.money_round(v_line_direct * COALESCE(r.overhead_pct,0) / 100) END;
    v_line_profit := CASE WHEN v_target THEN 0
                     ELSE public.money_round((v_line_direct + v_line_oh) * COALESCE(r.profit_pct,0) / 100) END;
    v_line_cont := public.money_round((v_line_direct + v_line_oh + v_line_profit) * COALESCE(r.contingency_pct,0) / 100);

    v_direct := v_direct + v_line_direct;
    v_oh := v_oh + v_line_oh;
    v_profit := v_profit + v_line_profit;
    v_cont := v_cont + v_line_cont;
    IF r.is_taxable THEN
      v_taxable := v_taxable + (v_line_direct + v_line_oh + v_line_profit + v_line_cont);
    END IF;
  END LOOP;

  v_job := public.money_round(v_direct + v_cont);
  IF v_target THEN
    v_margin := LEAST(GREATEST(COALESCE(v_e.target_gross_margin_pct,0), 0), 95);
    v_subtotal := CASE WHEN v_margin > 0 THEN public.money_round(v_job / (1 - v_margin / 100)) ELSE v_job END;
    v_taxable := CASE WHEN v_job > 0 THEN public.money_round(v_taxable * (v_subtotal / v_job)) ELSE 0 END;
  ELSE
    v_subtotal := public.money_round(v_direct + v_oh + v_profit + v_cont);
  END IF;
  v_tax := public.money_round(v_taxable * COALESCE(v_e.tax_rate,0) / 100);

  RETURN jsonb_build_object(
    'currency', v_e.currency,
    'laborHours', round(v_labor_hours, 2), 'laborCost', public.money_round(v_labor),
    'materialCost', public.money_round(v_material), 'equipmentCost', public.money_round(v_equipment),
    'subcontractorCost', public.money_round(v_sub), 'otherCost', public.money_round(v_other),
    'directCost', public.money_round(v_direct), 'contingency', public.money_round(v_cont),
    'jobCost', v_job, 'overhead', public.money_round(v_oh), 'profit', public.money_round(v_profit),
    'canonicalSubtotal', v_subtotal, 'canonicalGrandTotal', public.money_round(v_subtotal + v_tax),
    'taxableSubtotal', public.money_round(v_taxable),
    'pricing', jsonb_build_object(
      'method', v_e.pricing_method,
      'targetGrossMarginPct', CASE WHEN v_target THEN v_e.target_gross_margin_pct ELSE NULL END,
      'overheadPct', CASE WHEN v_target THEN NULL ELSE v_e.default_overhead_pct END,
      'profitPct', CASE WHEN v_target THEN NULL ELSE v_e.default_profit_pct END,
      'contingencyPct', v_e.default_contingency_pct,
      'laborRate', v_e.default_labor_rate),
    'engineVersion', v_e.pricing_engine_version,
    'resolvedLines', v_resolved, 'unresolvedLines', v_unresolved,
    'computedAt', now());
END $function$;

CREATE OR REPLACE FUNCTION public.rebuild_estimate_ballpark(_estimate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_cost jsonb; v_snap jsonb; v_prior jsonb; v_tiers jsonb;
  v_expected numeric; v_spread numeric; v_unresolved int;
  v_band jsonb; v_ballpark jsonb; v_original jsonb;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;

  v_cost := public.estimate_invariant_cost(_estimate_id);
  v_expected := public.money_round((v_cost->>'canonicalGrandTotal')::numeric);
  IF COALESCE(v_expected,0) <= 0 THEN
    RETURN jsonb_build_object('rebuilt', false, 'reason', 'no_priced_lines');
  END IF;

  v_unresolved := COALESCE((v_cost->>'unresolvedLines')::int, 0);
  v_spread := LEAST(0.10 + 0.02 * v_unresolved, 0.35);

  v_snap := COALESCE(v_e.range_snapshot, '{}'::jsonb);
  v_prior := CASE
    WHEN v_snap->>'kind' = 'ballpark' OR v_snap->>'mode' = 'ballpark' THEN v_snap
    ELSE v_snap->'ballpark' END;
  v_tiers := CASE
    WHEN jsonb_typeof(v_snap->'finishTiers') = 'object' THEN v_snap->'finishTiers'
    WHEN jsonb_typeof(v_snap->'tiers') = 'array' THEN v_snap
    ELSE NULL END;

  v_original := COALESCE(v_prior->'originalBallpark', v_prior - 'previous');
  v_original := v_original - 'previous' - 'originalBallpark';

  /* Whole-dollar money policy: bands never carry cents. */
  v_band := jsonb_build_object(
    'low', public.money_round(v_expected * (1 - v_spread)),
    'expected', v_expected,
    'high', public.money_round(v_expected * (1 + v_spread)));

  v_ballpark := jsonb_strip_nulls(jsonb_build_object(
    'kind', 'ballpark',
    'currency', v_e.currency,
    'band', v_band,
    'confidence', CASE WHEN v_unresolved = 0 THEN 'high'
                       WHEN v_unresolved <= 3 THEN 'medium' ELSE 'low' END,
    'savedAt', now(),
    'calculatedAt', now(),
    'source', 'detailed_invariant_cost',
    'spreadPct', round(v_spread * 100, 2),
    'unresolvedLineCount', v_unresolved,
    'selectedPosition', COALESCE(v_prior->>'selectedPosition', 'expected'),
    'costBasis', v_cost,
    'originalBallpark', v_original,
    'previous', CASE WHEN v_prior IS NULL THEN NULL
                     ELSE (v_prior - 'previous' - 'originalBallpark' - 'costBasis') END));

  UPDATE public.estimates SET
    range_snapshot = jsonb_strip_nulls(jsonb_build_object(
      'version', 2, 'ballpark', v_ballpark, 'finishTiers', v_tiers)),
    reconciliation_snapshot = jsonb_build_object(
      'rebuiltAt', now(), 'source', 'rebuild_estimate_ballpark',
      'recommended', v_expected,
      'detailedGrandTotal', v_expected,
      'delta', 0, 'costBasis', v_cost),
    updated_at = now()
  WHERE id = _estimate_id;

  RETURN jsonb_build_object('rebuilt', true, 'band', v_band, 'costBasis', v_cost);
END $function$;
