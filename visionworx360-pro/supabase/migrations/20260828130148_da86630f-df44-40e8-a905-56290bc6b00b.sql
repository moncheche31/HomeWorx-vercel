
DROP FUNCTION IF EXISTS public.nce_book_lookup(text, text, numeric);

CREATE FUNCTION public.nce_book_lookup(
  _description text,
  _category text DEFAULT NULL,
  _min_score numeric DEFAULT 0.45
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
  score numeric,
  shared_keywords integer,
  is_ambiguous boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH needle AS (
    SELECT btrim(lower(COALESCE(_description, ''))) AS d,
           btrim(lower(COALESCE(_category, ''))) AS c
  ),
  words AS (
    /* Significant keywords only: short/common words match everything. */
    SELECT array_agg(w) AS ws
      FROM needle n,
           LATERAL unnest(regexp_split_to_array(regexp_replace(n.d, '[^a-z ]', ' ', 'g'), '\s+')) AS w
     WHERE length(w) >= 4
       AND w NOT IN ('install','with','from','this','that','into','area','work','each','unit','and','the','per')
  ),
  scored AS (
    SELECT r.id,
           r.description,
           r.craft_hours,
           NULLIF(split_part(COALESCE(r.craft_hours, ''), '@', 1), '—') AS craft_code,
           r.unit, r.material, r.labor, r.total, r.section,
           (SELECT count(*) FROM unnest(COALESCE(w.ws, ARRAY[]::text[])) AS k
             WHERE lower(r.description) LIKE '%' || k || '%')::int AS shared,
           extensions.similarity(lower(r.description), n.d) AS sim,
           CASE WHEN n.c <> ''
                THEN extensions.similarity(lower(COALESCE(r.section, '')), n.c) ELSE 0 END AS sec_sim
      FROM public.cost_reference_nce2026 r, needle n, words w
     WHERE n.d <> ''
  ),
  ranked AS (
    SELECT s.*,
           round((s.sim + 0.2 * s.sec_sim + 0.12 * LEAST(s.shared, 3))::numeric, 4) AS total_score
      FROM scored s
     WHERE s.shared >= 1
  ),
  top AS (
    SELECT r.*, max(r.total_score) OVER () AS best,
           (SELECT count(*) FROM ranked r2 WHERE r2.total_score >= (SELECT max(total_score) FROM ranked) - 0.03) AS near_ties
      FROM ranked r
     WHERE r.total_score >= _min_score
  )
  SELECT t.id, t.description, t.craft_hours, t.craft_code, t.unit,
         t.material, t.labor, t.total, t.section, t.total_score, t.shared,
         (t.near_ties > 1 OR t.total_score < 0.60) AS is_ambiguous
    FROM top t
   ORDER BY t.total_score DESC, t.id
   LIMIT 5;
$$;
REVOKE ALL ON FUNCTION public.nce_book_lookup(text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nce_book_lookup(text, text, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tag_estimate_book_sources(_estimate_id uuid)
RETURNS TABLE (line_id uuid, description text, book_source text, matched_ref text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r record; v_source text; v_ref text; v_hit record;
BEGIN
  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.description, li.category_key, li.catalog_item_key,
           li.trade_key, li.cost_basis
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _estimate_id AND li.archived_at IS NULL
  LOOP
    v_source := NULL; v_ref := NULL; v_hit := NULL;

    SELECT ca.assembly_key INTO v_ref
      FROM public.catalog_assemblies ca
     WHERE ca.assembly_key = r.catalog_item_key
       AND ca.source_version = 'nce-2026'
     LIMIT 1;

    IF v_ref IS NOT NULL THEN
      v_source := 'catalog_assemblies';
    ELSE
      SELECT * INTO v_hit FROM public.nce_book_lookup(r.description, r.category_key) LIMIT 1;
      IF v_hit.reference_id IS NOT NULL AND NOT v_hit.is_ambiguous THEN
        v_source := 'cost_reference_nce2026';
        v_ref := v_hit.description;
      ELSIF v_hit.reference_id IS NOT NULL THEN
        v_source := 'ambiguous_book_match';
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
                  'source', v_source, 'ref', v_ref,
                  'score', v_hit.score, 'checkedAt', now())),
           resolution_status = CASE WHEN v_source IN ('none', 'ambiguous_book_match')
                                    THEN 'unresolved'::public.line_resolution_status
                                    ELSE li.resolution_status END,
           unresolved_reason = CASE
             WHEN v_source = 'none' THEN 'no_book_source'
             WHEN v_source = 'ambiguous_book_match' THEN 'ambiguous_book_match'
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

/* Re-price from the curated catalog (material and labor kept separate). */
CREATE OR REPLACE FUNCTION public.apply_book_pricing(_estimate_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r record; a record; v_hpu numeric; v_mat numeric; v_updated integer := 0;
BEGIN
  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.quantity, li.unit_key, li.labor_hours_per_unit,
           li.material_cost, li.catalog_item_key, li.cost_basis
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _estimate_id
       AND li.archived_at IS NULL
       AND li.rate_override_at IS NULL
       AND COALESCE(li.is_price_overridden, false) = false
       AND li.catalog_item_key IS NOT NULL
       AND (COALESCE(li.labor_hours_per_unit, 0) = 0 AND COALESCE(li.material_cost, 0) = 0)
  LOOP
    SELECT ca.default_labor_hours, ca.material_allowance, ca.unit_key
      INTO a
      FROM public.catalog_assemblies ca
     WHERE ca.assembly_key = r.catalog_item_key
       AND ca.is_active
     ORDER BY ca.library_version DESC NULLS LAST
     LIMIT 1;
    CONTINUE WHEN a IS NULL;
    CONTINUE WHEN a.unit_key IS DISTINCT FROM r.unit_key;

    v_hpu := COALESCE(a.default_labor_hours, 0);
    v_mat := COALESCE(a.material_allowance, 0);
    CONTINUE WHEN v_hpu <= 0 AND v_mat <= 0;

    UPDATE public.estimate_line_items li
       SET labor_hours_per_unit = v_hpu,
           labor_hours = round(COALESCE(r.quantity, 0) * v_hpu, 4),
           material_cost = v_mat,
           labor_hours_basis = 'catalog_production',
           labor_convention = 'hours_per_unit',
           cost_basis_source = 'catalog',
           pricing_source = 'catalog',
           resolution_status = 'resolved'::public.line_resolution_status,
           unresolved_reason = NULL,
           priced_at = now()
     WHERE li.id = r.id;
    v_updated := v_updated + 1;
  END LOOP;

  PERFORM set_config('vw.kb_pricing', 'off', true);
  RETURN v_updated;
END
$$;
REVOKE ALL ON FUNCTION public.apply_book_pricing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_book_pricing(uuid) TO authenticated, service_role;
