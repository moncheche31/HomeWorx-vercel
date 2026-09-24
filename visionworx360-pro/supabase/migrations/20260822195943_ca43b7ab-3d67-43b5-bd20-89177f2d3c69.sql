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
  v_expected := (v_cost->>'canonicalGrandTotal')::numeric;
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

  /* Keep exactly one generation of history plus the untouched original. */
  v_original := COALESCE(v_prior->'originalBallpark', v_prior - 'previous');
  v_original := v_original - 'previous' - 'originalBallpark';

  v_band := jsonb_build_object(
    'low', round(v_expected * (1 - v_spread), 2),
    'expected', round(v_expected, 2),
    'high', round(v_expected * (1 + v_spread), 2));

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
      'recommended', round(v_expected, 2),
      'detailedGrandTotal', round(v_expected, 2),
      'delta', 0, 'costBasis', v_cost),
    updated_at = now()
  WHERE id = _estimate_id;

  RETURN jsonb_build_object('rebuilt', true, 'band', v_band, 'costBasis', v_cost);
END $function$;
REVOKE ALL ON FUNCTION public.rebuild_estimate_ballpark(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebuild_estimate_ballpark(uuid) TO authenticated, service_role;
