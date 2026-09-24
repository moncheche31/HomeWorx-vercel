-- unit_key is an enum; cast explicitly for the text-based unit scaler.
CREATE OR REPLACE FUNCTION public.nce_unit_scale(_book_unit text, _line_unit text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE lower(btrim(COALESCE(_book_unit,''))) || '|' || lower(btrim(COALESCE(_line_unit,'')))
    WHEN 'ea|each' THEN 1
    WHEN 'sf|square_foot' THEN 1
    WHEN 'csf|square_foot' THEN 0.01
    WHEN 'msf|square_foot' THEN 0.001
    WHEN 'sq|square_foot' THEN 0.01
    WHEN 'sy|square_foot' THEN (1.0/9.0)
    WHEN 'lf|linear_foot' THEN 1
    WHEN 'cy|cubic_yard' THEN 1
    WHEN 'cf|cubic_foot' THEN 1
    WHEN 'gal|gallon' THEN 1
    WHEN 'hr|hour' THEN 1
    WHEN 'ls|lump_sum' THEN 1
    WHEN 'set|each' THEN 1
    ELSE NULL
  END::numeric;
$$;

CREATE OR REPLACE FUNCTION public.tag_estimate_book_sources(_estimate_id uuid)
RETURNS TABLE(line_id uuid, description text, book_source text, matched_ref text, is_book_derived boolean)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  r record; b record; v_source text; v_ref text; v_book boolean; v_score numeric;
  v_key text; v_version text; v_ref_id integer; v_scale numeric;
  v_craft text; v_hours numeric;
BEGIN
  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.description, li.category_key, li.catalog_item_key,
           li.cost_basis, li.unit_key::text AS unit_key
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _estimate_id AND li.archived_at IS NULL
  LOOP
    v_source := NULL; v_ref := NULL; v_book := false; v_score := NULL;
    v_key := NULL; v_version := NULL; v_ref_id := NULL; v_scale := NULL;
    v_craft := NULL; v_hours := NULL;

    SELECT ca.assembly_key, ca.source_version INTO v_key, v_version
      FROM public.catalog_assemblies ca
     WHERE ca.assembly_key = r.catalog_item_key AND ca.is_active
     ORDER BY (ca.source_version = 'nce-2026') DESC, ca.library_version DESC NULLS LAST
     LIMIT 1;

    IF r.cost_basis IN ('permit_fee', 'allowance', 'other_direct_cost') THEN
      v_source := 'non_book_fee';
    ELSE
      SELECT * INTO b FROM public.nce_book_lookup(r.description, r.category_key) LIMIT 1;

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

CREATE OR REPLACE FUNCTION public.apply_book_line_pricing(_estimate_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  r record; b record; v_scale numeric; v_craft text; v_hours numeric;
  v_mat numeric; v_hpu numeric; v_updated integer := 0;
BEGIN
  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.quantity, li.unit_key::text AS unit_key, li.cost_basis,
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

    v_mat := round(COALESCE(b.material, 0) * v_scale, 4);
    v_hpu := round(COALESCE(v_hours, 0) * v_scale, 6);
    CONTINUE WHEN v_mat <= 0 AND v_hpu <= 0;

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
                  'appliedAt', now())),
           priced_at = now()
     WHERE li.id = r.id;
    v_updated := v_updated + 1;
  END LOOP;

  PERFORM set_config('vw.kb_pricing', 'off', true);
  RETURN v_updated;
END
$function$;

DO $$
DECLARE e uuid; n int;
BEGIN
  FOREACH e IN ARRAY ARRAY[
    'ffca8087-cc5c-4308-a9a5-8dc35c6ef911'::uuid,
    '1d815f3b-6241-40d7-b695-6c8374458dc8'::uuid,
    '6be8f13e-5f0a-49c0-bdec-f7f57d95a749'::uuid]
  LOOP
    PERFORM public.tag_estimate_book_sources(e);
    n := public.apply_book_line_pricing(e);
    RAISE NOTICE 'estimate % repriced % lines', e, n;
    n := public.apply_book_labor_rates(e);
    RAISE NOTICE 'estimate % rated % lines', e, n;
  END LOOP;
END $$;
