-- Convert a book unit to a line unit; NULL when incompatible.
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

-- Book craft code / hours parsed out of the "BC@.075" craft_hours column.
CREATE OR REPLACE FUNCTION public.nce_craft_hours_parts(_craft_hours text)
RETURNS TABLE(craft_code text, hours numeric)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT NULLIF(btrim(split_part(COALESCE(_craft_hours,''), '@', 1)), '—'),
         CASE WHEN COALESCE(_craft_hours,'') LIKE '%@%'
                   AND btrim(split_part(_craft_hours,'@',2)) ~ '^[0-9.]+$'
              THEN btrim(split_part(_craft_hours,'@',2))::numeric END;
$$;

/*
 * Tagging pass. The complete book is now loaded, so a curated catalog match no
 * longer short-circuits the lookup: every line is checked against the book and
 * a confident, unit-compatible book entry wins. Curated entries remain a valid
 * (non-book) source when the book truly has nothing; those and no-match lines
 * are flagged distinctly so the market-rate research fallback can target them.
 */
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
           li.cost_basis, li.unit_key
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

/*
 * Reprice confidently book-matched lines straight from the book row.
 * Material and labor stay separate: material cost per line unit comes from the
 * book material column, labor hours per unit from the craft_hours column.
 * Contractor overrides are never touched.
 */
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
    SELECT li.id, li.quantity, li.unit_key, li.cost_basis,
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

/* Labor rate now prefers the craft code from the matched book line. */
CREATE OR REPLACE FUNCTION public.apply_book_labor_rates(_estimate_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_est public.estimates%ROWTYPE;
  v_location text := NULL;
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
$function$;

REVOKE ALL ON FUNCTION public.nce_unit_scale(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nce_craft_hours_parts(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_book_line_pricing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_book_line_pricing(uuid) TO authenticated, service_role;
