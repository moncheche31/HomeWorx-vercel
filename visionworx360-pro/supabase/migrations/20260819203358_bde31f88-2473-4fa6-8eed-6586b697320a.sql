ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS copied_from_estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS copied_from_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS copied_from_label text,
  ADD COLUMN IF NOT EXISTS copied_source_dated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pricing_copy_mode text;

ALTER TABLE public.estimates DROP CONSTRAINT IF EXISTS estimates_pricing_copy_mode_check;
ALTER TABLE public.estimates ADD CONSTRAINT estimates_pricing_copy_mode_check
  CHECK (pricing_copy_mode IS NULL OR pricing_copy_mode IN ('copied','refreshed'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_estimates_copy_source
  ON public.estimates (project_id, copied_from_estimate_id)
  WHERE copied_from_estimate_id IS NOT NULL AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.copy_estimate_to_project(
  _source_estimate_id uuid,
  _target_project_id uuid,
  _options jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_target_project_id);
  v_src public.estimates%ROWTYPE;
  v_src_project text;
  v_existing uuid;
  v_new uuid;
  v_version int;
  v_lines int := 0;
  v_sections int := 0;
  v_label text;
  v_copy_scope boolean := COALESCE((_options->>'copyScope')::boolean, false);
  v_copy_lines boolean := COALESCE((_options->>'copyLines')::boolean, true);
  v_copy_qty boolean := COALESCE((_options->>'copyQuantities')::boolean, true);
  v_copy_pricing boolean := COALESCE((_options->>'copyPricing')::boolean, true);
  v_copy_markup boolean := COALESCE((_options->>'copyMarkup')::boolean, true);
  v_copy_notes boolean := COALESCE((_options->>'copyAssumptions')::boolean, true);
  v_engine int := COALESCE((_options->>'pricingEngineVersion')::int, 0);
  v_sec record;
  v_new_section uuid;
BEGIN
  SELECT * INTO v_src FROM public.estimates WHERE id = _source_estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source estimate not found'; END IF;
  IF v_src.organization_id <> v_org THEN RAISE EXCEPTION 'Source estimate not in active organization'; END IF;
  IF v_src.project_id = _target_project_id THEN RAISE EXCEPTION 'Cannot copy an estimate into its own project'; END IF;

  -- Idempotent: repeated confirmation returns the estimate already created.
  SELECT id INTO v_existing FROM public.estimates
   WHERE project_id = _target_project_id
     AND copied_from_estimate_id = _source_estimate_id
     AND archived_at IS NULL
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('estimate_id', v_existing, 'created', false, 'lines', 0, 'sections', 0);
  END IF;

  SELECT name INTO v_src_project FROM public.projects WHERE id = v_src.project_id;
  v_label := COALESCE(v_src_project, 'previous project') || ' — ' ||
             to_char(COALESCE(v_src.updated_at, v_src.created_at), 'YYYY-MM-DD');

  SELECT COALESCE(MAX(version),0)+1 INTO v_version FROM public.estimates WHERE project_id = _target_project_id;

  -- Header copy is deliberately selective: pricing configuration only. No
  -- customer identity, dates, approvals, signatures, payments or history.
  INSERT INTO public.estimates (organization_id, project_id, version, title, status,
    currency, tax_rate, default_overhead_pct, default_profit_pct, default_contingency_pct,
    default_labor_rate, cost_catalog_ref, intake_mode, pricing_mode, labor_settings,
    notes, created_by, pricing_engine_version, pricing_copy_mode,
    copied_from_estimate_id, copied_from_project_id, copied_from_label, copied_source_dated_at)
  VALUES (v_org, _target_project_id, v_version,
    'Estimate v' || v_version, 'draft',
    v_src.currency, v_src.tax_rate,
    CASE WHEN v_copy_markup THEN v_src.default_overhead_pct ELSE 10 END,
    CASE WHEN v_copy_markup THEN v_src.default_profit_pct ELSE 10 END,
    CASE WHEN v_copy_markup THEN v_src.default_contingency_pct ELSE 0 END,
    v_src.default_labor_rate, v_src.cost_catalog_ref, 'detailed',
    v_src.pricing_mode, v_src.labor_settings,
    CASE WHEN v_copy_notes THEN v_src.notes ELSE NULL END,
    auth.uid(), v_engine, 'copied',
    v_src.id, v_src.project_id, v_label,
    COALESCE(v_src.updated_at, v_src.created_at))
  RETURNING id INTO v_new;

  IF v_copy_scope THEN
    FOR v_sec IN
      SELECT * FROM public.scope_sections
       WHERE project_id = v_src.project_id AND organization_id = v_org AND archived_at IS NULL
       ORDER BY sort_order
    LOOP
      INSERT INTO public.scope_sections (organization_id, project_id, name, description,
        section_key, trade_key, sort_order, created_by)
      VALUES (v_org, _target_project_id, v_sec.name, v_sec.description,
        v_sec.section_key, v_sec.trade_key, v_sec.sort_order, auth.uid())
      RETURNING id INTO v_new_section;
      v_sections := v_sections + 1;

      INSERT INTO public.scope_items (organization_id, project_id, section_id, title,
        description, action_key, category_key, subcategory_key, trade_key, quantity, unit_key,
        material_selection, finish_selection, assumptions, exclusions, labor_notes,
        internal_notes, is_client_visible, is_included, priority, sort_order, scope_item_key,
        created_by)
      SELECT v_org, _target_project_id, v_new_section, si.title,
        si.description, si.action_key, si.category_key, si.subcategory_key, si.trade_key,
        CASE WHEN v_copy_qty THEN si.quantity ELSE NULL END, si.unit_key,
        si.material_selection, si.finish_selection,
        CASE WHEN v_copy_notes THEN si.assumptions ELSE NULL END,
        CASE WHEN v_copy_notes THEN si.exclusions ELSE NULL END,
        CASE WHEN v_copy_notes THEN si.labor_notes ELSE NULL END,
        CASE WHEN v_copy_notes THEN si.internal_notes ELSE NULL END,
        si.is_client_visible, si.is_included, si.priority, si.sort_order, si.scope_item_key,
        auth.uid()
      FROM public.scope_items si
      WHERE si.section_id = v_sec.id AND si.organization_id = v_org AND si.archived_at IS NULL;
    END LOOP;
  END IF;

  IF v_copy_lines THEN
    -- scope_item_id / scope_section_id / room_id are intentionally NULL: those
    -- rows belong to the source project and must never be referenced here.
    INSERT INTO public.estimate_line_items (organization_id, project_id, estimate_id,
      group_label, description, category_key, subcategory_key, trade_key, quantity, unit_key,
      labor_hours, labor_rate, material_cost, equipment_cost, subcontractor_cost, other_cost,
      overhead_pct, profit_pct, contingency_pct, is_taxable, is_client_visible, internal_notes,
      catalog_item_key, catalog_mapping_source, sort_order, created_by,
      pricing_source, is_price_overridden, pricing_provenance)
    SELECT v_org, _target_project_id, v_new,
      li.group_label, li.description, li.category_key, li.subcategory_key, li.trade_key,
      CASE WHEN v_copy_qty THEN li.quantity ELSE 1 END, li.unit_key,
      CASE WHEN v_copy_pricing THEN li.labor_hours ELSE 0 END,
      CASE WHEN v_copy_pricing THEN li.labor_rate ELSE 0 END,
      CASE WHEN v_copy_pricing THEN li.material_cost ELSE 0 END,
      CASE WHEN v_copy_pricing THEN li.equipment_cost ELSE 0 END,
      CASE WHEN v_copy_pricing THEN li.subcontractor_cost ELSE 0 END,
      CASE WHEN v_copy_pricing THEN li.other_cost ELSE 0 END,
      CASE WHEN v_copy_markup THEN li.overhead_pct ELSE 10 END,
      CASE WHEN v_copy_markup THEN li.profit_pct ELSE 10 END,
      CASE WHEN v_copy_markup THEN li.contingency_pct ELSE 0 END,
      li.is_taxable, li.is_client_visible,
      CASE WHEN v_copy_notes THEN li.internal_notes ELSE NULL END,
      li.catalog_item_key, li.catalog_mapping_source, li.sort_order, auth.uid(),
      CASE WHEN v_copy_pricing THEN 'copied' ELSE NULL END,
      v_copy_pricing,
      CASE WHEN v_copy_pricing
        THEN jsonb_build_object('copiedFromEstimateId', v_src.id,
                                'copiedFromLineId', li.id,
                                'copiedFromLabel', v_label)
        ELSE '{}'::jsonb END
    FROM public.estimate_line_items li
    WHERE li.estimate_id = _source_estimate_id AND li.archived_at IS NULL;
    GET DIAGNOSTICS v_lines = ROW_COUNT;
  END IF;

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, _target_project_id, v_new, auth.uid(), 'created', 'estimate', v_new,
    'Copied from ' || v_label,
    jsonb_build_object('source_estimate_id', v_src.id, 'source_project_id', v_src.project_id,
                       'lines', v_lines, 'sections', v_sections, 'options', _options));

  RETURN jsonb_build_object('estimate_id', v_new, 'created', true,
                            'lines', v_lines, 'sections', v_sections);
END $$;

REVOKE ALL ON FUNCTION public.copy_estimate_to_project(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_estimate_to_project(uuid, uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_copied_estimate_pricing(_estimate_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_e public.estimates%ROWTYPE; v_count int := 0;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_e.project_id);
  IF NOT public.estimate_is_editable(_estimate_id) THEN RAISE EXCEPTION 'estimate_locked'; END IF;

  -- Only untouched copied lines are released back to system pricing. A line the
  -- contractor edited is stamped 'contractor' by the override trigger and stays.
  PERFORM set_config('vw.kb_pricing', 'on', true);
  UPDATE public.estimate_line_items
     SET is_price_overridden = false, pricing_source = NULL
   WHERE estimate_id = _estimate_id
     AND archived_at IS NULL
     AND pricing_source = 'copied';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('vw.kb_pricing', 'off', true);

  UPDATE public.estimates SET pricing_copy_mode = 'refreshed', updated_at = now()
   WHERE id = _estimate_id;

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.release_copied_estimate_pricing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_copied_estimate_pricing(uuid) TO authenticated, service_role;
