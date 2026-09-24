-- ============================================================
-- A. Harden the helper functions flagged by the linter
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_labor_bearing_basis(_b public.task_cost_basis)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT _b IN ('labor_production','labor_lump_sum','labor_time_and_material','composite_task');
$$;

CREATE OR REPLACE FUNCTION public.is_fee_basis(_b public.task_cost_basis)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT _b IN ('permit_fee','other_direct_cost');
$$;

CREATE OR REPLACE FUNCTION public.is_measured_unit(_u text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT _u IN ('square_foot','square_yard','square','linear_foot','board_foot',
                'cubic_foot','cubic_yard','gallon','pound','sheet');
$$;

CREATE OR REPLACE FUNCTION public.default_unit_for_basis(_b public.task_cost_basis)
RETURNS public.scope_unit LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE _b WHEN 'labor_time_and_material' THEN 'hour'
                 WHEN 'equipment' THEN 'day'
                 ELSE 'each' END::public.scope_unit;
$$;

REVOKE ALL ON FUNCTION public.kb_resolved_assemblies(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.infer_cost_basis(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_labor_bearing_basis(public.task_cost_basis) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_fee_basis(public.task_cost_basis) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_measured_unit(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.default_unit_for_basis(public.task_cost_basis) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kb_resolved_assemblies(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.infer_cost_basis(text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_labor_bearing_basis(public.task_cost_basis) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_fee_basis(public.task_cost_basis) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_measured_unit(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.default_unit_for_basis(public.task_cost_basis) TO authenticated, service_role;

-- ============================================================
-- B. The authoritative line gate, now also normalising labor hours.
--    total = setup + quantity x hours_per_unit, applied EXACTLY once.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_estimate_line_cost_basis()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_contractor boolean := COALESCE(NEW.is_price_overridden, false)
                          OR COALESCE(NEW.pricing_source,'') IN ('contractor','manual');
  v_basis public.task_cost_basis;
  v_qty numeric := COALESCE(NEW.quantity, 0);
  v_unmeasured boolean;
  v_setup numeric := COALESCE(NEW.labor_hours_setup, 0);
BEGIN
  v_basis := COALESCE(NEW.cost_basis,
               public.infer_cost_basis(NEW.description, NEW.category_key, NEW.unit_key::text));
  NEW.cost_basis := v_basis;
  NEW.cost_basis_source := COALESCE(NEW.cost_basis_source,
                             CASE WHEN v_contractor THEN 'contractor' ELSE 'inferred' END);

  ----------------------------------------------------------------
  -- Rule 1: a fee is never labor, and its money is never material.
  ----------------------------------------------------------------
  IF public.is_fee_basis(v_basis) AND NOT v_contractor THEN
    IF COALESCE(NEW.material_cost,0) > 0 AND COALESCE(NEW.other_cost,0) = 0 THEN
      NEW.other_cost := NEW.material_cost;
      NEW.material_cost := 0;
    END IF;
    NEW.labor_hours := 0;
    NEW.labor_hours_per_unit := 0;
    NEW.labor_hours_basis := 'fee_no_labor';
    NEW.labor_convention := 'total_hours';
    NEW.labor_hours_formula := 'fee — no labor by cost basis';
    IF NEW.unit_key IS NULL OR NEW.unit_key::text NOT IN ('each','lump_sum','allowance','other') THEN
      NEW.unit_key := public.default_unit_for_basis(v_basis);
    END IF;
    IF v_qty <= 0 THEN NEW.quantity := 1; v_qty := 1; END IF;
    NEW.is_quantity_placeholder := false;
  END IF;

  ----------------------------------------------------------------
  -- Rule 2: a measured unit with an unmeasured quantity is not evidence.
  ----------------------------------------------------------------
  v_unmeasured := public.is_measured_unit(NEW.unit_key::text)
                  AND COALESCE(NEW.is_quantity_placeholder, false)
                  AND v_qty <= 1;

  ----------------------------------------------------------------
  -- Rule 3: canonical labor derivation for system-owned labor lines.
  ----------------------------------------------------------------
  IF NOT v_contractor AND public.is_labor_bearing_basis(v_basis) THEN
    IF v_unmeasured THEN
      -- Keep the productivity rate; withhold the untrustworthy total.
      IF COALESCE(NEW.labor_hours_per_unit,0) = 0 AND v_qty > 0
         AND COALESCE(NEW.labor_hours,0) > 0 THEN
        NEW.labor_hours_per_unit := round(NEW.labor_hours / v_qty, 4);
      END IF;
      NEW.labor_hours := 0;
      NEW.labor_convention := COALESCE(NEW.labor_convention, 'hours_per_unit');
      NEW.labor_hours_formula := 'awaiting measured quantity';
    ELSIF COALESCE(NEW.labor_hours_per_unit,0) > 0 THEN
      -- hours_per_unit: multiply by quantity exactly once.
      NEW.labor_hours := round(v_setup + v_qty * NEW.labor_hours_per_unit, 4);
      NEW.labor_convention := 'hours_per_unit';
      NEW.labor_hours_formula := CASE WHEN v_setup > 0
        THEN v_setup || ' hr setup + ' || v_qty || ' × ' || NEW.labor_hours_per_unit || ' hr/unit'
        ELSE v_qty || ' × ' || NEW.labor_hours_per_unit || ' hr/unit' END;
    ELSIF COALESCE(NEW.labor_hours,0) > 0 THEN
      -- An authored total is authoritative and is NEVER re-multiplied.
      NEW.labor_convention := COALESCE(NEW.labor_convention, 'total_hours');
    END IF;
  END IF;

  ----------------------------------------------------------------
  -- Rule 4: can this line be defensibly priced at all?
  ----------------------------------------------------------------
  IF v_contractor THEN
    NEW.resolution_status := 'resolved'; NEW.unresolved_reason := NULL;
  ELSIF NEW.pricing_source IS NULL OR NEW.pricing_source = 'unmatched' THEN
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := COALESCE(NULLIF(NEW.unresolved_reason,''), 'no_catalog_match');
  ELSIF v_unmeasured THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'quantity_unmeasured';
  ELSIF public.is_labor_bearing_basis(v_basis)
        AND COALESCE(NEW.labor_hours,0) = 0 AND COALESCE(NEW.labor_hours_per_unit,0) = 0 THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'no_productivity_rate';
  ELSE
    NEW.resolution_status := 'resolved'; NEW.unresolved_reason := NULL;
  END IF;

  RETURN NEW;
END $$;

-- ============================================================
-- C. The generator. One costing path for every system-priced line.
-- ============================================================
CREATE OR REPLACE FUNCTION public.kb_apply_pricing(
  _estimate_id uuid, _pricing jsonb DEFAULT NULL::jsonb, _only_new boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_default_rate numeric;
  v_mat_factor numeric := COALESCE((_pricing->>'materialFactor')::numeric, 1);
  v_eq_factor numeric := COALESCE((_pricing->>'equipmentFactor')::numeric, 1);
  v_prov jsonb := COALESCE(_pricing->'provenance', '{}'::jsonb);
  v_min_score int := 60;
  v_lib int;
  v_priced int := 0;
  v_unmatched int := 0;
  v_unresolved int := 0;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  v_default_rate := COALESCE((_pricing->>'defaultLaborRate')::numeric,
                             NULLIF(v_e.default_labor_rate, 0), 65);
  SELECT version INTO v_lib FROM public.catalog_library_versions WHERE is_current LIMIT 1;

  PERFORM set_config('vw.kb_pricing', 'on', true);

  WITH lib AS (SELECT * FROM public.kb_resolved_assemblies(v_e.organization_id)),
  target AS (
    SELECT li.*,
           public.kb_norm(li.description) AS norm_description,
           -- A measured unit whose quantity was never measured is not evidence.
           (public.is_measured_unit(li.unit_key::text)
            AND COALESCE(li.is_quantity_placeholder,false)
            AND COALESCE(li.quantity,0) <= 1) AS qty_unmeasured,
           CASE WHEN li.catalog_mapping_source = 'contractor' THEN li.catalog_item_key
                WHEN li.pricing_source = 'knowledge_base' AND li.is_price_overridden = false
                THEN NULL ELSE li.catalog_item_key END AS trusted_catalog_key
    FROM public.estimate_line_items li
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.is_price_overridden = false
      AND COALESCE(li.pricing_source, '') NOT IN ('contractor', 'manual')
      AND (_only_new OR COALESCE(li.catalog_mapping_source, '') <> 'contractor')
      AND (NOT _only_new OR li.pricing_source IS NULL OR li.pricing_source = 'unmatched')
  ),
  alias_hits AS (
    SELECT t.id AS line_id, ia.alias_norm, ia.review_reason, ia.note,
           CASE WHEN t.norm_description = ia.alias_norm THEN 90 ELSE 80 END AS score,
           row_number() OVER (PARTITION BY t.id
             ORDER BY CASE WHEN t.norm_description = ia.alias_norm THEN 90 ELSE 80 END DESC,
                      ia.priority DESC, length(ia.alias_norm) DESC, ia.alias_norm ASC) AS rn
    FROM target t
    JOIN (SELECT DISTINCT library_version, alias_norm, match_kind, priority, review_reason, note
          FROM public.catalog_intent_aliases) ia
      ON ia.library_version = v_lib
     AND (t.norm_description = ia.alias_norm
          OR (ia.match_kind = 'contains' AND position(ia.alias_norm IN t.norm_description) > 0))
    WHERE t.trusted_catalog_key IS NULL
  ),
  intent AS (SELECT * FROM alias_hits WHERE rn = 1),
  intent_components AS (
    SELECT i.line_id, i.score, i.alias_norm,
           t.quantity, t.unit_key AS line_unit, t.qty_unmeasured,
           ca.assembly_key, ca.quantity_factor, ca.role,
           r.work_item, r.origin, r.unit_key, r.trade_key, r.category_key, r.subcategory_key,
           r.default_overhead_pct, r.suggested_profit_pct, r.is_sample_data, r.cost_basis,
           COALESCE(r.default_labor_hours,
             CASE WHEN COALESCE(r.production_rate,0) > 0 THEN 1 / r.production_rate END, 0)
             * ca.quantity_factor AS hours_per_unit,
           round(COALESCE(r.material_allowance,0) * (1 + COALESCE(r.waste_factor,0))
                 * v_mat_factor * ca.quantity_factor, 2) AS material_cost,
           round(COALESCE((_pricing->'laborRates'->>COALESCE(r.trade_key,''))::numeric,
                          v_default_rate), 2) AS labor_rate,
           row_number() OVER (PARTITION BY i.line_id
                              ORDER BY ca.quantity_factor DESC, ca.assembly_key ASC) AS ord
    FROM intent i
    JOIN target t ON t.id = i.line_id
    JOIN public.catalog_intent_aliases ca
      ON ca.library_version = v_lib AND ca.alias_norm = i.alias_norm AND ca.assembly_key IS NOT NULL
    JOIN lib r ON r.assembly_key = ca.assembly_key
    WHERE i.review_reason IS NULL
  ),
  intent_resolved AS (
    SELECT ic.line_id, max(ic.score) AS score, max(ic.alias_norm) AS alias_norm,
      (array_agg(ic.assembly_key ORDER BY ic.ord))[1] AS assembly_key,
      (array_agg(ic.work_item ORDER BY ic.ord))[1] AS work_item,
      (array_agg(ic.origin ORDER BY ic.ord))[1] AS origin,
      (array_agg(ic.unit_key ORDER BY ic.ord))[1] AS unit_key,
      (array_agg(ic.trade_key ORDER BY ic.ord))[1] AS trade_key,
      (array_agg(ic.category_key ORDER BY ic.ord))[1] AS category_key,
      (array_agg(ic.subcategory_key ORDER BY ic.ord))[1] AS subcategory_key,
      (array_agg(ic.cost_basis ORDER BY ic.ord))[1] AS cost_basis,
      max(ic.default_overhead_pct) AS default_overhead_pct,
      max(ic.suggested_profit_pct) AS suggested_profit_pct,
      bool_or(COALESCE(ic.is_sample_data,false)) AS is_sample_data,
      count(*) AS component_count,
      round(sum(ic.hours_per_unit), 4) AS hours_per_unit,
      sum(ic.material_cost) AS material_cost,
      CASE WHEN sum(ic.hours_per_unit) > 0
           THEN round(sum(ic.hours_per_unit * ic.labor_rate) / sum(ic.hours_per_unit), 2)
           ELSE round(max(ic.labor_rate), 2) END AS labor_rate,
      bool_and(ic.line_unit IS NULL OR ic.unit_key = ic.line_unit) AS unit_ok,
      bool_or(ic.line_unit = 'each' AND COALESCE(ic.quantity,1) > 24) AS implausible_count,
      jsonb_agg(jsonb_build_object(
        'assemblyKey', ic.assembly_key, 'workItem', ic.work_item, 'role', ic.role,
        'costBasis', ic.cost_basis, 'quantityFactor', ic.quantity_factor,
        'laborHoursPerUnit', ic.hours_per_unit, 'materialCost', ic.material_cost,
        'laborRate', ic.labor_rate) ORDER BY ic.ord) AS components
    FROM intent_components ic GROUP BY ic.line_id
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
            WHEN public.kb_norm(a.work_item) = t.norm_description THEN 85
            WHEN EXISTS (SELECT 1 FROM unnest(COALESCE(a.keywords,'{}') || COALESCE(a.synonyms,'{}')) k
                         WHERE public.kb_norm(k) = t.norm_description) THEN 75
            WHEN t.trade_key IS NOT NULL AND a.trade_key = t.trade_key
                 AND public.kb_overlap(t.description, a.work_item) >= 0.6 THEN 65
            WHEN t.category_key IS NOT NULL AND a.category_key = t.category_key
                 AND public.kb_overlap(t.description, a.work_item) >= 0.6 THEN 62
            WHEN public.kb_overlap(t.description, a.work_item) >= 0.8 THEN 55
            ELSE 0 END AS base_score,
          CASE
            WHEN t.trusted_catalog_key IS NOT NULL AND a.assembly_key = t.trusted_catalog_key THEN 'catalog_key'
            WHEN si.scope_item_key IS NOT NULL AND a.assembly_key = si.scope_item_key THEN 'scope_key'
            WHEN public.kb_norm(a.work_item) = t.norm_description THEN 'exact_title'
            WHEN EXISTS (SELECT 1 FROM unnest(COALESCE(a.keywords,'{}') || COALESCE(a.synonyms,'{}')) k
                         WHERE public.kb_norm(k) = t.norm_description) THEN 'keyword'
            WHEN t.trade_key IS NOT NULL AND a.trade_key = t.trade_key
                 AND public.kb_overlap(t.description, a.work_item) >= 0.6 THEN 'trade_overlap'
            WHEN t.category_key IS NOT NULL AND a.category_key = t.category_key
                 AND public.kb_overlap(t.description, a.work_item) >= 0.6 THEN 'category_overlap'
            WHEN public.kb_overlap(t.description, a.work_item) >= 0.8 THEN 'text_overlap'
            ELSE 'none' END AS reason,
          (CASE WHEN t.trade_key IS NOT NULL AND a.trade_key = t.trade_key THEN 2 ELSE 0 END
           + CASE WHEN t.category_key IS NOT NULL AND a.category_key = t.category_key THEN 1 ELSE 0 END
           + CASE WHEN a.origin = 'organization' THEN 3 ELSE 0 END) AS bonus
        FROM lib a
        WHERE t.unit_key IS NULL OR a.unit_key IS NULL OR a.unit_key = t.unit_key
           OR a.assembly_key = t.trusted_catalog_key OR a.assembly_key = si.scope_item_key
      ) c WHERE c.base_score > 0
      ORDER BY (c.base_score + c.bonus) DESC, c.assembly_key ASC LIMIT 1
    ) m ON true
  ),
  resolved AS (
    SELECT t.id AS line_id, t.qty_unmeasured,
      CASE
        WHEN ir.line_id IS NOT NULL AND ir.unit_ok AND NOT ir.implausible_count THEN true
        WHEN i.line_id IS NOT NULL THEN false
        WHEN s.assembly_key IS NOT NULL AND s.score >= v_min_score THEN true
        ELSE false END AS priceable,
      COALESCE(ir.assembly_key, s.assembly_key) AS assembly_key,
      COALESCE(ir.work_item, s.work_item) AS work_item,
      COALESCE(ir.origin, s.origin) AS origin,
      COALESCE(ir.unit_key, s.unit_key) AS unit_key,
      COALESCE(ir.trade_key, s.trade_key) AS trade_key,
      COALESCE(ir.category_key, s.category_key) AS category_key,
      COALESCE(ir.subcategory_key, s.subcategory_key) AS subcategory_key,
      COALESCE(ir.cost_basis, s.cost_basis) AS cost_basis,
      COALESCE(ir.default_overhead_pct, s.default_overhead_pct) AS default_overhead_pct,
      COALESCE(ir.suggested_profit_pct, s.suggested_profit_pct) AS suggested_profit_pct,
      COALESCE(ir.is_sample_data, s.is_sample_data, false) AS is_sample_data,
      -- PER UNIT rate only. The line gate multiplies by quantity exactly once.
      CASE WHEN ir.line_id IS NOT NULL THEN ir.hours_per_unit
           ELSE round(COALESCE(s.default_labor_hours,
                  CASE WHEN COALESCE(s.production_rate,0) > 0 THEN 1 / s.production_rate END, 0), 4)
      END AS hours_per_unit,
      COALESCE(ir.labor_rate,
        round(COALESCE((_pricing->'laborRates'->>COALESCE(s.trade_key,''))::numeric, v_default_rate), 2)
      ) AS labor_rate,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.material_cost
           ELSE round(COALESCE(s.material_allowance,0)
                      * (1 + COALESCE(s.waste_factor,0)) * v_mat_factor, 2) END AS material_cost,
      COALESCE(ir.score, s.score) AS score,
      CASE WHEN ir.line_id IS NOT NULL AND ir.score = 90 THEN 'intent_alias_exact'
           WHEN ir.line_id IS NOT NULL THEN 'intent_alias_phrase'
           ELSE s.reason END AS reason,
      CASE
        WHEN ir.line_id IS NOT NULL AND NOT ir.unit_ok THEN 'unit_mismatch'
        WHEN ir.line_id IS NOT NULL AND ir.implausible_count THEN 'implausible_count'
        WHEN i.line_id IS NOT NULL AND i.review_reason IS NOT NULL THEN i.review_reason
        WHEN i.line_id IS NOT NULL AND ir.line_id IS NULL THEN 'intent_assembly_unavailable'
        WHEN s.assembly_key IS NULL THEN 'no_knowledge_base_match'
        ELSE 'weak_match_needs_review' END AS review_reason,
      i.note AS review_note, i.alias_norm, ir.component_count, ir.components
    FROM target t
    LEFT JOIN intent i ON i.line_id = t.id
    LEFT JOIN intent_resolved ir ON ir.line_id = t.id
    LEFT JOIN scored s ON s.line_id = t.id
  ),
  applied AS (
    UPDATE public.estimate_line_items li SET
      unit_key = COALESCE(li.unit_key, r.unit_key),
      category_key = COALESCE(li.category_key, r.category_key),
      subcategory_key = COALESCE(li.subcategory_key, r.subcategory_key),
      trade_key = COALESCE(li.trade_key, r.trade_key),
      cost_basis = COALESCE(li.cost_basis, r.cost_basis),
      -- Fees carry no labor; production labor carries a PER-UNIT rate.
      labor_hours_per_unit = CASE WHEN public.is_fee_basis(COALESCE(li.cost_basis, r.cost_basis))
                                  THEN 0 ELSE r.hours_per_unit END,
      labor_hours_basis = CASE WHEN public.is_fee_basis(COALESCE(li.cost_basis, r.cost_basis))
                               THEN 'fee_no_labor' ELSE 'catalog_production' END,
      labor_convention = 'hours_per_unit',
      -- Provisional total; the line gate re-derives it canonically.
      labor_hours = CASE
        WHEN public.is_fee_basis(COALESCE(li.cost_basis, r.cost_basis)) THEN 0
        WHEN r.qty_unmeasured THEN 0
        WHEN COALESCE(li.labor_hours,0) > 0 THEN li.labor_hours
        ELSE round(COALESCE(li.quantity,0) * r.hours_per_unit, 4) END,
      labor_rate = CASE WHEN COALESCE(li.labor_rate,0) = 0 THEN r.labor_rate ELSE li.labor_rate END,
      -- Fee money is a direct fee cost, never a material cost.
      material_cost = CASE
        WHEN public.is_fee_basis(COALESCE(li.cost_basis, r.cost_basis)) THEN 0
        WHEN COALESCE(li.material_cost,0) = 0 THEN r.material_cost ELSE li.material_cost END,
      other_cost = CASE
        WHEN public.is_fee_basis(COALESCE(li.cost_basis, r.cost_basis))
             AND COALESCE(li.other_cost,0) = 0
        THEN GREATEST(COALESCE(li.material_cost,0), r.material_cost)
        ELSE COALESCE(li.other_cost,0) END,
      overhead_pct = CASE WHEN COALESCE(li.overhead_pct,0) = 0
                          THEN COALESCE(r.default_overhead_pct,0) ELSE li.overhead_pct END,
      profit_pct = CASE WHEN COALESCE(li.profit_pct,0) = 0
                        THEN COALESCE(r.suggested_profit_pct,0) ELSE li.profit_pct END,
      catalog_item_key = COALESCE(li.catalog_item_key, r.assembly_key),
      catalog_mapping_source = COALESCE(li.catalog_mapping_source, 'auto'),
      pricing_source = 'knowledge_base',
      priced_at = now(),
      pricing_provenance = jsonb_strip_nulls(jsonb_build_object(
        'assemblyKey', r.assembly_key, 'workItem', r.work_item, 'origin', r.origin,
        'costBasis', r.cost_basis,
        'mappingSource', CASE WHEN li.catalog_mapping_source = 'contractor'
                              THEN 'contractor_confirmed' ELSE 'auto_match' END,
        'matchScore', r.score, 'matchReason', r.reason, 'intentAlias', r.alias_norm,
        'componentCount', r.component_count, 'components', r.components,
        'isSampleData', r.is_sample_data,
        'quantity', li.quantity, 'quantityUnmeasured', r.qty_unmeasured,
        'unitKey', COALESCE(li.unit_key, r.unit_key),
        'laborConvention', 'hours_per_unit',
        'laborHoursPerUnit', r.hours_per_unit,
        'crewSizeApplied', false, 'markupApplied', false,
        'materialFactor', v_mat_factor, 'equipmentFactor', v_eq_factor,
        'pricing', v_prov))
    FROM resolved r
    WHERE li.id = r.line_id AND r.priceable
    RETURNING li.resolution_status
  ),
  missed AS (
    UPDATE public.estimate_line_items li
    SET pricing_source = 'unmatched', priced_at = now(),
        unresolved_reason = r.review_reason,
        pricing_provenance = jsonb_strip_nulls(jsonb_build_object(
          'reason', r.review_reason, 'reviewNote', r.review_note,
          'intentAlias', r.alias_norm, 'candidateAssemblyKey', r.assembly_key,
          'candidateWorkItem', r.work_item, 'candidateScore', r.score,
          'candidateReason', r.reason, 'minimumScore', v_min_score))
    FROM resolved r
    WHERE li.id = r.line_id AND NOT r.priceable
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM applied),
         (SELECT count(*) FROM missed),
         (SELECT count(*) FROM applied WHERE resolution_status = 'unresolved')
    INTO v_priced, v_unmatched, v_unresolved;

  PERFORM set_config('vw.kb_pricing', 'off', true);

  RETURN jsonb_build_object('priced', v_priced, 'unmatched', v_unmatched,
                            'unresolved', v_unresolved + v_unmatched,
                            'isSampleData', true, 'provenance', v_prov);
END $function$;

-- ============================================================
-- D. Controlled repair of existing system-derived rows.
-- ============================================================
CREATE OR REPLACE FUNCTION public.repair_estimate_cost_basis(_estimate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid;
  v_preserved int := 0;
  v_touched int := 0;
  v_unresolved int := 0;
  v_repaired int := 0;
BEGIN
  SELECT organization_id INTO v_org FROM public.estimates WHERE id = _estimate_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  IF NOT public.is_org_member(v_org) THEN RAISE EXCEPTION 'Not authorised'; END IF;

  SELECT count(*) INTO v_preserved FROM public.estimate_line_items
   WHERE estimate_id = _estimate_id AND archived_at IS NULL
     AND (is_price_overridden OR COALESCE(pricing_source,'') IN ('contractor','manual'));

  PERFORM set_config('vw.kb_pricing', 'on', true);

  -- Re-running the gate is the repair: it re-classifies the basis, moves fee
  -- money out of labor/material, re-derives hours from the stored rate and
  -- flags anything it cannot defend. Contractor rows are excluded outright.
  WITH repaired AS (
    UPDATE public.estimate_line_items li
       SET cost_basis = NULL,
           cost_basis_source = NULL,
           cost_basis_repaired_at = now()
     WHERE li.estimate_id = _estimate_id
       AND li.archived_at IS NULL
       AND NOT li.is_price_overridden
       AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual')
    RETURNING li.resolution_status
  )
  SELECT count(*), count(*) FILTER (WHERE resolution_status = 'unresolved')
    INTO v_touched, v_unresolved FROM repaired;

  PERFORM set_config('vw.kb_pricing', 'off', true);
  v_repaired := v_touched - v_unresolved;

  RETURN jsonb_build_object(
    'repaired', v_repaired,
    'unresolved', v_unresolved,
    'contractorPreserved', v_preserved,
    'inspected', v_touched + v_preserved);
END $$;

REVOKE ALL ON FUNCTION public.repair_estimate_cost_basis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_estimate_cost_basis(uuid) TO authenticated, service_role;
