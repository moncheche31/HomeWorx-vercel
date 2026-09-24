
DROP FUNCTION IF EXISTS public.nce_labor_multiplier(text) CASCADE;
CREATE FUNCTION public.nce_labor_multiplier(_location text DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  /*
   * Default basis is the "New Hampshire Average" row. A ZIP prefix is NOT a
   * city: 038 covers many towns, not just Dover, so an inferred city factor
   * would silently misprice. A city factor applies only when named exactly.
   */
  SELECT 1 + COALESCE(
    (SELECT total_weighted_avg_pct
       FROM public.area_modification_factors_nce2026
      WHERE _location IS NOT NULL
        AND lower(btrim(_location)) = lower(location)
      LIMIT 1),
    (SELECT total_weighted_avg_pct
       FROM public.area_modification_factors_nce2026
      WHERE location = 'New Hampshire Average' LIMIT 1),
    0
  ) / 100.0;
$$;
REVOKE ALL ON FUNCTION public.nce_labor_multiplier(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nce_labor_multiplier(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_book_labor_rates(_estimate_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_est public.estimates%ROWTYPE;
  v_location text := NULL; /* NH state average unless a city is pinned */
  v_factor numeric;
  r record;
  v_craft_code text;
  v_craft text;
  v_rate numeric;
  v_updated integer := 0;
BEGIN
  SELECT * INTO v_est FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;

  v_factor := public.nce_labor_multiplier(v_location);
  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.quantity, li.labor_hours_per_unit, li.labor_rate,
           li.trade_key, li.catalog_item_key
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _estimate_id
       AND li.archived_at IS NULL
       AND li.rate_override_at IS NULL
       AND COALESCE(li.is_price_overridden, false) = false
       AND COALESCE(li.labor_hours, 0) > 0
  LOOP
    SELECT ca.craft_code INTO v_craft_code
      FROM public.catalog_assemblies ca
     WHERE ca.assembly_key = r.catalog_item_key LIMIT 1;

    SELECT c.craft INTO v_craft FROM public.nce_craft_codes c
     WHERE c.code = upper(btrim(COALESCE(v_craft_code, '')));
    IF v_craft IS NULL THEN v_craft := public.nce_craft_for_trade(r.trade_key); END IF;

    v_rate := public.nce_labor_rate(v_craft_code, r.trade_key, v_location);
    CONTINUE WHEN v_rate IS NULL OR v_rate = r.labor_rate;

    UPDATE public.estimate_line_items li
       SET labor_rate = v_rate,
           labor_hours_formula = format(
             '%s x %s hr/unit at $%s/hr (NCE 2026 %s, NH factor %s)',
             r.quantity, COALESCE(r.labor_hours_per_unit, 0), v_rate, v_craft, v_factor),
           pricing_provenance = COALESCE(li.pricing_provenance, '{}'::jsonb)
             || jsonb_build_object('laborRateBasis', jsonb_build_object(
                  'source', 'nce_2026_craft_wage',
                  'craftCode', v_craft_code,
                  'craft', v_craft,
                  'areaFactor', v_factor,
                  'hourlyRate', v_rate,
                  'appliedAt', now())),
           priced_at = now()
     WHERE li.id = r.id;
    v_updated := v_updated + 1;
  END LOOP;

  PERFORM set_config('vw.kb_pricing', 'off', true);
  RETURN v_updated;
END
$$;
REVOKE ALL ON FUNCTION public.apply_book_labor_rates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_book_labor_rates(uuid) TO authenticated, service_role;
