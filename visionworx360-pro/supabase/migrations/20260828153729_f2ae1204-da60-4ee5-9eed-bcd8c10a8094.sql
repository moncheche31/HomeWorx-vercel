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
           -- A row whose text is only a dimension ("2'0\" x 2'0\"") identifies a
           -- SIZE the estimate never stated. Never auto-accept one.
           (lower(r.description) !~ '[a-z]{4}') AS size_only,
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
           OR r.size_only
           OR r.coverage < 0.6
           OR r.total_score < CASE WHEN r.scoped THEN 0.60 ELSE 0.70 END
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
