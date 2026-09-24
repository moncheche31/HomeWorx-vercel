-- ---------------------------------------------------------------------------
-- Part 1: section-scoped book matching
-- ---------------------------------------------------------------------------

CREATE TABLE public.nce_section_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_key text NOT NULL,
  category_key text,
  section_pattern text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX nce_section_map_unique
  ON public.nce_section_map (trade_key, COALESCE(category_key, ''), section_pattern);
CREATE INDEX nce_section_map_trade ON public.nce_section_map (trade_key);

GRANT SELECT ON public.nce_section_map TO authenticated;
GRANT ALL ON public.nce_section_map TO service_role;

ALTER TABLE public.nce_section_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read the section map"
  ON public.nce_section_map FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage the section map"
  ON public.nce_section_map FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER nce_section_map_updated_at
  BEFORE UPDATE ON public.nce_section_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed. `trade_key = '*'` rows are category-only bindings used when the line's
-- trade has no mapping of its own.
INSERT INTO public.nce_section_map (trade_key, category_key, section_pattern) VALUES
  ('roofing', NULL, 'Roofing%'),
  ('roofing', NULL, 'Roofs%'),
  ('roofing', NULL, 'Roof %'),
  ('roofing', NULL, 'Metal sheet roofing%'),
  ('roofing', NULL, 'Red cedar with copper roof covering'),
  ('roofing', NULL, 'Flashing%'),
  ('roofing', NULL, 'Gutters and Downspouts'),
  ('roofing', NULL, 'Downspouts and gutters'),
  ('siding', NULL, 'Siding%'),
  ('siding', NULL, '%siding%'),
  ('siding', NULL, 'Lumber, Siding'),
  ('siding', NULL, 'Board Siding'),
  ('exterior', 'siding', 'Siding%'),
  ('exterior', 'siding', '%siding%'),
  ('exterior', 'siding', 'Lumber, Siding'),
  ('exterior', 'siding', 'Board Siding'),
  ('exterior', 'trim', 'Fascia%'),
  ('exterior', 'trim', 'Soffit%'),
  ('exterior', 'trim', 'Aluminum fascia alone'),
  ('exterior', 'painting', 'Painting%'),
  ('exterior', 'painting', 'Paint%'),
  ('exterior', 'painting', 'Exterior surfaces, per coat%'),
  ('exterior', 'roofing', 'Roofing%'),
  ('exterior', 'roofing', 'Roofs%'),
  ('exterior', NULL, 'Siding%'),
  ('exterior', NULL, 'Fascia%'),
  ('exterior', NULL, 'Soffit%'),
  ('exterior', NULL, 'Gutters and Downspouts'),
  ('windows', NULL, 'Windows%'),
  ('windows', NULL, '%windows%'),
  ('windows', NULL, 'Window Sills%'),
  ('windows', NULL, 'Window Wells'),
  ('doors', NULL, 'Doors%'),
  ('doors', NULL, 'Garage Doors'),
  ('doors_windows', 'windows', 'Windows%'),
  ('doors_windows', 'windows', '%windows%'),
  ('doors_windows', 'doors', 'Doors%'),
  ('doors_windows', NULL, 'Windows%'),
  ('doors_windows', NULL, 'Doors%'),
  ('framing', NULL, 'Lumber, Framing'),
  ('framing', NULL, 'Carpentry%'),
  ('framing', NULL, 'Floor joists%'),
  ('framing', NULL, 'Floor or ceiling joists'),
  ('framing', NULL, 'Framing Connectors'),
  ('framing', NULL, 'Subfloor%'),
  ('framing', NULL, 'Rough Carpentry%'),
  ('framing', NULL, 'Total framing%'),
  ('carpentry', NULL, 'Carpentry%'),
  ('carpentry', NULL, 'Lumber, Framing'),
  ('carpentry', NULL, 'Trim%'),
  ('carpentry', NULL, 'Molding%'),
  ('finish_carpentry', NULL, 'Carpentry, Finish'),
  ('finish_carpentry', NULL, 'Molding%'),
  ('finish_carpentry', NULL, 'Trim%'),
  ('finish_carpentry', NULL, 'Costs per LF of molding'),
  ('finish_carpentry', NULL, 'Base shoe'),
  ('finish_carpentry', NULL, 'Stairs%'),
  ('drywall', NULL, 'Gypsum Drywall%'),
  ('drywall', NULL, 'Drywall%'),
  ('drywall', NULL, 'Acoustical plaster'),
  ('insulation', NULL, 'Insulation%'),
  ('insulation', NULL, 'Blown-in cellulose'),
  ('painting', NULL, 'Painting%'),
  ('painting', NULL, 'Paint%'),
  ('painting', NULL, 'House paint'),
  ('painting', NULL, 'Woodwork, painting'),
  ('painting', NULL, 'Exterior surfaces, per coat%'),
  ('flooring', NULL, 'Flooring%'),
  ('flooring', NULL, 'Floors'),
  ('flooring', NULL, 'Carpet%'),
  ('flooring', NULL, 'Resilient%'),
  ('flooring', NULL, 'Subflooring'),
  ('flooring', NULL, 'Tongue & groove strip flooring'),
  ('flooring', NULL, 'Prefinished%flooring%'),
  ('flooring', NULL, '%strip flooring%'),
  ('flooring', NULL, 'Tile, Installation'),
  ('electrical', NULL, 'Electrical%'),
  ('electrical', NULL, 'Wiring%'),
  ('electrical', NULL, 'Lighting%'),
  ('plumbing', NULL, 'Plumbing%'),
  ('hvac', NULL, 'Heating%'),
  ('hvac', NULL, 'Air Conditioning%'),
  ('hvac', NULL, 'Ventilation%'),
  ('hvac', NULL, 'Ducts%'),
  ('cabinetry', NULL, 'Cabinets%'),
  ('cabinetry', NULL, 'Cabinet%'),
  ('cabinetry', NULL, 'Base cabinets'),
  ('cabinetry', NULL, 'Wall cabinets'),
  ('cabinetry', NULL, 'Countertop%'),
  ('cabinetry', NULL, 'Moldings and trim for cabinet work'),
  ('demolition', NULL, 'Demolition%'),
  ('decking', NULL, 'Decks'),
  ('decking', NULL, 'Deck Railing and Stairs'),
  ('decking', NULL, 'Porch%'),
  ('decking', NULL, 'Columns and Porch Posts'),
  ('decking', NULL, 'Lumber used for decking%'),
  ('concrete', NULL, 'Concrete%'),
  ('masonry', NULL, 'Masonry%'),
  ('landscaping', NULL, 'Landscap%'),
  ('landscaping', NULL, 'Fence%'),
  ('landscaping', NULL, 'Setting Fence%'),
  ('landscaping', NULL, 'Installing Fence%'),
  ('specialty', 'bath', 'Shower%'),
  ('specialty', 'bath', 'Bathtubs'),
  ('specialty', 'bath', 'Tub%'),
  ('specialty', 'bath', 'Tile%'),
  ('specialty', 'bath', 'Medicine Cabinets'),
  ('*', 'roofing', 'Roofing%'),
  ('*', 'roofing', 'Roofs%'),
  ('*', 'siding', 'Siding%'),
  ('*', 'siding', '%siding%'),
  ('*', 'windows', 'Windows%'),
  ('*', 'windows', '%windows%'),
  ('*', 'doors', 'Doors%'),
  ('*', 'drywall', 'Gypsum Drywall%'),
  ('*', 'drywall', 'Drywall%'),
  ('*', 'insulation', 'Insulation%'),
  ('*', 'painting', 'Painting%'),
  ('*', 'painting', 'Paint%'),
  ('*', 'flooring', 'Flooring%'),
  ('*', 'flooring', 'Floors'),
  ('*', 'flooring', 'Carpet%'),
  ('*', 'framing', 'Lumber, Framing'),
  ('*', 'framing', 'Carpentry%'),
  ('*', 'cabinets', 'Cabinets%'),
  ('*', 'cabinets', 'Cabinet%'),
  ('*', 'trim', 'Molding%'),
  ('*', 'trim', 'Trim%'),
  ('*', 'electrical', 'Electrical%'),
  ('*', 'plumbing', 'Plumbing%'),
  ('*', 'demo', 'Demolition%'),
  ('*', 'concrete', 'Concrete%');

-- Patterns that apply to a line, most specific binding first.
CREATE OR REPLACE FUNCTION public.nce_section_patterns(_trade_key text, _category_key text)
RETURNS text[] LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH k AS (
    SELECT NULLIF(btrim(lower(COALESCE(_trade_key, ''))), '') AS t,
           NULLIF(btrim(lower(COALESCE(_category_key, ''))), '') AS c
  ),
  exact AS (
    SELECT m.section_pattern FROM public.nce_section_map m, k
     WHERE lower(m.trade_key) = k.t AND lower(COALESCE(m.category_key, '')) = COALESCE(k.c, '')
  ),
  trade_only AS (
    SELECT m.section_pattern FROM public.nce_section_map m, k
     WHERE lower(m.trade_key) = k.t AND m.category_key IS NULL
  ),
  category_only AS (
    SELECT m.section_pattern FROM public.nce_section_map m, k
     WHERE m.trade_key = '*' AND lower(m.category_key) = k.c
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM exact) THEN (SELECT array_agg(section_pattern) FROM exact)
    WHEN EXISTS (SELECT 1 FROM trade_only) THEN (SELECT array_agg(section_pattern) FROM trade_only)
    WHEN EXISTS (SELECT 1 FROM category_only) THEN (SELECT array_agg(section_pattern) FROM category_only)
    ELSE NULL
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.nce_section_patterns(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nce_section_patterns(text, text) TO authenticated, service_role;

-- Section-scoped lookup. The 3-arg signature is replaced by a 4-arg one that
-- also takes the line's trade key.
DROP FUNCTION IF EXISTS public.nce_book_lookup(text, text, numeric);

CREATE OR REPLACE FUNCTION public.nce_book_lookup(
  _description text,
  _category text DEFAULT NULL,
  _min_score numeric DEFAULT 0.45,
  _trade_key text DEFAULT NULL
)
RETURNS TABLE(
  reference_id integer, description text, craft_hours text, craft_code text,
  unit text, material numeric, labor numeric, total numeric, section text,
  score numeric, shared_keywords integer, is_ambiguous boolean, scope_mode text
)
LANGUAGE sql STABLE SET search_path TO 'public', 'extensions' AS $$
  WITH needle AS (
    SELECT btrim(lower(COALESCE(_description, ''))) AS d,
           btrim(lower(COALESCE(_category, ''))) AS c,
           public.nce_section_patterns(_trade_key, _category) AS pats
  ),
  words AS (
    SELECT array_agg(w) AS ws
      FROM needle n,
           LATERAL unnest(regexp_split_to_array(regexp_replace(n.d, '[^a-z ]', ' ', 'g'), '\s+')) AS w
     WHERE length(w) >= 4
       AND w NOT IN ('install','with','from','this','that','into','area','work','each','unit','and','the','per')
  ),
  candidates AS (
    SELECT r.*, n.pats IS NOT NULL AND EXISTS (
             SELECT 1 FROM unnest(n.pats) p WHERE r.section ILIKE p
           ) AS in_scope
      FROM public.cost_reference_nce2026 r, needle n
     WHERE n.d <> ''
       AND lower(btrim(r.description)) !~ '^(add |add for|add to|deduct|subtract)'
       AND btrim(COALESCE(r.description, '')) <> ''
  ),
  mode AS (
    SELECT EXISTS (SELECT 1 FROM candidates WHERE in_scope) AS scoped
  ),
  scored AS (
    SELECT r.id, r.description, r.craft_hours,
           NULLIF(split_part(COALESCE(r.craft_hours, ''), '@', 1), '—') AS craft_code,
           r.unit, r.material, r.labor, r.total, r.section,
           (SELECT count(*) FROM unnest(COALESCE(w.ws, ARRAY[]::text[])) AS k
             WHERE lower(r.description) LIKE '%' || k || '%')::int AS shared,
           extensions.similarity(lower(r.description), n.d) AS sim,
           CASE WHEN m.scoped THEN 0
                WHEN n.c <> '' THEN extensions.similarity(lower(COALESCE(r.section, '')), n.c)
                ELSE 0 END AS sec_sim,
           m.scoped
      FROM candidates r, needle n, words w, mode m
     WHERE (NOT m.scoped) OR r.in_scope
  ),
  ranked AS (
    SELECT s.*,
           round((s.sim + 0.2 * s.sec_sim + 0.12 * LEAST(s.shared, 3))::numeric, 4) AS total_score
      FROM scored s
     WHERE s.shared >= 1
  ),
  ties AS (
    SELECT max(total_score) AS best,
           count(*) FILTER (WHERE total_score >= (SELECT max(total_score) FROM ranked) - 0.03) AS near_ties,
           min(COALESCE(total, COALESCE(material, 0) + COALESCE(labor, 0)))
             FILTER (WHERE total_score >= (SELECT max(total_score) FROM ranked) - 0.03) AS tie_min,
           max(COALESCE(total, COALESCE(material, 0) + COALESCE(labor, 0)))
             FILTER (WHERE total_score >= (SELECT max(total_score) FROM ranked) - 0.03) AS tie_max
      FROM ranked
  )
  SELECT r.id, r.description, r.craft_hours, r.craft_code, r.unit,
         r.material, r.labor, r.total, r.section, r.total_score, r.shared,
         (
           r.shared < 2
           OR r.total_score < CASE WHEN r.scoped THEN 0.55 ELSE 0.75 END
           OR (
             t.near_ties > 1
             AND (t.tie_max IS NULL OR t.tie_max <= 0
                  OR (t.tie_max - t.tie_min) / t.tie_max > 0.35)
           )
         ) AS is_ambiguous,
         CASE WHEN r.scoped THEN 'section_scoped' ELSE 'whole_book' END AS scope_mode
    FROM ranked r, ties t
   WHERE r.total_score >= _min_score
   ORDER BY r.total_score DESC, r.id
   LIMIT 5;
$$;

REVOKE EXECUTE ON FUNCTION public.nce_book_lookup(text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nce_book_lookup(text, text, numeric, text) TO authenticated, service_role;

-- Tagging now supplies the trade key and records the scope mode used.
CREATE OR REPLACE FUNCTION public.tag_estimate_book_sources(_estimate_id uuid)
RETURNS TABLE(line_id uuid, description text, book_source text, matched_ref text, is_book_derived boolean)
LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE
  r record; b record; v_source text; v_ref text; v_book boolean; v_score numeric;
  v_key text; v_version text; v_ref_id integer; v_scale numeric;
  v_craft text; v_hours numeric; v_mode text;
BEGIN
  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.description, li.category_key, li.catalog_item_key,
           li.cost_basis, li.trade_key, li.unit_key::text AS unit_key
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _estimate_id AND li.archived_at IS NULL
  LOOP
    v_source := NULL; v_ref := NULL; v_book := false; v_score := NULL;
    v_key := NULL; v_version := NULL; v_ref_id := NULL; v_scale := NULL;
    v_craft := NULL; v_hours := NULL; v_mode := NULL;

    SELECT ca.assembly_key, ca.source_version INTO v_key, v_version
      FROM public.catalog_assemblies ca
     WHERE ca.assembly_key = r.catalog_item_key AND ca.is_active
     ORDER BY (ca.source_version = 'nce-2026') DESC, ca.library_version DESC NULLS LAST
     LIMIT 1;

    IF r.cost_basis IN ('permit_fee', 'allowance', 'other_direct_cost') THEN
      v_source := 'non_book_fee';
    ELSE
      SELECT * INTO b
        FROM public.nce_book_lookup(r.description, r.category_key, 0.45, r.trade_key)
       LIMIT 1;

      v_mode := b.scope_mode;

      IF b.reference_id IS NOT NULL AND NOT b.is_ambiguous THEN
        v_scale := public.nce_unit_scale(b.unit, r.unit_key);
        IF v_scale IS NOT NULL THEN
          SELECT p.craft_code, p.hours INTO v_craft, v_hours
            FROM public.nce_craft_hours_parts(b.craft_hours) p;
          v_source := 'cost_reference_nce2026';
          v_ref := b.description; v_ref_id := b.reference_id;
          v_score := b.score; v_book := true;
        END IF;
      ELSIF b.reference_id IS NOT NULL THEN
        v_source := 'ambiguous_book_match'; v_ref := b.description;
        v_ref_id := b.reference_id; v_score := b.score;
      END IF;

      IF v_source IS NULL THEN
        IF v_key IS NOT NULL AND v_version = 'nce-2026' THEN
          v_source := 'catalog_assemblies'; v_ref := v_key; v_book := true;
        ELSIF v_key IS NOT NULL THEN
          v_source := 'legacy_curated_catalog'; v_ref := v_key;
        ELSE
          v_source := 'no_book_match';
        END IF;
      END IF;
    END IF;

    UPDATE public.estimate_line_items li
       SET pricing_provenance = COALESCE(li.pricing_provenance, '{}'::jsonb)
             || jsonb_build_object('bookSource', jsonb_build_object(
                  'source', v_source, 'ref', v_ref, 'refId', v_ref_id,
                  'bookDerived', v_book, 'score', v_score,
                  'unitScale', v_scale, 'craftCode', v_craft,
                  'bookHoursPerUnit', v_hours,
                  'scopeMode', v_mode,
                  'checkedAt', now())),
           resolution_status = CASE
             WHEN v_source IN ('no_book_match', 'ambiguous_book_match')
             THEN 'unresolved'::public.line_resolution_status
             ELSE li.resolution_status END,
           unresolved_reason = CASE
             WHEN v_source = 'no_book_match' THEN 'book_gap_needs_market_research'
             WHEN v_source = 'ambiguous_book_match' THEN 'ambiguous_book_match'
             ELSE li.unresolved_reason END
     WHERE li.id = r.id;

    line_id := r.id; description := r.description;
    book_source := v_source; matched_ref := v_ref; is_book_derived := v_book;
    RETURN NEXT;
  END LOOP;

  PERFORM set_config('vw.kb_pricing', 'off', true);
END
$function$;
