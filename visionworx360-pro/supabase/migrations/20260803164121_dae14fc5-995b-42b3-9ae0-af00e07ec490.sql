-- ============================================================
-- Knowledge Base -> Estimate pricing bridge (Phase 1). Additive.
-- ============================================================

ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS pricing_source text,
  ADD COLUMN IF NOT EXISTS pricing_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS priced_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_price_overridden boolean NOT NULL DEFAULT false;

-- Contractor edits to any cost field permanently win over automatic pricing.
CREATE OR REPLACE FUNCTION public.flag_estimate_line_price_override()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('vw.kb_pricing', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.labor_hours IS DISTINCT FROM OLD.labor_hours
     OR NEW.labor_rate IS DISTINCT FROM OLD.labor_rate
     OR NEW.material_cost IS DISTINCT FROM OLD.material_cost
     OR NEW.equipment_cost IS DISTINCT FROM OLD.equipment_cost
     OR NEW.subcontractor_cost IS DISTINCT FROM OLD.subcontractor_cost
     OR NEW.other_cost IS DISTINCT FROM OLD.other_cost
     OR NEW.overhead_pct IS DISTINCT FROM OLD.overhead_pct
     OR NEW.profit_pct IS DISTINCT FROM OLD.profit_pct
     OR NEW.contingency_pct IS DISTINCT FROM OLD.contingency_pct
  THEN
    NEW.is_price_overridden := true;
    NEW.pricing_source := 'contractor';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS eli_price_override ON public.estimate_line_items;
CREATE TRIGGER eli_price_override BEFORE UPDATE ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION public.flag_estimate_line_price_override();

-- ---------- deterministic text normalization helpers ----------
CREATE OR REPLACE FUNCTION public.kb_norm(_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      lower(translate(coalesce(_text, ''),
        'áàâäãåéèêëíìîïóòôöõúùûüñçÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ',
        'aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC')),
      '[^a-z0-9]+', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

/**
 * Fraction of the scope words that also appear in the assembly words.
 * Deterministic, stopword-filtered, order independent.
 */
CREATE OR REPLACE FUNCTION public.kb_overlap(_scope text, _assembly text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  WITH s AS (
    SELECT DISTINCT w FROM unnest(string_to_array(public.kb_norm(_scope), ' ')) w
    WHERE length(w) > 2 AND w NOT IN ('the','and','for','with','new','existing','per','all','job')
  ), a AS (
    SELECT DISTINCT w FROM unnest(string_to_array(public.kb_norm(_assembly), ' ')) w
  )
  SELECT CASE WHEN (SELECT count(*) FROM s) = 0 THEN 0::numeric
    ELSE round(
      (SELECT count(*) FROM s WHERE s.w IN (SELECT w FROM a))::numeric
      / (SELECT count(*) FROM s)::numeric, 4)
  END;
$$;

/**
 * Organization-resolved Knowledge Base assemblies: current library version with
 * copy-on-write org overrides applied, plus org-authored assemblies. Disabled
 * and archived records are excluded, so seeded records are usable as-is and no
 * contractor has to open and save them.
 */
CREATE OR REPLACE FUNCTION public.kb_resolved_assemblies(_org uuid)
RETURNS TABLE(
  assembly_key text, origin text, trade_key text, category_key text, subcategory_key text,
  work_item text, default_scope_description text, unit_key public.scope_unit,
  production_rate numeric, default_labor_hours numeric, crew_size numeric,
  material_allowance numeric, waste_factor numeric,
  suggested_markup_pct numeric, default_overhead_pct numeric, suggested_profit_pct numeric,
  keywords text[], synonyms text[], is_sample_data boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH v AS (SELECT version FROM public.catalog_library_versions WHERE is_current LIMIT 1)
  SELECT a.assembly_key, 'library'::text,
         a.trade_key, a.category_key, a.subcategory_key,
         COALESCE(o.work_item, a.work_item),
         COALESCE(o.default_scope_description, a.default_scope_description),
         COALESCE(o.unit_key, a.unit_key),
         COALESCE(o.production_rate, a.production_rate),
         COALESCE(o.default_labor_hours, a.default_labor_hours),
         COALESCE(o.crew_size, a.crew_size),
         COALESCE(o.material_allowance, a.material_allowance),
         COALESCE(o.waste_factor, a.waste_factor),
         COALESCE(o.suggested_markup_pct, a.suggested_markup_pct),
         COALESCE(o.default_overhead_pct, a.default_overhead_pct),
         COALESCE(o.suggested_profit_pct, a.suggested_profit_pct),
         COALESCE(o.keywords, a.keywords), a.synonyms, a.is_sample_data
  FROM public.catalog_assemblies a
  JOIN v ON v.version = a.library_version
  LEFT JOIN public.org_assembly_overrides o
    ON o.assembly_key = a.assembly_key AND o.organization_id = _org
  WHERE a.is_active
    AND COALESCE(o.is_disabled, false) = false
    AND o.archived_at IS NULL
  UNION ALL
  SELECT c.assembly_key, 'organization'::text,
         c.trade_key, c.category_key, c.subcategory_key,
         c.work_item, c.default_scope_description, c.unit_key,
         c.production_rate, c.default_labor_hours, c.crew_size,
         c.material_allowance, c.waste_factor,
         c.suggested_markup_pct, c.default_overhead_pct, c.suggested_profit_pct,
         c.keywords, c.synonyms, false
  FROM public.org_assemblies c
  WHERE c.organization_id = _org
    AND c.is_disabled = false AND c.archived_at IS NULL;
$$;

/**
 * Apply Knowledge Base defaults + supplied regional pricing to estimate lines.
 *
 * Only blank/zero fields on non-overridden lines are ever written.
 * _pricing shape (all optional):
 *   { "defaultLaborRate": 65, "laborRates": {"cabinetry": 71.4},
 *     "materialFactor": 1.02, "equipmentFactor": 1.01, "regionalFactor": 1.05,
 *     "provenance": { ... } }
 */
CREATE OR REPLACE FUNCTION public.kb_apply_pricing(
  _estimate_id uuid, _pricing jsonb DEFAULT NULL, _only_new boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_default_rate numeric;
  v_mat_factor numeric := COALESCE((_pricing->>'materialFactor')::numeric, 1);
  v_eq_factor numeric := COALESCE((_pricing->>'equipmentFactor')::numeric, 1);
  v_prov jsonb := COALESCE(_pricing->'provenance', '{}'::jsonb);
  v_priced int := 0;
  v_unmatched int := 0;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  v_default_rate := COALESCE((_pricing->>'defaultLaborRate')::numeric,
                             NULLIF(v_e.default_labor_rate, 0), 65);

  PERFORM set_config('vw.kb_pricing', 'on', true);

  WITH target AS (
    SELECT li.*
    FROM public.estimate_line_items li
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.is_price_overridden = false
      AND (NOT _only_new OR li.pricing_source IS NULL)
  ),
  scored AS (
    SELECT t.id AS line_id, t.quantity, t.unit_key AS line_unit,
           t.category_key AS line_cat, t.subcategory_key AS line_sub,
           t.trade_key AS line_trade, t.overhead_pct, t.profit_pct,
           m.*
    FROM target t
    LEFT JOIN public.scope_items si ON si.id = t.scope_item_id
    LEFT JOIN LATERAL (
      SELECT a.*, (
        CASE
          WHEN t.catalog_item_key IS NOT NULL AND a.assembly_key = t.catalog_item_key THEN 100
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
        END
        + CASE WHEN t.trade_key IS NOT NULL AND a.trade_key = t.trade_key THEN 2 ELSE 0 END
        + CASE WHEN t.category_key IS NOT NULL AND a.category_key = t.category_key THEN 1 ELSE 0 END
        + CASE WHEN a.origin = 'organization' THEN 3 ELSE 0 END
      ) AS score
      FROM public.kb_resolved_assemblies(v_e.organization_id) a
      ORDER BY score DESC, a.assembly_key ASC
      LIMIT 1
    ) m ON m.score > 0
  ),
  applied AS (
    UPDATE public.estimate_line_items li
    SET
      catalog_item_key = COALESCE(li.catalog_item_key, s.assembly_key),
      unit_key = COALESCE(li.unit_key, s.unit_key),
      category_key = COALESCE(li.category_key, s.category_key),
      subcategory_key = COALESCE(li.subcategory_key, s.subcategory_key),
      trade_key = COALESCE(li.trade_key, s.trade_key),
      labor_hours = CASE WHEN COALESCE(li.labor_hours, 0) = 0
        THEN round(COALESCE(s.quantity, 1)
             * COALESCE(s.default_labor_hours,
                        CASE WHEN COALESCE(s.production_rate, 0) > 0
                             THEN 1 / s.production_rate ELSE NULL END, 0)
             * COALESCE(s.crew_size, 1), 4)
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
        'origin', s.origin,
        'matchScore', s.score,
        'isSampleData', COALESCE(s.is_sample_data, false),
        'laborHoursPerUnit', COALESCE(s.default_labor_hours,
          CASE WHEN COALESCE(s.production_rate, 0) > 0 THEN 1 / s.production_rate ELSE NULL END),
        'crewSize', s.crew_size,
        'materialAllowance', s.material_allowance,
        'wasteFactor', s.waste_factor,
        'suggestedMarkupPct', s.suggested_markup_pct,
        'markupApplied', false,
        'materialFactor', v_mat_factor,
        'equipmentFactor', v_eq_factor,
        'pricing', v_prov
      ))
    FROM scored s
    WHERE li.id = s.line_id AND s.assembly_key IS NOT NULL
    RETURNING 1
  ),
  missed AS (
    UPDATE public.estimate_line_items li
    SET pricing_source = 'unmatched',
        priced_at = now(),
        pricing_provenance = jsonb_build_object('reason', 'no_knowledge_base_match')
    FROM scored s
    WHERE li.id = s.line_id AND s.assembly_key IS NULL
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
END $$;

-- ---------- public reprice action ----------
CREATE OR REPLACE FUNCTION public.apply_knowledge_base_pricing(
  _estimate_id uuid, _pricing jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_e public.estimates%ROWTYPE; v_res jsonb;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_e.project_id);

  IF v_e.locked_at IS NOT NULL
     OR v_e.superseded_by_id IS NOT NULL
     OR v_e.status IN ('approved','sent','accepted','declined','superseded')
  THEN
    RAISE EXCEPTION 'estimate_locked';
  END IF;

  -- Reprice every blank, non-overridden line (including previously unmatched).
  v_res := public.kb_apply_pricing(_estimate_id, _pricing, false);

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_e.organization_id, v_e.project_id, _estimate_id, auth.uid(), 'repriced',
    'estimate', _estimate_id, 'Applied Knowledge Base pricing', v_res);

  RETURN v_res;
END $$;

-- ---------- wire the bridge into both scope paths ----------
DROP FUNCTION IF EXISTS public.create_estimate_from_scope(uuid, text);
CREATE OR REPLACE FUNCTION public.create_estimate_from_scope(
  _project_id uuid, _title text DEFAULT '', _pricing jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_version int;
  v_estimate uuid;
  v_tax numeric;
  v_currency text;
  v_count int := 0;
  v_priced jsonb;
BEGIN
  SELECT COALESCE(MAX(version),0)+1 INTO v_version FROM public.estimates WHERE project_id = _project_id;
  SELECT COALESCE(tax_rate,0), COALESCE(currency,'USD') INTO v_tax, v_currency
    FROM public.organizations WHERE id = v_org;

  INSERT INTO public.estimates (organization_id, project_id, version, title, status,
    currency, tax_rate, created_by)
  VALUES (v_org, _project_id, v_version,
    COALESCE(NULLIF(btrim(_title),''), 'Estimate v' || v_version), 'draft',
    v_currency, COALESCE(v_tax,0), auth.uid())
  RETURNING id INTO v_estimate;

  INSERT INTO public.estimate_line_items (organization_id, project_id, estimate_id,
    scope_item_id, scope_section_id, room_id, group_label, description,
    category_key, subcategory_key, trade_key, quantity, unit_key,
    is_client_visible, internal_notes, sort_order, created_by,
    overhead_pct, profit_pct, contingency_pct)
  SELECT v_org, _project_id, v_estimate, si.id, si.section_id, si.room_id,
    ss.name, si.title, si.category_key, si.subcategory_key, si.trade_key,
    COALESCE(si.quantity, 1), si.unit_key, si.is_client_visible, si.internal_notes,
    (ss.sort_order * 1000) + si.sort_order, auth.uid(), 0, 0, 0
  FROM public.scope_items si
  JOIN public.scope_sections ss ON ss.id = si.section_id
  WHERE si.project_id = _project_id AND si.organization_id = v_org
    AND si.archived_at IS NULL AND si.is_included = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  v_priced := public.kb_apply_pricing(v_estimate, _pricing, true);

  -- lines with no Knowledge Base match still get the estimate defaults
  PERFORM set_config('vw.kb_pricing', 'on', true);
  UPDATE public.estimate_line_items
     SET overhead_pct = 10, profit_pct = 10
   WHERE estimate_id = v_estimate AND overhead_pct = 0 AND profit_pct = 0;
  PERFORM set_config('vw.kb_pricing', 'off', true);

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, _project_id, v_estimate, auth.uid(), 'created', 'estimate', v_estimate,
    'Estimate generated from scope',
    jsonb_build_object('lines', v_count, 'version', v_version) || COALESCE(v_priced, '{}'::jsonb));

  RETURN v_estimate;
END $$;

DROP FUNCTION IF EXISTS public.sync_estimate_from_scope(uuid);
CREATE OR REPLACE FUNCTION public.sync_estimate_from_scope(
  _estimate_id uuid, _pricing jsonb DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_e public.estimates%ROWTYPE; v_count int := 0; v_priced jsonb;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_e.project_id);
  IF v_e.locked_at IS NOT NULL OR v_e.superseded_by_id IS NOT NULL
     OR v_e.status IN ('approved','sent','accepted','declined','superseded')
  THEN RAISE EXCEPTION 'estimate_locked'; END IF;

  INSERT INTO public.estimate_line_items (organization_id, project_id, estimate_id,
    scope_item_id, scope_section_id, room_id, group_label, description, category_key,
    subcategory_key, trade_key, quantity, unit_key, is_client_visible, internal_notes,
    sort_order, created_by, overhead_pct, profit_pct, contingency_pct)
  SELECT v_e.organization_id, v_e.project_id, _estimate_id, si.id, si.section_id, si.room_id,
    ss.name, si.title, si.category_key, si.subcategory_key, si.trade_key,
    COALESCE(si.quantity,1), si.unit_key, si.is_client_visible, si.internal_notes,
    (ss.sort_order * 1000) + si.sort_order, auth.uid(),
    0, 0, v_e.default_contingency_pct
  FROM public.scope_items si
  JOIN public.scope_sections ss ON ss.id = si.section_id
  WHERE si.project_id = v_e.project_id AND si.organization_id = v_e.organization_id
    AND si.archived_at IS NULL AND si.is_included = true
    AND NOT EXISTS (
      SELECT 1 FROM public.estimate_line_items li
      WHERE li.estimate_id = _estimate_id AND li.scope_item_id = si.id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    v_priced := public.kb_apply_pricing(_estimate_id, _pricing, true);

    PERFORM set_config('vw.kb_pricing', 'on', true);
    UPDATE public.estimate_line_items
       SET overhead_pct = v_e.default_overhead_pct, profit_pct = v_e.default_profit_pct
     WHERE estimate_id = _estimate_id AND overhead_pct = 0 AND profit_pct = 0;
    PERFORM set_config('vw.kb_pricing', 'off', true);

    INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
      actor_user_id, event_type, entity_type, entity_id, summary, metadata)
    VALUES (v_e.organization_id, v_e.project_id, _estimate_id, auth.uid(), 'synced',
      'estimate', _estimate_id, 'Imported new scope items',
      jsonb_build_object('lines', v_count) || COALESCE(v_priced, '{}'::jsonb));
  END IF;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.kb_apply_pricing(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kb_apply_pricing(uuid, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_knowledge_base_pricing(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kb_resolved_assemblies(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_estimate_from_scope(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_estimate_from_scope(uuid, jsonb) TO authenticated, service_role;
