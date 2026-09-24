CREATE OR REPLACE FUNCTION public.nce_book_lookup(
  _description text,
  _category text DEFAULT NULL,
  _min_score numeric DEFAULT 0.45,
  _trade_key text DEFAULT NULL,
  _extra_terms text DEFAULT NULL
)
RETURNS TABLE(
  reference_id integer, description text, craft_hours text, craft_code text,
  unit text, material numeric, labor numeric, total numeric, section text,
  score numeric, shared_keywords integer, is_ambiguous boolean, scope_mode text
)
LANGUAGE sql STABLE SET search_path TO 'public', 'extensions' AS $$
  WITH needle AS (
    SELECT btrim(lower(COALESCE(_description, '') || ' ' || COALESCE(_extra_terms, ''))) AS d,
           btrim(lower(COALESCE(_category, ''))) AS c,
           public.nce_section_patterns(_trade_key, _category) AS pats
  ),
  words AS (
    SELECT array_agg(DISTINCT w) AS ws
      FROM needle n,
           LATERAL unnest(regexp_split_to_array(regexp_replace(n.d, '[^a-z ]', ' ', 'g'), '\s+')) AS w
     WHERE length(w) >= 4
       AND w NOT IN ('install','installation','with','from','this','that','into','area','work',
                     'each','unit','units','and','the','per','existing','includes','including',
                     'materials','material','handling','layout','remove','removal','allowance')
  ),
  candidates AS (
    SELECT r.*,
           lower(COALESCE(r.section, '') || ' ' || COALESCE(r.description, '')) AS hay,
           n.pats IS NOT NULL AND EXISTS (
             SELECT 1 FROM unnest(n.pats) p WHERE r.section ILIKE p
           ) AS in_scope
      FROM public.cost_reference_nce2026 r, needle n
     WHERE n.d <> ''
       AND lower(btrim(r.description)) !~ '^(add |add for|add to|deduct|subtract)'
       AND btrim(COALESCE(r.description, '')) <> ''
  ),
  mode AS (SELECT EXISTS (SELECT 1 FROM candidates WHERE in_scope) AS scoped),
  scored AS (
    SELECT r.id, r.description, r.craft_hours,
           NULLIF(split_part(COALESCE(r.craft_hours, ''), '@', 1), '—') AS craft_code,
           r.unit, r.material, r.labor, r.total, r.section,
           (SELECT count(*) FROM unnest(COALESCE(w.ws, ARRAY[]::text[])) AS k
             WHERE r.hay LIKE '%' || k || '%')::int AS shared,
           GREATEST(cardinality(COALESCE(w.ws, ARRAY[]::text[])), 1) AS word_count,
           GREATEST(extensions.similarity(r.hay, n.d),
                    extensions.similarity(lower(r.description), n.d)) AS sim,
           CASE WHEN NULLIF(split_part(COALESCE(r.craft_hours, ''), '@', 1), '—') IS NOT NULL
                THEN 0.05 ELSE 0 END AS install_bonus,
           m.scoped
      FROM candidates r, needle n, words w, mode m
     WHERE (NOT m.scoped) OR r.in_scope
  ),
  ranked AS (
    SELECT s.*,
           round((s.shared::numeric / s.word_count), 4) AS coverage,
           round((0.6 * (s.shared::numeric / s.word_count) + 0.4 * s.sim + s.install_bonus)::numeric, 4) AS total_score
      FROM scored s
     WHERE s.shared >= 1
  ),
  ties AS (
    SELECT count(*) FILTER (WHERE total_score >= (SELECT max(total_score) FROM ranked) - 0.03) AS near_ties,
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
           OR r.coverage < 0.5
           OR r.total_score < CASE WHEN r.scoped THEN 0.50 ELSE 0.65 END
           OR (t.near_ties > 1
               AND (t.tie_max IS NULL OR t.tie_max <= 0
                    OR (t.tie_max - t.tie_min) / t.tie_max > 0.35))
         ) AS is_ambiguous,
         CASE WHEN r.scoped THEN 'section_scoped' ELSE 'whole_book' END AS scope_mode
    FROM ranked r, ties t
   WHERE r.total_score >= _min_score
   ORDER BY r.total_score DESC, r.id
   LIMIT 5;
$$;

REVOKE EXECUTE ON FUNCTION public.nce_book_lookup(text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nce_book_lookup(text, text, numeric, text, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.nce_book_lookup(text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.tag_estimate_book_sources(_estimate_id uuid)
RETURNS TABLE(line_id uuid, description text, book_source text, matched_ref text, is_book_derived boolean)
LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE
  r record; b record; v_source text; v_ref text; v_book boolean; v_score numeric;
  v_key text; v_version text; v_ref_id integer; v_scale numeric;
  v_craft text; v_hours numeric; v_mode text; v_extra text;
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
    v_craft := NULL; v_hours := NULL; v_mode := NULL; v_extra := NULL;

    SELECT ca.assembly_key, ca.source_version,
           btrim(COALESCE(ca.work_item, '') || ' ' ||
                 COALESCE(array_to_string(ca.keywords, ' '), ''))
      INTO v_key, v_version, v_extra
      FROM public.catalog_assemblies ca
     WHERE ca.assembly_key = r.catalog_item_key AND ca.is_active
     ORDER BY (ca.source_version = 'nce-2026') DESC, ca.library_version DESC NULLS LAST
     LIMIT 1;

    IF r.cost_basis IN ('permit_fee', 'allowance', 'other_direct_cost') THEN
      v_source := 'non_book_fee';
    ELSE
      SELECT * INTO b
        FROM public.nce_book_lookup(r.description, r.category_key, 0.45, r.trade_key, v_extra)
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
                  'searchTerms', v_extra,
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
