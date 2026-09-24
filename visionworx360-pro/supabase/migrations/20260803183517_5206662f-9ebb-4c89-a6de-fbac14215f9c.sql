
/* ============================================================
   Unmatched Line Pricing & Quantity Completion — Phase 1
   Additive only. No table drops, no data loss.
   ============================================================ */

ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS catalog_mapping_source text,
  ADD COLUMN IF NOT EXISTS catalog_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS catalog_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_quantity_placeholder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quantity_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS quantity_reviewed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'estimate_line_items_catalog_mapping_source_chk'
  ) THEN
    ALTER TABLE public.estimate_line_items
      ADD CONSTRAINT estimate_line_items_catalog_mapping_source_chk
      CHECK (catalog_mapping_source IS NULL OR catalog_mapping_source IN ('auto', 'contractor'));
  END IF;
END $$;

COMMENT ON COLUMN public.estimate_line_items.catalog_mapping_source IS
  'auto = guessed by the pricing bridge; contractor = explicitly confirmed by a person (trusted, exact on reprice).';
COMMENT ON COLUMN public.estimate_line_items.is_quantity_placeholder IS
  'True when the quantity is a default placeholder (usually 1) rather than a measured value.';

/* Backfill: scope-derived lines that took the default quantity of 1 while the
   source scope item carried no quantity are placeholders needing review. */
UPDATE public.estimate_line_items li
SET is_quantity_placeholder = true
WHERE li.archived_at IS NULL
  AND li.quantity = 1
  AND li.quantity_reviewed_at IS NULL
  AND li.scope_item_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.scope_items si
    WHERE si.id = li.scope_item_id AND COALESCE(si.quantity, 0) = 0
  );

/* Future scope-derived lines get the flag automatically. */
CREATE OR REPLACE FUNCTION public.flag_estimate_line_placeholder_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.scope_item_id IS NOT NULL
     AND COALESCE(NEW.quantity, 1) = 1
     AND NEW.quantity_reviewed_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.scope_items si
       WHERE si.id = NEW.scope_item_id AND COALESCE(si.quantity, 0) = 0
     )
  THEN
    NEW.is_quantity_placeholder := true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_estimate_line_placeholder_quantity ON public.estimate_line_items;
CREATE TRIGGER trg_estimate_line_placeholder_quantity
BEFORE INSERT ON public.estimate_line_items
FOR EACH ROW EXECUTE FUNCTION public.flag_estimate_line_placeholder_quantity();

/* ---------- shared editability guard ---------- */

CREATE OR REPLACE FUNCTION public.estimate_is_editable(_estimate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.estimates e
    WHERE e.id = _estimate_id
      AND e.archived_at IS NULL
      AND e.locked_at IS NULL
      AND e.superseded_by_id IS NULL
      AND e.status IN ('draft', 'in_review', 'ready')
  );
$$;

/* ---------- helper: load an editable line in the caller's org ---------- */

CREATE OR REPLACE FUNCTION public.assert_editable_estimate_line(_line_id uuid)
RETURNS public.estimate_line_items
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_li public.estimate_line_items%ROWTYPE;
BEGIN
  SELECT * INTO v_li FROM public.estimate_line_items WHERE id = _line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'line_not_found' USING ERRCODE = '42501'; END IF;
  IF v_li.organization_id IS DISTINCT FROM public.current_active_organization_id() THEN
    RAISE EXCEPTION 'line_not_found' USING ERRCODE = '42501';
  END IF;
  IF v_li.archived_at IS NOT NULL THEN RAISE EXCEPTION 'line_archived' USING ERRCODE = '42501'; END IF;
  IF NOT public.estimate_is_editable(v_li.estimate_id) THEN
    RAISE EXCEPTION 'estimate_locked' USING ERRCODE = '42501';
  END IF;
  RETURN v_li;
END $$;

/* ---------- 1. contractor-confirmed Knowledge Base mapping ---------- */

CREATE OR REPLACE FUNCTION public.confirm_estimate_line_catalog(
  _line_id uuid,
  _assembly_key text,
  _quantity numeric DEFAULT NULL,
  _unit_key public.scope_unit DEFAULT NULL,
  _description text DEFAULT NULL,
  _pricing jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_li public.estimate_line_items%ROWTYPE;
  v_e public.estimates%ROWTYPE;
  a RECORD;
  v_qty numeric;
  v_unit public.scope_unit;
  v_hours_per_unit numeric;
  v_rate numeric;
  v_material numeric;
  v_mat_factor numeric := COALESCE((_pricing->>'materialFactor')::numeric, 1);
  v_default_rate numeric;
BEGIN
  v_li := public.assert_editable_estimate_line(_line_id);
  SELECT * INTO v_e FROM public.estimates WHERE id = v_li.estimate_id;

  SELECT * INTO a FROM public.kb_resolved_assemblies(v_li.organization_id) r
    WHERE r.assembly_key = _assembly_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'assembly_not_found' USING ERRCODE = '42501'; END IF;

  v_qty := COALESCE(_quantity, v_li.quantity, 1);
  IF v_qty < 0 THEN RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023'; END IF;
  v_unit := COALESCE(_unit_key, v_li.unit_key, a.unit_key);

  /* Unit incompatibility must be resolved deliberately by the contractor. */
  IF a.unit_key IS NOT NULL AND v_unit IS NOT NULL AND v_unit <> a.unit_key THEN
    RAISE EXCEPTION 'unit_mismatch' USING ERRCODE = '22023';
  END IF;

  v_hours_per_unit := COALESCE(
    a.default_labor_hours,
    CASE WHEN COALESCE(a.production_rate, 0) > 0 THEN 1 / a.production_rate ELSE NULL END,
    0);
  v_default_rate := COALESCE((_pricing->>'defaultLaborRate')::numeric,
                             NULLIF(v_e.default_labor_rate, 0), 65);
  v_rate := round(COALESCE((_pricing->'laborRates'->>COALESCE(a.trade_key, ''))::numeric,
                           v_default_rate), 2);
  v_material := round(COALESCE(a.material_allowance, 0)
                      * (1 + COALESCE(a.waste_factor, 0)) * v_mat_factor, 2);

  PERFORM set_config('vw.kb_pricing', 'on', true);

  UPDATE public.estimate_line_items li SET
    description = COALESCE(NULLIF(btrim(_description), ''), li.description),
    quantity = v_qty,
    unit_key = v_unit,
    category_key = COALESCE(li.category_key, a.category_key),
    subcategory_key = COALESCE(li.subcategory_key, a.subcategory_key),
    trade_key = COALESCE(li.trade_key, a.trade_key),
    labor_hours = round(v_qty * v_hours_per_unit, 4),
    labor_rate = v_rate,
    material_cost = v_material,
    overhead_pct = CASE WHEN COALESCE(li.overhead_pct, 0) = 0
      THEN COALESCE(a.default_overhead_pct, 0) ELSE li.overhead_pct END,
    profit_pct = CASE WHEN COALESCE(li.profit_pct, 0) = 0
      THEN COALESCE(a.suggested_profit_pct, 0) ELSE li.profit_pct END,
    catalog_item_key = a.assembly_key,
    catalog_mapping_source = 'contractor',
    catalog_confirmed_by = auth.uid(),
    catalog_confirmed_at = now(),
    is_price_overridden = false,
    pricing_source = 'knowledge_base',
    priced_at = now(),
    is_quantity_placeholder = false,
    quantity_reviewed_by = auth.uid(),
    quantity_reviewed_at = now(),
    pricing_provenance = jsonb_strip_nulls(jsonb_build_object(
      'assemblyKey', a.assembly_key,
      'workItem', a.work_item,
      'origin', a.origin,
      'mappingSource', 'contractor_confirmed',
      'matchScore', 100,
      'matchReason', 'contractor_confirmed',
      'confirmedBy', auth.uid(),
      'confirmedAt', now(),
      'isSampleData', COALESCE(a.is_sample_data, false),
      'quantity', v_qty,
      'unitKey', v_unit,
      'laborHoursPerUnit', v_hours_per_unit,
      'computedLaborHours', round(v_qty * v_hours_per_unit, 4),
      'crewSize', a.crew_size,
      'crewSizeApplied', false,
      'materialAllowance', a.material_allowance,
      'wasteFactor', a.waste_factor,
      'suggestedMarkupPct', a.suggested_markup_pct,
      'markupApplied', false,
      'materialFactor', v_mat_factor,
      'pricing', COALESCE(_pricing->'provenance', '{}'::jsonb),
      'previous', COALESCE(li.pricing_provenance, '{}'::jsonb)
    ))
  WHERE li.id = _line_id;

  PERFORM set_config('vw.kb_pricing', 'off', true);

  INSERT INTO public.estimate_audit_events (
    organization_id, project_id, estimate_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_li.organization_id, v_li.project_id, v_li.estimate_id,
    'line_pricing_confirmed', 'estimate_line_item', _line_id,
    a.work_item,
    jsonb_build_object('assemblyKey', a.assembly_key, 'quantity', v_qty, 'unitKey', v_unit));

  RETURN jsonb_build_object('lineId', _line_id, 'assemblyKey', a.assembly_key);
END $$;

/* ---------- 2. contractor manual pricing ---------- */

CREATE OR REPLACE FUNCTION public.set_estimate_line_manual_pricing(
  _line_id uuid,
  _quantity numeric DEFAULT NULL,
  _unit_key public.scope_unit DEFAULT NULL,
  _description text DEFAULT NULL,
  _labor_hours numeric DEFAULT NULL,
  _labor_rate numeric DEFAULT NULL,
  _material_cost numeric DEFAULT NULL,
  _equipment_cost numeric DEFAULT NULL,
  _subcontractor_cost numeric DEFAULT NULL,
  _other_cost numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_li public.estimate_line_items%ROWTYPE;
  v_qty numeric;
BEGIN
  v_li := public.assert_editable_estimate_line(_line_id);
  v_qty := COALESCE(_quantity, v_li.quantity, 1);
  IF v_qty < 0 THEN RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023'; END IF;

  UPDATE public.estimate_line_items li SET
    description = COALESCE(NULLIF(btrim(_description), ''), li.description),
    quantity = v_qty,
    unit_key = COALESCE(_unit_key, li.unit_key),
    labor_hours = GREATEST(COALESCE(_labor_hours, li.labor_hours), 0),
    labor_rate = GREATEST(COALESCE(_labor_rate, li.labor_rate), 0),
    material_cost = GREATEST(COALESCE(_material_cost, li.material_cost), 0),
    equipment_cost = GREATEST(COALESCE(_equipment_cost, li.equipment_cost), 0),
    subcontractor_cost = GREATEST(COALESCE(_subcontractor_cost, li.subcontractor_cost), 0),
    other_cost = GREATEST(COALESCE(_other_cost, li.other_cost), 0),
    is_price_overridden = true,
    pricing_source = 'contractor',
    priced_at = now(),
    is_quantity_placeholder = false,
    quantity_reviewed_by = auth.uid(),
    quantity_reviewed_at = now(),
    pricing_provenance = jsonb_strip_nulls(jsonb_build_object(
      'mappingSource', 'contractor_manual',
      'confirmedBy', auth.uid(),
      'confirmedAt', now(),
      'quantity', v_qty,
      'previous', COALESCE(li.pricing_provenance, '{}'::jsonb)
    ))
  WHERE li.id = _line_id;

  INSERT INTO public.estimate_audit_events (
    organization_id, project_id, estimate_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_li.organization_id, v_li.project_id, v_li.estimate_id,
    'line_manual_priced', 'estimate_line_item', _line_id, v_li.description,
    jsonb_build_object('quantity', v_qty));

  RETURN jsonb_build_object('lineId', _line_id);
END $$;

/* ---------- 3. quantity review only ---------- */

CREATE OR REPLACE FUNCTION public.review_estimate_line_quantity(
  _line_id uuid,
  _quantity numeric DEFAULT NULL,
  _unit_key public.scope_unit DEFAULT NULL,
  _description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_li public.estimate_line_items%ROWTYPE;
  v_qty numeric;
BEGIN
  v_li := public.assert_editable_estimate_line(_line_id);
  v_qty := COALESCE(_quantity, v_li.quantity, 1);
  IF v_qty < 0 THEN RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023'; END IF;

  UPDATE public.estimate_line_items li SET
    description = COALESCE(NULLIF(btrim(_description), ''), li.description),
    quantity = v_qty,
    unit_key = COALESCE(_unit_key, li.unit_key),
    is_quantity_placeholder = false,
    quantity_reviewed_by = auth.uid(),
    quantity_reviewed_at = now()
  WHERE li.id = _line_id;

  RETURN jsonb_build_object('lineId', _line_id, 'quantity', v_qty);
END $$;

/* ---------- automatic bridge trusts contractor-confirmed mappings ---------- */

CREATE OR REPLACE FUNCTION public.kb_apply_pricing(
  _estimate_id uuid, _pricing jsonb DEFAULT NULL::jsonb, _only_new boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
           -- A contractor-confirmed mapping IS trusted and stays exact.
           CASE WHEN li.catalog_mapping_source = 'contractor'
                THEN li.catalog_item_key
                WHEN li.pricing_source = 'knowledge_base'
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
      catalog_item_key = COALESCE(li.catalog_item_key, s.assembly_key),
      catalog_mapping_source = COALESCE(li.catalog_mapping_source, 'auto'),
      pricing_source = 'knowledge_base',
      priced_at = now(),
      pricing_provenance = jsonb_strip_nulls(jsonb_build_object(
        'assemblyKey', s.assembly_key,
        'workItem', s.work_item,
        'origin', s.origin,
        'mappingSource', CASE WHEN li.catalog_mapping_source = 'contractor'
                              THEN 'contractor_confirmed' ELSE 'auto_match' END,
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
$function$;

GRANT EXECUTE ON FUNCTION public.estimate_is_editable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_editable_estimate_line(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_estimate_line_catalog(uuid, text, numeric, public.scope_unit, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_estimate_line_manual_pricing(uuid, numeric, public.scope_unit, text, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_estimate_line_quantity(uuid, numeric, public.scope_unit, text) TO authenticated;
