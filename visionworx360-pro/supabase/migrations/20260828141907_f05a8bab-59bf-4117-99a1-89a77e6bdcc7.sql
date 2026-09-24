
-- 1. US state code -> name (for matching "<State> Average" rows)
CREATE TABLE IF NOT EXISTS public.us_state_codes (
  code text PRIMARY KEY,
  name text NOT NULL
);
GRANT SELECT ON public.us_state_codes TO authenticated, anon;
GRANT ALL ON public.us_state_codes TO service_role;
ALTER TABLE public.us_state_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "State codes are readable" ON public.us_state_codes;
CREATE POLICY "State codes are readable" ON public.us_state_codes FOR SELECT USING (true);

INSERT INTO public.us_state_codes (code, name) VALUES
 ('AL','Alabama'),('AK','Alaska'),('AZ','Arizona'),('AR','Arkansas'),('CA','California'),
 ('CO','Colorado'),('CT','Connecticut'),('DE','Delaware'),('DC','District of Columbia'),
 ('FL','Florida'),('GA','Georgia'),('HI','Hawaii'),('ID','Idaho'),('IL','Illinois'),
 ('IN','Indiana'),('IA','Iowa'),('KS','Kansas'),('KY','Kentucky'),('LA','Louisiana'),
 ('ME','Maine'),('MD','Maryland'),('MA','Massachusetts'),('MI','Michigan'),('MN','Minnesota'),
 ('MS','Mississippi'),('MO','Missouri'),('MT','Montana'),('NE','Nebraska'),('NV','Nevada'),
 ('NH','New Hampshire'),('NJ','New Jersey'),('NM','New Mexico'),('NY','New York'),
 ('NC','North Carolina'),('ND','North Dakota'),('OH','Ohio'),('OK','Oklahoma'),('OR','Oregon'),
 ('PA','Pennsylvania'),('RI','Rhode Island'),('SC','South Carolina'),('SD','South Dakota'),
 ('TN','Tennessee'),('TX','Texas'),('UT','Utah'),('VT','Vermont'),('VA','Virginia'),
 ('WA','Washington'),('WV','West Virginia'),('WI','Wisconsin'),('WY','Wyoming')
ON CONFLICT (code) DO NOTHING;

-- 2. Area factor table: parsed zip range + state-average flag
ALTER TABLE public.area_modification_factors_nce2026
  ADD COLUMN IF NOT EXISTS zip_low integer,
  ADD COLUMN IF NOT EXISTS zip_high integer,
  ADD COLUMN IF NOT EXISTS is_state_average boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.nce_area_factor_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  v := btrim(COALESCE(NEW.zip_prefix, ''));
  NEW.zip_low := NULL;
  NEW.zip_high := NULL;

  -- Only numeric 3-digit prefixes participate in zip matching. A prefix is a
  -- RANGE, never a city: "032-033" covers every town in those prefixes.
  IF v ~ '^[0-9]{3}$' THEN
    NEW.zip_low := v::int;
    NEW.zip_high := v::int;
  ELSIF v ~ '^[0-9]{3}\s*-\s*[0-9]{3}$' THEN
    NEW.zip_low := split_part(replace(v, ' ', ''), '-', 1)::int;
    NEW.zip_high := split_part(replace(v, ' ', ''), '-', 2)::int;
  END IF;

  NEW.is_state_average := (NEW.zip_low IS NULL)
    AND (btrim(COALESCE(NEW.location, '')) ILIKE '%Average');
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_nce_area_factor_normalize ON public.area_modification_factors_nce2026;
CREATE TRIGGER trg_nce_area_factor_normalize
  BEFORE INSERT OR UPDATE ON public.area_modification_factors_nce2026
  FOR EACH ROW EXECUTE FUNCTION public.nce_area_factor_normalize();

UPDATE public.area_modification_factors_nce2026 SET location = location;

CREATE INDEX IF NOT EXISTS idx_nce_area_zip
  ON public.area_modification_factors_nce2026 (zip_low, zip_high);
CREATE INDEX IF NOT EXISTS idx_nce_area_location
  ON public.area_modification_factors_nce2026 (lower(location));

-- 3. Estimate-level resolved job-site location
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS pricing_location text,
  ADD COLUMN IF NOT EXISTS pricing_location_source text,
  ADD COLUMN IF NOT EXISTS pricing_location_override text,
  ADD COLUMN IF NOT EXISTS pricing_location_factors jsonb;

-- 4. Resolution: override -> zip prefix range -> state average -> national baseline
CREATE OR REPLACE FUNCTION public.nce_resolve_location(
  _postal text DEFAULT NULL,
  _state text DEFAULT NULL,
  _override text DEFAULT NULL
)
RETURNS TABLE (
  location text,
  match_source text,
  material_pct numeric,
  labor_pct numeric,
  equipment_pct numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_zip3 integer;
  v_state_name text;
  r record;
BEGIN
  -- (a) explicit contractor override, matched by exact book location name
  IF NULLIF(btrim(COALESCE(_override, '')), '') IS NOT NULL THEN
    SELECT a.* INTO r FROM public.area_modification_factors_nce2026 a
     WHERE lower(a.location) = lower(btrim(_override)) LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT r.location, 'manual_override'::text,
        COALESCE(r.material_pct,0), COALESCE(r.labor_pct,0), COALESCE(r.equipment_pct,0);
      RETURN;
    END IF;
  END IF;

  -- (b) zip prefix, but ONLY when the job zip falls inside the row's range
  IF btrim(COALESCE(_postal, '')) ~ '^[0-9]{3}' THEN
    v_zip3 := substring(btrim(_postal) from 1 for 3)::int;
    SELECT a.* INTO r FROM public.area_modification_factors_nce2026 a
     WHERE a.zip_low IS NOT NULL
       AND v_zip3 BETWEEN a.zip_low AND a.zip_high
     ORDER BY (a.zip_high - a.zip_low) ASC
     LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT r.location, 'zip_prefix'::text,
        COALESCE(r.material_pct,0), COALESCE(r.labor_pct,0), COALESCE(r.equipment_pct,0);
      RETURN;
    END IF;
  END IF;

  -- (c) state average for the job's state
  IF NULLIF(btrim(COALESCE(_state, '')), '') IS NOT NULL THEN
    SELECT s.name INTO v_state_name FROM public.us_state_codes s
     WHERE upper(s.code) = upper(btrim(_state)) OR lower(s.name) = lower(btrim(_state))
     LIMIT 1;
    IF v_state_name IS NOT NULL THEN
      SELECT a.* INTO r FROM public.area_modification_factors_nce2026 a
       WHERE a.is_state_average
         AND lower(a.location) = lower(v_state_name || ' Average')
       LIMIT 1;
      IF FOUND THEN
        RETURN QUERY SELECT r.location, 'state_average'::text,
          COALESCE(r.material_pct,0), COALESCE(r.labor_pct,0), COALESCE(r.equipment_pct,0);
        RETURN;
      END IF;
    END IF;
  END IF;

  -- (d) national baseline, explicitly flagged (never a silent state guess)
  RETURN QUERY SELECT 'National Baseline'::text, 'national_baseline'::text,
    0::numeric, 0::numeric, 0::numeric;
END
$$;

-- Resolve for an estimate from its project's property address (or override)
CREATE OR REPLACE FUNCTION public.nce_estimate_location(_estimate_id uuid)
RETURNS TABLE (
  location text,
  match_source text,
  material_pct numeric,
  labor_pct numeric,
  equipment_pct numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT r.*
    FROM public.estimates e
    LEFT JOIN public.projects p ON p.id = e.project_id
    LEFT JOIN public.properties pr ON pr.id = p.property_id
    CROSS JOIN LATERAL public.nce_resolve_location(
      pr.postal_code, pr.region, e.pricing_location_override
    ) r
   WHERE e.id = _estimate_id;
$$;

-- 5. Separate labor and material multipliers, no NH default
CREATE OR REPLACE FUNCTION public.nce_labor_multiplier(_location text DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  /*
   * Location is the resolved job-site book location NAME. Unknown or NULL means
   * the national baseline (1.0) — never a hardcoded state. Labor uses labor_pct,
   * which diverges sharply from the blended average (MA: material +2%, labor +24%).
   */
  SELECT 1 + COALESCE(
    (SELECT a.labor_pct
       FROM public.area_modification_factors_nce2026 a
      WHERE lower(a.location) = lower(btrim(COALESCE(_location, '')))
      LIMIT 1), 0) / 100.0;
$$;

CREATE OR REPLACE FUNCTION public.nce_material_multiplier(_location text DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT 1 + COALESCE(
    (SELECT a.material_pct
       FROM public.area_modification_factors_nce2026 a
      WHERE lower(a.location) = lower(btrim(COALESCE(_location, '')))
      LIMIT 1), 0) / 100.0;
$$;

-- 6. Labor rate pass uses the JOB SITE location
CREATE OR REPLACE FUNCTION public.apply_book_labor_rates(_estimate_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_est public.estimates%ROWTYPE;
  v_loc record;
  v_factor numeric;
  r record;
  v_craft_code text;
  v_craft text;
  v_rate numeric;
  v_updated integer := 0;
BEGIN
  SELECT * INTO v_est FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;

  SELECT * INTO v_loc FROM public.nce_estimate_location(_estimate_id);
  v_factor := public.nce_labor_multiplier(v_loc.location);

  UPDATE public.estimates e
     SET pricing_location = v_loc.location,
         pricing_location_source = v_loc.match_source,
         pricing_location_factors = jsonb_build_object(
           'materialPct', v_loc.material_pct,
           'laborPct', v_loc.labor_pct,
           'equipmentPct', v_loc.equipment_pct,
           'laborMultiplier', v_factor,
           'materialMultiplier', public.nce_material_multiplier(v_loc.location),
           'resolvedAt', now())
   WHERE e.id = _estimate_id;

  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.quantity, li.labor_hours_per_unit, li.labor_rate,
           li.trade_key, li.catalog_item_key,
           COALESCE(li.pricing_provenance->'bookPricing'->>'craftCode',
                    li.pricing_provenance->'bookSource'->>'craftCode') AS book_craft
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _estimate_id
       AND li.archived_at IS NULL
       AND li.rate_override_at IS NULL
       AND COALESCE(li.is_price_overridden, false) = false
       AND COALESCE(li.labor_hours, 0) > 0
  LOOP
    v_craft_code := NULLIF(btrim(COALESCE(r.book_craft, '')), '');

    IF v_craft_code IS NULL THEN
      SELECT ca.craft_code INTO v_craft_code
        FROM public.catalog_assemblies ca
       WHERE ca.assembly_key = r.catalog_item_key LIMIT 1;
    END IF;

    SELECT c.craft INTO v_craft FROM public.nce_craft_codes c
     WHERE c.code = upper(btrim(COALESCE(v_craft_code, '')));
    IF v_craft IS NULL THEN v_craft := public.nce_craft_for_trade(r.trade_key); END IF;

    v_rate := public.nce_labor_rate(v_craft_code, r.trade_key, v_loc.location);
    CONTINUE WHEN v_rate IS NULL OR v_rate = r.labor_rate;

    UPDATE public.estimate_line_items li
       SET labor_rate = v_rate,
           labor_hours_formula = format(
             '%s x %s hr/unit at $%s/hr (NCE 2026 %s, %s labor factor %s)',
             r.quantity, COALESCE(r.labor_hours_per_unit, 0), v_rate, v_craft,
             v_loc.location, v_factor),
           pricing_provenance = COALESCE(li.pricing_provenance, '{}'::jsonb)
             || jsonb_build_object('laborRateBasis', jsonb_build_object(
                  'source', 'nce_2026_craft_wage',
                  'craftCode', v_craft_code,
                  'craft', v_craft,
                  'location', v_loc.location,
                  'locationSource', v_loc.match_source,
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
$function$;

-- 7. Book material pricing adjusted by the job-site MATERIAL factor
CREATE OR REPLACE FUNCTION public.apply_book_line_pricing(_estimate_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  r record; b record; v_scale numeric; v_craft text; v_hours numeric;
  v_mat numeric; v_hpu numeric; v_updated integer := 0;
  v_loc record; v_mat_factor numeric;
BEGIN
  SELECT * INTO v_loc FROM public.nce_estimate_location(_estimate_id);
  v_mat_factor := public.nce_material_multiplier(v_loc.location);

  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.quantity, li.unit_key::text AS unit_key, li.cost_basis,
           li.material_cost, li.labor_hours_per_unit,
           (li.pricing_provenance->'bookSource'->>'refId')::int AS ref_id
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _estimate_id
       AND li.archived_at IS NULL
       AND li.rate_override_at IS NULL
       AND COALESCE(li.is_price_overridden, false) = false
       AND li.cost_basis NOT IN ('permit_fee', 'allowance', 'other_direct_cost')
       AND li.pricing_provenance->'bookSource'->>'source' = 'cost_reference_nce2026'
  LOOP
    CONTINUE WHEN r.ref_id IS NULL;
    SELECT * INTO b FROM public.cost_reference_nce2026 WHERE id = r.ref_id;
    CONTINUE WHEN b IS NULL;

    v_scale := public.nce_unit_scale(b.unit, r.unit_key);
    CONTINUE WHEN v_scale IS NULL;

    SELECT p.craft_code, p.hours INTO v_craft, v_hours
      FROM public.nce_craft_hours_parts(b.craft_hours) p;

    v_mat := round(COALESCE(b.material, 0) * v_scale * v_mat_factor, 4);
    v_hpu := round(COALESCE(v_hours, 0) * v_scale, 6);
    CONTINUE WHEN v_mat <= 0 AND v_hpu <= 0;

    /* Partial book rows keep the existing value rather than zeroing it. */
    IF v_mat <= 0 THEN v_mat := COALESCE(r.material_cost, 0); END IF;
    IF v_hpu <= 0 THEN v_hpu := COALESCE(r.labor_hours_per_unit, 0); END IF;

    UPDATE public.estimate_line_items li
       SET material_cost = v_mat,
           labor_hours_per_unit = v_hpu,
           labor_hours = round(COALESCE(r.quantity, 0) * v_hpu, 4),
           labor_hours_basis = CASE WHEN v_hpu > 0 THEN 'catalog_production'
                                    ELSE li.labor_hours_basis END,
           labor_convention = CASE WHEN v_hpu > 0 THEN 'hours_per_unit'
                                   ELSE li.labor_convention END,
           cost_basis_source = 'nce_2026_book',
           pricing_source = 'nce_2026_book',
           resolution_status = 'resolved'::public.line_resolution_status,
           unresolved_reason = NULL,
           pricing_provenance = COALESCE(li.pricing_provenance, '{}'::jsonb)
             || jsonb_build_object('bookPricing', jsonb_build_object(
                  'referenceId', b.id, 'description', b.description,
                  'section', b.section, 'bookUnit', b.unit,
                  'unitScale', v_scale, 'bookMaterial', b.material,
                  'bookCraftHours', b.craft_hours, 'craftCode', v_craft,
                  'materialPerUnit', v_mat, 'hoursPerUnit', v_hpu,
                  'location', v_loc.location,
                  'locationSource', v_loc.match_source,
                  'materialFactor', v_mat_factor,
                  'appliedAt', now())),
           priced_at = now()
     WHERE li.id = r.id;
    v_updated := v_updated + 1;
  END LOOP;

  PERFORM set_config('vw.kb_pricing', 'off', true);
  RETURN v_updated;
END
$function$;
