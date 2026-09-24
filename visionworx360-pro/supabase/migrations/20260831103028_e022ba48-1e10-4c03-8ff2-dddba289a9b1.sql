COMMENT ON COLUMN public.area_modification_factors_nce2026.total_weighted_avg_pct IS 'DISPLAY ONLY. Never use for pricing: apply labor_pct, material_pct and equipment_pct to their own cost components.';

CREATE OR REPLACE FUNCTION public.nce_location_factors(_estimate_id uuid)
RETURNS TABLE (
  location text,
  match_source text,
  material_pct numeric,
  labor_pct numeric,
  equipment_pct numeric,
  material_factor numeric,
  labor_factor numeric,
  equipment_factor numeric,
  display_total_pct numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT l.location, l.match_source,
         COALESCE(l.material_pct, 0),
         COALESCE(l.labor_pct, 0),
         COALESCE(l.equipment_pct, 0),
         1 + COALESCE(l.material_pct, 0) / 100.0,
         1 + COALESCE(l.labor_pct, 0) / 100.0,
         1 + COALESCE(l.equipment_pct, 0) / 100.0,
         COALESCE(
           (SELECT a.total_weighted_avg_pct
              FROM public.area_modification_factors_nce2026 a
             WHERE lower(a.location) = lower(l.location) LIMIT 1), 0)
    FROM public.nce_estimate_location(_estimate_id) l;
$$;

REVOKE EXECUTE ON FUNCTION public.nce_location_factors(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nce_location_factors(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.nce_sync_estimate_location(_estimate_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_loc record;
BEGIN
  SELECT * INTO v_loc FROM public.nce_location_factors(_estimate_id);
  UPDATE public.estimates e
     SET pricing_location = v_loc.location,
         pricing_location_source = v_loc.match_source,
         pricing_location_factors = jsonb_build_object(
           'materialPct', v_loc.material_pct,
           'laborPct', v_loc.labor_pct,
           'equipmentPct', v_loc.equipment_pct,
           'materialMultiplier', v_loc.material_factor,
           'laborMultiplier', v_loc.labor_factor,
           'equipmentMultiplier', v_loc.equipment_factor,
           'displayTotalPct', v_loc.display_total_pct,
           'displayTotalIsReferenceOnly', true,
           'resolvedAt', now())
   WHERE e.id = _estimate_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.nce_sync_estimate_location(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nce_sync_estimate_location(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.nce_labor_rate(text, text, text);
CREATE FUNCTION public.nce_labor_rate(_craft_code text, _trade_key text, _location text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE v_craft text; v_base numeric;
BEGIN
  SELECT craft INTO v_craft FROM public.nce_craft_codes
   WHERE code = upper(btrim(COALESCE(_craft_code, '')));
  IF v_craft IS NULL THEN v_craft := public.nce_craft_for_trade(_trade_key); END IF;

  SELECT total_hourly_cost INTO v_base
    FROM public.labor_wage_rates_nce2026 WHERE craft = v_craft LIMIT 1;
  IF v_base IS NULL THEN
    SELECT total_hourly_cost INTO v_base
      FROM public.labor_wage_rates_nce2026 WHERE craft = 'Carpenter' LIMIT 1;
  END IF;
  IF v_base IS NULL THEN RETURN NULL; END IF;

  RETURN round(v_base * public.nce_labor_multiplier(_location), 2);
END $$;

REVOKE EXECUTE ON FUNCTION public.nce_labor_rate(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nce_labor_rate(text, text, text) TO authenticated, service_role;
