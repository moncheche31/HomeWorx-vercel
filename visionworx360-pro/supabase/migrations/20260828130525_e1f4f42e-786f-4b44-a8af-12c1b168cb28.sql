
DROP FUNCTION IF EXISTS public.tag_estimate_book_sources(uuid);

CREATE FUNCTION public.tag_estimate_book_sources(_estimate_id uuid)
RETURNS TABLE (line_id uuid, description text, book_source text, matched_ref text, is_book_derived boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r record; v_source text; v_ref text; v_book boolean; v_score numeric;
  v_hit_id integer; v_hit_desc text; v_hit_amb boolean;
  v_key text; v_version text;
BEGIN
  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.description, li.category_key, li.catalog_item_key, li.cost_basis
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _estimate_id AND li.archived_at IS NULL
  LOOP
    v_source := NULL; v_ref := NULL; v_book := false; v_score := NULL;
    v_hit_id := NULL; v_hit_desc := NULL; v_hit_amb := NULL;
    v_key := NULL; v_version := NULL;

    SELECT ca.assembly_key, ca.source_version INTO v_key, v_version
      FROM public.catalog_assemblies ca
     WHERE ca.assembly_key = r.catalog_item_key AND ca.is_active
     ORDER BY (ca.source_version = 'nce-2026') DESC, ca.library_version DESC NULLS LAST
     LIMIT 1;

    IF v_key IS NOT NULL THEN
      v_source := 'catalog_assemblies';
      v_ref := v_key;
      v_book := (v_version = 'nce-2026');
    ELSE
      SELECT b.reference_id, b.description, b.is_ambiguous, b.score
        INTO v_hit_id, v_hit_desc, v_hit_amb, v_score
        FROM public.nce_book_lookup(r.description, r.category_key) b LIMIT 1;
      IF v_hit_id IS NOT NULL AND NOT v_hit_amb THEN
        v_source := 'cost_reference_nce2026'; v_ref := v_hit_desc; v_book := true;
      ELSIF v_hit_id IS NOT NULL THEN
        v_source := 'ambiguous_book_match'; v_ref := v_hit_desc;
      ELSIF r.cost_basis IN ('permit_fee', 'allowance', 'other_direct_cost') THEN
        v_source := 'non_book_fee';
      ELSE
        v_source := 'none';
      END IF;
    END IF;

    UPDATE public.estimate_line_items li
       SET pricing_provenance = COALESCE(li.pricing_provenance, '{}'::jsonb)
             || jsonb_build_object('bookSource', jsonb_build_object(
                  'source', v_source, 'ref', v_ref, 'bookDerived', v_book,
                  'score', v_score, 'checkedAt', now())),
           resolution_status = CASE WHEN v_source IN ('none', 'ambiguous_book_match')
                                    THEN 'unresolved'::public.line_resolution_status
                                    ELSE li.resolution_status END,
           unresolved_reason = CASE
             WHEN v_source = 'none' THEN 'no_book_source'
             WHEN v_source = 'ambiguous_book_match' THEN 'ambiguous_book_match'
             ELSE li.unresolved_reason END
     WHERE li.id = r.id;

    line_id := r.id; description := r.description;
    book_source := v_source; matched_ref := v_ref; is_book_derived := v_book;
    RETURN NEXT;
  END LOOP;

  PERFORM set_config('vw.kb_pricing', 'off', true);
END
$$;
REVOKE ALL ON FUNCTION public.tag_estimate_book_sources(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tag_estimate_book_sources(uuid) TO authenticated, service_role, postgres;
