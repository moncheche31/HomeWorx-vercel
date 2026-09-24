/*
 * Modifier rows ("Add for ...", "Deduct ...") price an adjustment to another
 * line and are never a standalone scope match. Confidence is also raised: a
 * match must share at least two meaningful words and score high, otherwise the
 * contractor reviews it rather than the engine guessing.
 */
CREATE OR REPLACE FUNCTION public.nce_book_lookup(_description text, _category text DEFAULT NULL::text, _min_score numeric DEFAULT 0.45)
RETURNS TABLE(reference_id integer, description text, craft_hours text, craft_code text, unit text, material numeric, labor numeric, total numeric, section text, score numeric, shared_keywords integer, is_ambiguous boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
  WITH needle AS (
    SELECT btrim(lower(COALESCE(_description, ''))) AS d,
           btrim(lower(COALESCE(_category, ''))) AS c
  ),
  words AS (
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
       AND lower(btrim(r.description)) !~ '^(add |add for|add to|deduct|subtract)'
       AND btrim(COALESCE(r.description, '')) <> ''
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
         (t.near_ties > 1 OR t.total_score < 0.75 OR t.shared < 2) AS is_ambiguous
    FROM top t
   ORDER BY t.total_score DESC, t.id
   LIMIT 5;
$function$;

/* Never let a blank book value erase pricing that already exists. */
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

    v_mat := round(COALESCE(b.material, 0) * v_scale, 4);
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
                  'appliedAt', now())),
           priced_at = now()
     WHERE li.id = r.id;
    v_updated := v_updated + 1;
  END LOOP;

  PERFORM set_config('vw.kb_pricing', 'off', true);
  RETURN v_updated;
END
$function$;

/* Restore the four lines a weak match had overwritten, then re-run the pass. */
DO $$
DECLARE e uuid; n int;
BEGIN
  PERFORM set_config('vw.kb_pricing', 'on', true);

  UPDATE public.estimate_line_items SET
      material_cost = 428.40, labor_hours_per_unit = 1.50, labor_hours = 13.50,
      resolution_status = 'resolved'::public.line_resolution_status,
      unresolved_reason = NULL, cost_basis_source = 'catalog', pricing_source = 'catalog'
    WHERE estimate_id = 'ffca8087-cc5c-4308-a9a5-8dc35c6ef911'
      AND description = 'Windows - double units' AND archived_at IS NULL;

  UPDATE public.estimate_line_items SET
      material_cost = 238.00, labor_hours_per_unit = 1.00, labor_hours = 15.00,
      resolution_status = 'resolved'::public.line_resolution_status,
      unresolved_reason = NULL, cost_basis_source = 'catalog', pricing_source = 'catalog'
    WHERE estimate_id = 'ffca8087-cc5c-4308-a9a5-8dc35c6ef911'
      AND description = 'Windows - single units' AND archived_at IS NULL;

  UPDATE public.estimate_line_items SET
      material_cost = 50.00, labor_hours_per_unit = 1.50, labor_hours = 1.50,
      resolution_status = 'resolved'::public.line_resolution_status,
      unresolved_reason = NULL, cost_basis_source = 'catalog', pricing_source = 'catalog'
    WHERE estimate_id = '1d815f3b-6241-40d7-b695-6c8374458dc8'
      AND description LIKE 'Cut out and frame opening%' AND archived_at IS NULL;

  UPDATE public.estimate_line_items SET
      labor_hours_per_unit = 2.25, labor_hours = 4.50,
      resolution_status = 'resolved'::public.line_resolution_status,
      unresolved_reason = NULL, cost_basis_source = 'catalog', pricing_source = 'catalog'
    WHERE estimate_id = '1d815f3b-6241-40d7-b695-6c8374458dc8'
      AND description = 'Install interior doors and trim' AND archived_at IS NULL;

  PERFORM set_config('vw.kb_pricing', 'off', true);

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
