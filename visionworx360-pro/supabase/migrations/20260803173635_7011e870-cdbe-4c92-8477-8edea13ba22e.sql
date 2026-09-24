CREATE OR REPLACE FUNCTION public.kb_apply_pricing(_estimate_id uuid, _pricing jsonb DEFAULT NULL::jsonb, _only_new boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_default_rate numeric;
  v_mat_factor numeric := COALESCE((_pricing->>'materialFactor')::numeric, 1);
  v_eq_factor numeric := COALESCE((_pricing->>'equipmentFactor')::numeric, 1);
  v_prov jsonb := COALESCE(_pricing->'provenance', '{}'::jsonb);
  v_min_score int := 60;
  v_priced int := 0;
  v_unmatched int := 0;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  v_default_rate := COALESCE((_pricing->>'defaultLaborRate')::numeric,
                             NULLIF(v_e.default_labor_rate, 0), 65);

  PERFORM set_config('vw.kb_pricing', 'on', true);

  WITH target AS (
    SELECT li.*,
           -- A catalog key the bridge itself wrote on a previous run is a
           -- guess, not a confirmation: it must not score as an exact match.
           CASE WHEN li.pricing_source = 'knowledge_base'
                     AND li.is_price_overridden = false
                THEN NULL ELSE li.catalog_item_key END AS trusted_catalog_key
    FROM public.estimate_line_items li
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.is_price_overridden = false
      AND (NOT _only_new OR li.pricing_source IS NULL)
  ),
  scored AS (
    SELECT t.id AS line_id, t.quantity, t.unit_key AS line_unit, m.*
    FROM target t
    LEFT JOIN public.scope_items si ON si.id = t.scope_item_id
    LEFT JOIN LATERAL (
      SELECT c.*, (c.base_score + c.bonus) AS score
      FROM (
        SELECT a.*,
          CASE
            WHEN t.trusted_catalog_key IS NOT NULL AND a.assembly_key = t.trusted_catalog_key THEN 100
            WHEN si.scope_item_key IS NOT NULL AND a.assembly_key = si.scope_item_key THEN 95
            WHEN public.kb_norm(a.work_item) = public.kb_norm(t.description) THEN 85
            WHEN EXISTS (
              SELECT 1 FROM unnest(COALESCE(a.keywords, '{}') || COALESCE(a.synonyms, '{}')) k
              WHERE public.kb_norm(k) = public.kb_norm(t.description)) THEN 75
            WHEN t.trade_key IS NOT NULL AND a.trade_key = t.trade_key
                 AND public.kb_overlap(t.description, a.work_item) >= 0.6 THEN 65
            WHEN t.category_key IS NOT NULL AND a.category_key = t.category_key
                 AND public.kb_overlap(t.description, a.work_item) >= 0.6 THEN 62
            WHEN public.kb_overlap(t.description, a.work_item) >= 0.8 THEN 55
            ELSE 0
          END AS base_score,
          CASE
            WHEN t.trusted_catalog_key IS NOT NULL AND a.assembly_key = t.trusted_catalog_key THEN 'catalog_key'
            WHEN si.scope_item_key IS NOT NULL AND a.assembly_key = si.scope_item_key THEN 'scope_key'
            WHEN public.kb_norm(a.work_item) = public.kb_norm(t.description) THEN 'exact_title'
            WHEN EXISTS (
              SELECT 1 FROM unnest(COALESCE(a.keywords, '{}') || COALESCE(a.synonyms, '{}')) k
              WHERE public.kb_norm(k) = public.kb_norm(t.description)) THEN 'keyword'
            WHEN t.trade_key IS NOT NULL AND a.trade_key = t.trade_key
                 AND public.kb_overlap(t.description, a.work_item) >= 0.6 THEN 'trade_overlap'
            WHEN t.category_key IS NOT NULL AND a.category_key = t.category_key
                 AND public.kb_overlap(t.description, a.work_item) >= 0.6 THEN 'category_overlap'
            WHEN public.kb_overlap(t.description, a.work_item) >= 0.8 THEN 'text_overlap'
            ELSE 'none'
          END AS reason,
          (CASE WHEN t.trade_key IS NOT NULL AND a.trade_key = t.trade_key THEN 2 ELSE 0 END
           + CASE WHEN t.category_key IS NOT NULL AND a.category_key = t.category_key THEN 1 ELSE 0 END
           + CASE WHEN a.origin = 'organization' THEN 3 ELSE 0 END) AS bonus
        FROM public.kb_resolved_assemblies(v_e.organization_id) a
        WHERE t.unit_key IS NULL
           OR a.unit_key IS NULL
           OR a.unit_key = t.unit_key
           OR a.assembly_key = t.trusted_catalog_key
           OR a.assembly_key = si.scope_item_key
      ) c
      WHERE c.base_score > 0
      ORDER BY (c.base_score + c.bonus) DESC, c.assembly_key ASC
      LIMIT 1
    ) m ON true
  ),
  applied AS (
    UPDATE public.estimate_line_items li
    SET
      unit_key = COALESCE(li.unit_key, s.unit_key),
      category_key = COALESCE(li.category_key, s.category_key),
      subcategory_key = COALESCE(li.subcategory_key, s.subcategory_key),
      trade_key = COALESCE(li.trade_key, s.trade_key),
      labor_hours = CASE WHEN COALESCE(li.labor_hours, 0) = 0
        THEN round(COALESCE(s.quantity, 1)
             * COALESCE(s.default_labor_hours,
                        CASE WHEN COALESCE(s.production_rate, 0) > 0
                             THEN 1 / s.production_rate ELSE NULL END, 0), 4)
        ELSE li.labor_hours END,
      labor_rate = CASE WHEN COALESCE(li.labor_rate, 0) = 0
        THEN round(COALESCE(
               (_pricing->'laborRates'->>COALESCE(s.trade_key, ''))::numeric,
               v_default_rate), 2)
        ELSE li.labor_rate END,
      material_cost = CASE WHEN COALESCE(li.material_cost, 0) = 0
        THEN round(COALESCE(s.material_allowance, 0)
                   * (1 + COALESCE(s.waste_factor, 0)) * v_mat_factor, 2)
        ELSE li.material_cost END,
      overhead_pct = CASE WHEN COALESCE(li.overhead_pct, 0) = 0
        THEN COALESCE(s.default_overhead_pct, 0) ELSE li.overhead_pct END,
      profit_pct = CASE WHEN COALESCE(li.profit_pct, 0) = 0
        THEN COALESCE(s.suggested_profit_pct, 0) ELSE li.profit_pct END,
      pricing_source = 'knowledge_base',
      priced_at = now(),
      pricing_provenance = jsonb_strip_nulls(jsonb_build_object(
        'assemblyKey', s.assembly_key,
        'workItem', s.work_item,
        'origin', s.origin,
        'matchScore', s.score,
        'matchReason', s.reason,
        'isSampleData', COALESCE(s.is_sample_data, false),
        'quantity', COALESCE(s.quantity, 1),
        'unitKey', COALESCE(li.unit_key, s.unit_key),
        'laborHoursPerUnit', COALESCE(s.default_labor_hours,
          CASE WHEN COALESCE(s.production_rate, 0) > 0 THEN 1 / s.production_rate ELSE NULL END),
        'computedLaborHours', round(COALESCE(s.quantity, 1)
          * COALESCE(s.default_labor_hours,
              CASE WHEN COALESCE(s.production_rate, 0) > 0
                   THEN 1 / s.production_rate ELSE NULL END, 0), 4),
        'crewSize', s.crew_size,
        'crewSizeApplied', false,
        'materialAllowance', s.material_allowance,
        'wasteFactor', s.waste_factor,
        'suggestedMarkupPct', s.suggested_markup_pct,
        'markupApplied', false,
        'materialFactor', v_mat_factor,
        'equipmentFactor', v_eq_factor,
        'pricing', v_prov
      ))
    FROM scored s
    WHERE li.id = s.line_id
      AND s.assembly_key IS NOT NULL
      AND s.score >= v_min_score
    RETURNING 1
  ),
  missed AS (
    UPDATE public.estimate_line_items li
    SET pricing_source = 'unmatched',
        priced_at = now(),
        pricing_provenance = jsonb_strip_nulls(jsonb_build_object(
          'reason', CASE WHEN s.assembly_key IS NULL
                         THEN 'no_knowledge_base_match' ELSE 'weak_match_needs_review' END,
          'candidateAssemblyKey', s.assembly_key,
          'candidateWorkItem', s.work_item,
          'candidateScore', s.score,
          'candidateReason', s.reason,
          'minimumScore', v_min_score))
    FROM scored s
    WHERE li.id = s.line_id
      AND (s.assembly_key IS NULL OR s.score < v_min_score)
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM applied), (SELECT count(*) FROM missed)
    INTO v_priced, v_unmatched;

  PERFORM set_config('vw.kb_pricing', 'off', true);

  RETURN jsonb_build_object(
    'priced', v_priced,
    'unmatched', v_unmatched,
    'isSampleData', true,
    'provenance', v_prov);
END
$fn$;
