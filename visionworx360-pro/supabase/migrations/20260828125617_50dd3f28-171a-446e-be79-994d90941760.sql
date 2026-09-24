
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

/* ---------------------------------------------------------------- *
 * 1. Book craft codes -> craft wage rows
 * ---------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS public.nce_craft_codes (
  code text PRIMARY KEY,
  craft text NOT NULL,
  is_assumed boolean NOT NULL DEFAULT false,
  note text,
  source_version text NOT NULL DEFAULT 'nce-2026',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.nce_craft_codes TO authenticated;
GRANT ALL ON public.nce_craft_codes TO service_role;
ALTER TABLE public.nce_craft_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users read craft codes" ON public.nce_craft_codes;
CREATE POLICY "Signed-in users read craft codes" ON public.nce_craft_codes
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.nce_craft_codes (code, craft, is_assumed, note) VALUES
  ('B1', 'Carpenter', false, 'Carpenter crew'),
  ('B2', 'Carpenter', true,  'Carpenter-led crew'),
  ('B3', 'Carpenter', true,  'Carpenter-led crew'),
  ('B4', 'Carpenter', true,  'Carpenter-led crew'),
  ('B5', 'Carpenter', true,  'Carpenter-led crew'),
  ('B6', 'Carpenter', true,  'Carpenter-led crew'),
  ('B7', 'Carpenter', true,  'Carpenter-led crew'),
  ('B9', 'Carpenter', true,  'Carpenter-led crew'),
  ('BB', 'Bricklayer', true, 'Masonry crew'),
  ('BC', 'Carpenter', true,  'Carpenter crew (finish/exterior)'),
  ('BE', 'Operating Engineer', true, 'Laborer + equipment operator crew'),
  ('BF', 'Carpenter', true,  'Carpenter/floor crew'),
  ('BG', 'Carpenter', true,  'Carpenter/glazing crew'),
  ('BL', 'Building Laborer', false, 'Laborer crew'),
  ('D1', 'Drywall installer', false, 'Drywall crew'),
  ('P1', 'Plumber', false, 'Plumbing crew'),
  ('PM', 'Plumber', true,  'Mechanical/plumbing crew'),
  ('PP', 'Plumber', true,  'Process piping crew'),
  ('R1', 'Roofer', false, 'Roofing crew'),
  ('RI', 'Reinforcing Ironworker', false, 'Rebar crew'),
  ('SW', 'Sheet Metal Worker', false, 'Sheet metal crew'),
  ('T1', 'Tile Layer', false, 'Tile crew')
ON CONFLICT (code) DO UPDATE
  SET craft = EXCLUDED.craft, is_assumed = EXCLUDED.is_assumed,
      note = EXCLUDED.note, updated_at = now();

/* ---------------------------------------------------------------- *
 * 2. Book reference tables become readable + RLS-protected
 * ---------------------------------------------------------------- */
GRANT SELECT ON public.cost_reference_nce2026 TO authenticated;
GRANT ALL ON public.cost_reference_nce2026 TO service_role;
ALTER TABLE public.cost_reference_nce2026 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users read book cost data" ON public.cost_reference_nce2026;
CREATE POLICY "Signed-in users read book cost data" ON public.cost_reference_nce2026
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.labor_wage_rates_nce2026 TO authenticated;
GRANT ALL ON public.labor_wage_rates_nce2026 TO service_role;
ALTER TABLE public.labor_wage_rates_nce2026 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users read book wage rates" ON public.labor_wage_rates_nce2026;
CREATE POLICY "Signed-in users read book wage rates" ON public.labor_wage_rates_nce2026
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.area_modification_factors_nce2026 TO authenticated;
GRANT ALL ON public.area_modification_factors_nce2026 TO service_role;
ALTER TABLE public.area_modification_factors_nce2026 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users read area factors" ON public.area_modification_factors_nce2026;
CREATE POLICY "Signed-in users read area factors" ON public.area_modification_factors_nce2026
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS cost_reference_nce2026_description_trgm
  ON public.cost_reference_nce2026 USING gin (description extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS cost_reference_nce2026_section_trgm
  ON public.cost_reference_nce2026 USING gin (section extensions.gin_trgm_ops);

/* ---------------------------------------------------------------- *
 * 3. Curated assemblies carry the book craft code
 * ---------------------------------------------------------------- */
ALTER TABLE public.catalog_assemblies
  ADD COLUMN IF NOT EXISTS craft_code text;

UPDATE public.catalog_assemblies SET craft_code = v.code
FROM (VALUES
  ('roofing.metal.standing_seam','R1'),
  ('siding.vinyl.install','B1'),
  ('siding.soffit.fascia','B1'),
  ('trim.fascia.replace','B1'),
  ('trim.column.wrap','BC'),
  ('decks.rebuild.composite','B1'),
  ('doors.exterior.replace','BC'),
  ('windows.replace.single','B1'),
  ('windows.replace.double','B1'),
  ('framing.wall.interior','B1'),
  ('framing.wall.partition.2x4','B1'),
  ('drywall.finish.level4','D1'),
  ('insulation.batt.wall','BL'),
  ('painting.walls.twocoat','BL'),
  ('flooring.vinyl.sheet','BF'),
  ('electrical.wholehouse.sf','BE'),
  ('plumbing.rough.fixture','P1'),
  ('plumbing.kitchen.sink.roughin','P1'),
  ('landscaping.install','BL')
) AS v(key, code)
WHERE public.catalog_assemblies.assembly_key = v.key;

/* ---------------------------------------------------------------- *
 * 4. Location multiplier (NH)
 * ---------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.nce_labor_multiplier(_postal text DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 1 + COALESCE(
    (SELECT total_weighted_avg_pct
       FROM public.area_modification_factors_nce2026
      WHERE _postal IS NOT NULL
        AND zip_prefix IS NOT NULL
        AND left(btrim(_postal), 3) = ANY (string_to_array(replace(zip_prefix, '-', ','), ','))
      LIMIT 1),
    (SELECT total_weighted_avg_pct
       FROM public.area_modification_factors_nce2026
      WHERE location = 'New Hampshire Average' LIMIT 1),
    0
  ) / 100.0;
$$;
REVOKE ALL ON FUNCTION public.nce_labor_multiplier(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nce_labor_multiplier(text) TO authenticated, service_role;

/* ---------------------------------------------------------------- *
 * 5. Trade -> craft fallback, and the resolved hourly rate
 * ---------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.nce_craft_for_trade(_trade_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(COALESCE(_trade_key, ''))
    WHEN 'roofing' THEN 'Roofer'
    WHEN 'siding' THEN 'Carpenter'
    WHEN 'exterior' THEN 'Carpenter'
    WHEN 'carpentry' THEN 'Carpenter'
    WHEN 'trim' THEN 'Carpenter'
    WHEN 'framing' THEN 'Carpenter'
    WHEN 'decks' THEN 'Carpenter'
    WHEN 'doors' THEN 'Carpenter'
    WHEN 'windows' THEN 'Carpenter'
    WHEN 'doors_windows' THEN 'Carpenter'
    WHEN 'cabinetry' THEN 'Carpenter'
    WHEN 'drywall' THEN 'Drywall installer'
    WHEN 'painting' THEN 'Painter'
    WHEN 'flooring' THEN 'Floor Layer'
    WHEN 'tile' THEN 'Tile Layer'
    WHEN 'electrical' THEN 'Electrician'
    WHEN 'plumbing' THEN 'Plumber'
    WHEN 'hvac' THEN 'Sheet Metal Worker'
    WHEN 'masonry' THEN 'Bricklayer'
    WHEN 'concrete' THEN 'Cement Mason'
    WHEN 'insulation' THEN 'Building Laborer'
    WHEN 'demolition' THEN 'Building Laborer'
    WHEN 'sitework' THEN 'Building Laborer'
    WHEN 'landscaping' THEN 'Building Laborer'
    WHEN 'general_conditions' THEN 'Building Laborer'
    ELSE 'Carpenter'
  END;
$$;

CREATE OR REPLACE FUNCTION public.nce_labor_rate(
  _craft_code text,
  _trade_key text,
  _postal text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_craft text;
  v_base numeric;
BEGIN
  SELECT craft INTO v_craft FROM public.nce_craft_codes
   WHERE code = upper(btrim(COALESCE(_craft_code, '')));
  IF v_craft IS NULL THEN
    v_craft := public.nce_craft_for_trade(_trade_key);
  END IF;

  SELECT total_hourly_cost INTO v_base
    FROM public.labor_wage_rates_nce2026 WHERE craft = v_craft LIMIT 1;
  IF v_base IS NULL THEN
    SELECT total_hourly_cost INTO v_base
      FROM public.labor_wage_rates_nce2026 WHERE craft = 'Carpenter' LIMIT 1;
  END IF;
  IF v_base IS NULL THEN RETURN NULL; END IF;

  RETURN round(v_base * public.nce_labor_multiplier(_postal), 2);
END
$$;
REVOKE ALL ON FUNCTION public.nce_labor_rate(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nce_labor_rate(text, text, text) TO authenticated, service_role;

/* ---------------------------------------------------------------- *
 * 6. Raw book keyword lookup (fallback when no curated assembly)
 * ---------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.nce_book_lookup(
  _description text,
  _category text DEFAULT NULL,
  _min_score numeric DEFAULT 0.28
)
RETURNS TABLE (
  reference_id integer,
  description text,
  craft_hours text,
  craft_code text,
  unit text,
  material numeric,
  labor numeric,
  total numeric,
  section text,
  score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH needle AS (
    SELECT btrim(lower(COALESCE(_description, ''))) AS d,
           btrim(lower(COALESCE(_category, ''))) AS c
  )
  SELECT r.id,
         r.description,
         r.craft_hours,
         NULLIF(split_part(COALESCE(r.craft_hours, ''), '@', 1), '—') AS craft_code,
         r.unit,
         r.material,
         r.labor,
         r.total,
         r.section,
         round((
           extensions.similarity(lower(r.description), n.d)
           + CASE WHEN n.c <> '' THEN 0.25 * extensions.similarity(lower(COALESCE(r.section, '')), n.c)
                  ELSE 0 END
         )::numeric, 4) AS score
    FROM public.cost_reference_nce2026 r, needle n
   WHERE n.d <> ''
     AND (
       extensions.similarity(lower(r.description), n.d)
       + CASE WHEN n.c <> '' THEN 0.25 * extensions.similarity(lower(COALESCE(r.section, '')), n.c) ELSE 0 END
     ) >= _min_score
   ORDER BY score DESC, r.id
   LIMIT 5;
$$;
REVOKE ALL ON FUNCTION public.nce_book_lookup(text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nce_book_lookup(text, text, numeric) TO authenticated, service_role;

/* ---------------------------------------------------------------- *
 * 7. Apply book craft labor rates to an estimate
 * ---------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.apply_book_labor_rates(_estimate_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_est public.estimates%ROWTYPE;
  v_postal text;
  v_updated integer := 0;
BEGIN
  SELECT * INTO v_est FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;

  /*
   * Location basis: the New Hampshire state average unless the caller has
   * pinned a city-specific factor on the organization postal code.
   */
  SELECT o.postal_code INTO v_postal
    FROM public.organizations o WHERE o.id = v_est.organization_id;

  PERFORM set_config('vw.kb_pricing', 'on', true);

  UPDATE public.estimate_line_items li
     SET labor_rate = rate.value,
         labor_hours_formula = format(
           '%s x %s hr/unit at $%s/hr (NCE 2026 craft %s, NH x%s)',
           li.quantity, COALESCE(li.labor_hours_per_unit, 0), rate.value,
           COALESCE(ca.craft_code, public.nce_craft_for_trade(li.trade_key)),
           public.nce_labor_multiplier(v_postal)),
         pricing_provenance = COALESCE(li.pricing_provenance, '{}'::jsonb)
           || jsonb_build_object(
                'laborRateBasis', jsonb_build_object(
                  'source', 'nce_2026_craft_wage',
                  'craftCode', ca.craft_code,
                  'craft', COALESCE(
                    (SELECT c.craft FROM public.nce_craft_codes c WHERE c.code = ca.craft_code),
                    public.nce_craft_for_trade(li.trade_key)),
                  'areaFactor', public.nce_labor_multiplier(v_postal),
                  'hourlyRate', rate.value,
                  'appliedAt', now())),
         priced_at = now()
    FROM LATERAL (SELECT 1) AS _x
    LEFT JOIN LATERAL (SELECT 1) AS _y ON true
    , LATERAL (
        SELECT ca2.craft_code
          FROM public.catalog_assemblies ca2
         WHERE ca2.assembly_key = li.catalog_item_key
         LIMIT 1
      ) ca
    , LATERAL (
        SELECT public.nce_labor_rate(ca.craft_code, li.trade_key, v_postal) AS value
      ) rate
   WHERE li.estimate_id = _estimate_id
     AND li.archived_at IS NULL
     AND li.rate_override_at IS NULL
     AND COALESCE(li.is_price_overridden, false) = false
     AND COALESCE(li.labor_hours, 0) > 0
     AND rate.value IS NOT NULL
     AND rate.value IS DISTINCT FROM li.labor_rate;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  PERFORM set_config('vw.kb_pricing', 'off', true);
  RETURN v_updated;
END
$$;
REVOKE ALL ON FUNCTION public.apply_book_labor_rates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_book_labor_rates(uuid) TO authenticated, service_role;

/* ---------------------------------------------------------------- *
 * 8. Record the book source of every line; flag lines with none
 * ---------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.tag_estimate_book_sources(_estimate_id uuid)
RETURNS TABLE (line_id uuid, description text, book_source text, matched_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_source text;
  v_ref text;
  v_hit record;
BEGIN
  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.description, li.category_key, li.catalog_item_key,
           li.trade_key, li.cost_basis
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _estimate_id AND li.archived_at IS NULL
  LOOP
    v_source := NULL; v_ref := NULL;

    SELECT ca.assembly_key INTO v_ref
      FROM public.catalog_assemblies ca
     WHERE ca.assembly_key = r.catalog_item_key
       AND ca.source_version = 'nce-2026'
     LIMIT 1;
    IF v_ref IS NOT NULL THEN
      v_source := 'catalog_assemblies';
    ELSE
      SELECT * INTO v_hit
        FROM public.nce_book_lookup(r.description, r.category_key) LIMIT 1;
      IF v_hit.reference_id IS NOT NULL THEN
        v_source := 'cost_reference_nce2026';
        v_ref := v_hit.description;
      ELSIF r.cost_basis IN ('permit_fee', 'allowance', 'other_direct_cost') THEN
        v_source := 'non_book_fee';
      ELSE
        v_source := 'none';
      END IF;
    END IF;

    UPDATE public.estimate_line_items li
       SET pricing_provenance = COALESCE(li.pricing_provenance, '{}'::jsonb)
             || jsonb_build_object('bookSource', jsonb_build_object(
                  'source', v_source, 'ref', v_ref, 'checkedAt', now())),
           resolution_status = CASE WHEN v_source = 'none'
                                    THEN 'unresolved'::public.line_resolution_status
                                    ELSE li.resolution_status END,
           unresolved_reason = CASE WHEN v_source = 'none'
                                    THEN 'no_book_source'
                                    ELSE li.unresolved_reason END
     WHERE li.id = r.id;

    line_id := r.id; description := r.description;
    book_source := v_source; matched_ref := v_ref;
    RETURN NEXT;
  END LOOP;

  PERFORM set_config('vw.kb_pricing', 'off', true);
END
$$;
REVOKE ALL ON FUNCTION public.tag_estimate_book_sources(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tag_estimate_book_sources(uuid) TO authenticated, service_role;
