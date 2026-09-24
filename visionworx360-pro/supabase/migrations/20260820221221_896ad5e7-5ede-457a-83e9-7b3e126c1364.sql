-- 1. PROVENANCE COLUMNS -------------------------------------------------

ALTER TABLE public.scope_items
  ADD COLUMN IF NOT EXISTS origin_type text NOT NULL DEFAULT 'contractor',
  ADD COLUMN IF NOT EXISTS origin_ref uuid,
  ADD COLUMN IF NOT EXISTS origin_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS quantity_basis text,
  ADD COLUMN IF NOT EXISTS quantity_basis_note text,
  ADD COLUMN IF NOT EXISTS quantity_basis_formula jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quantity_source_measurement_id uuid;

ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS origin_type text NOT NULL DEFAULT 'contractor',
  ADD COLUMN IF NOT EXISTS origin_ref uuid,
  ADD COLUMN IF NOT EXISTS origin_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS quantity_basis text,
  ADD COLUMN IF NOT EXISTS quantity_basis_note text,
  ADD COLUMN IF NOT EXISTS quantity_basis_formula jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quantity_source_measurement_id uuid;

ALTER TABLE public.project_measurements
  ADD COLUMN IF NOT EXISTS unconfirmed_fields text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scope_items_origin_type_chk') THEN
    ALTER TABLE public.scope_items ADD CONSTRAINT scope_items_origin_type_chk
      CHECK (origin_type IN ('contractor','template','ai_inference','checklist',
                             'copied_estimate','scope_sync','geometry','system','legacy'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eli_origin_type_chk') THEN
    ALTER TABLE public.estimate_line_items ADD CONSTRAINT eli_origin_type_chk
      CHECK (origin_type IN ('contractor','template','ai_inference','checklist',
                             'copied_estimate','scope_sync','geometry','system','legacy'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scope_items_quantity_basis_chk') THEN
    ALTER TABLE public.scope_items ADD CONSTRAINT scope_items_quantity_basis_chk
      CHECK (quantity_basis IS NULL OR quantity_basis IN
        ('measurement','geometry_derived','contractor_entered','assumed','catalog_default'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eli_quantity_basis_chk') THEN
    ALTER TABLE public.estimate_line_items ADD CONSTRAINT eli_quantity_basis_chk
      CHECK (quantity_basis IS NULL OR quantity_basis IN
        ('measurement','geometry_derived','contractor_entered','assumed','catalog_default'));
  END IF;
END $$;

-- Everything that existed before provenance is honestly labelled 'legacy'.
UPDATE public.scope_items SET origin_type = 'legacy', origin_at = created_at
 WHERE origin_type = 'contractor' AND created_at < now();
UPDATE public.estimate_line_items SET origin_type = 'legacy', origin_at = created_at
 WHERE origin_type = 'contractor' AND created_at < now();

CREATE INDEX IF NOT EXISTS scope_items_origin_idx ON public.scope_items (project_id, origin_type, origin_ref);
CREATE INDEX IF NOT EXISTS eli_origin_idx ON public.estimate_line_items (estimate_id, origin_type, origin_ref);

-- 2. TEMPLATE COMPATIBILITY + ORIGIN STAMPING ---------------------------

CREATE OR REPLACE FUNCTION public.template_matches_project(_project_type text, _template_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _project_type IS NULL
      OR _template_type IS NULL
      OR lower(btrim(_project_type)) = lower(btrim(_template_type));
$$;

DROP FUNCTION IF EXISTS public.apply_scope_template(uuid, uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.apply_scope_template(
  _project_id uuid, _template_id uuid, _room_id uuid,
  _allow_append boolean, _confirm_mismatch boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_template public.scope_templates%ROWTYPE;
  v_project_type text;
  v_sections int := 0; v_items int := 0;
  v_section jsonb; v_item jsonb; v_section_id uuid; v_next_sort int;
BEGIN
  SELECT * INTO v_template FROM public.scope_templates WHERE id = _template_id AND is_active = true;
  IF v_template.id IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF NOT v_template.is_system_template AND
     (v_template.organization_id IS NULL OR v_template.organization_id <> v_org) THEN
    RAISE EXCEPTION 'Template not accessible';
  END IF;

  SELECT project_type_key INTO v_project_type FROM public.projects WHERE id = _project_id;
  IF NOT COALESCE(_confirm_mismatch, false)
     AND NOT public.template_matches_project(v_project_type, v_template.project_type_key) THEN
    RAISE EXCEPTION 'template_project_type_mismatch:%:%',
      COALESCE(v_project_type,'unknown'), COALESCE(v_template.project_type_key,'unknown');
  END IF;

  IF _room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_rooms
    WHERE id = _room_id AND project_id = _project_id AND organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Room not in project';
  END IF;

  IF NOT _allow_append AND EXISTS (
    SELECT 1 FROM public.scope_sections
    WHERE project_id = _project_id AND organization_id = v_org
      AND archived_at IS NULL
      AND (_room_id IS NULL OR room_id IS NOT DISTINCT FROM _room_id)
  ) THEN
    RAISE EXCEPTION 'scope_exists_append_required';
  END IF;

  SELECT COALESCE(MAX(sort_order),-1) INTO v_next_sort FROM public.scope_sections
    WHERE project_id = _project_id AND organization_id = v_org;

  PERFORM set_config('app.suppress_scope_activity','on', true);
  FOR v_section IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.template_data->'sections','[]'::jsonb)) LOOP
    v_next_sort := v_next_sort + 1;
    INSERT INTO public.scope_sections (organization_id, project_id, room_id, name,
      section_key, trade_key, description, sort_order, created_by)
    VALUES (v_org, _project_id, _room_id,
      COALESCE(v_section->>'name','Section'),
      v_section->>'section_key', v_section->>'trade_key', v_section->>'description',
      v_next_sort, auth.uid())
    RETURNING id INTO v_section_id;
    v_sections := v_sections + 1;

    IF v_section ? 'items' THEN
      DECLARE v_idx int := 0;
      BEGIN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_section->'items') LOOP
          INSERT INTO public.scope_items (organization_id, project_id, section_id, room_id, title,
            scope_item_key, trade_key, action_key, description, sort_order, created_by,
            is_included, completion_status, origin_type, origin_ref, origin_at)
          VALUES (v_org, _project_id, v_section_id, _room_id,
            COALESCE(v_item->>'title','Item'),
            v_item->>'scope_item_key', v_item->>'trade_key',
            NULLIF(v_item->>'action_key','')::public.scope_action,
            v_item->>'description', v_idx, auth.uid(), true, 'draft',
            'template', _template_id, now());
          v_idx := v_idx + 1;
          v_items := v_items + 1;
        END LOOP;
      END;
    END IF;
  END LOOP;
  PERFORM set_config('app.suppress_scope_activity','off', true);

  INSERT INTO public.project_activity (organization_id, project_id, actor_user_id,
    activity_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, _project_id, auth.uid(), 'applied', 'scope_template', _template_id,
    v_template.name, jsonb_build_object('sections_created', v_sections,
    'items_created', v_items, 'room_id', _room_id,
    'project_type_key', v_project_type,
    'template_project_type_key', v_template.project_type_key,
    'mismatch_confirmed', COALESCE(_confirm_mismatch,false)));

  RETURN jsonb_build_object('sections_created', v_sections, 'items_created', v_items,
    'template_id', _template_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.insert_template_section(_project_id uuid, _template_id uuid, _section_index integer, _room_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_tpl public.scope_templates%ROWTYPE;
  v_section jsonb; v_item jsonb; v_section_id uuid; v_sort int; v_idx int := 0; v_items int := 0;
BEGIN
  SELECT * INTO v_tpl FROM public.scope_templates WHERE id = _template_id AND is_active = true;
  IF v_tpl.id IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF NOT v_tpl.is_system_template AND (v_tpl.organization_id IS NULL OR v_tpl.organization_id <> v_org) THEN
    RAISE EXCEPTION 'Template not accessible';
  END IF;
  IF _room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_rooms WHERE id = _room_id AND project_id = _project_id AND organization_id = v_org
  ) THEN RAISE EXCEPTION 'Room not in project'; END IF;

  v_section := COALESCE(v_tpl.template_data->'sections','[]'::jsonb) -> _section_index;
  IF v_section IS NULL THEN RAISE EXCEPTION 'Template section not found'; END IF;

  SELECT COALESCE(MAX(sort_order),-1)+1 INTO v_sort FROM public.scope_sections
   WHERE project_id = _project_id AND organization_id = v_org;

  PERFORM set_config('app.suppress_scope_activity','on', true);
  INSERT INTO public.scope_sections (organization_id, project_id, room_id, name,
    section_key, trade_key, description, sort_order, created_by)
  VALUES (v_org, _project_id, _room_id, COALESCE(v_section->>'name','Section'),
    v_section->>'section_key', v_section->>'trade_key', v_section->>'description', v_sort, auth.uid())
  RETURNING id INTO v_section_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_section->'items','[]'::jsonb)) LOOP
    INSERT INTO public.scope_items (organization_id, project_id, section_id, room_id, title,
      scope_item_key, trade_key, action_key, description, sort_order, created_by,
      is_included, completion_status, origin_type, origin_ref, origin_at)
    VALUES (v_org, _project_id, v_section_id, _room_id, COALESCE(v_item->>'title','Item'),
      v_item->>'scope_item_key', v_item->>'trade_key',
      NULLIF(v_item->>'action_key','')::public.scope_action,
      v_item->>'description', v_idx, auth.uid(), true, 'draft',
      'template', _template_id, now());
    v_idx := v_idx + 1; v_items := v_items + 1;
  END LOOP;
  PERFORM set_config('app.suppress_scope_activity','off', true);

  INSERT INTO public.project_activity (organization_id, project_id, actor_user_id,
    activity_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, _project_id, auth.uid(), 'applied', 'scope_section', v_section_id,
    COALESCE(v_section->>'name','Section'),
    jsonb_build_object('template_id', _template_id, 'items_created', v_items));

  RETURN v_section_id;
END $function$;

CREATE OR REPLACE FUNCTION public.insert_template_item(_project_id uuid, _template_id uuid, _section_index integer, _item_index integer, _target_section_id uuid, _room_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_tpl public.scope_templates%ROWTYPE;
  v_item jsonb; v_sort int; v_new_id uuid; v_tp uuid; v_to uuid;
BEGIN
  SELECT * INTO v_tpl FROM public.scope_templates WHERE id = _template_id AND is_active = true;
  IF v_tpl.id IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF NOT v_tpl.is_system_template AND (v_tpl.organization_id IS NULL OR v_tpl.organization_id <> v_org) THEN
    RAISE EXCEPTION 'Template not accessible';
  END IF;

  SELECT project_id, organization_id INTO v_tp, v_to
  FROM public.scope_sections WHERE id = _target_section_id;
  IF v_tp IS NULL OR v_tp <> _project_id OR v_to <> v_org THEN
    RAISE EXCEPTION 'Target section not in project';
  END IF;
  IF _room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_rooms WHERE id = _room_id AND project_id = _project_id AND organization_id = v_org
  ) THEN RAISE EXCEPTION 'Room not in project'; END IF;

  v_item := ((COALESCE(v_tpl.template_data->'sections','[]'::jsonb) -> _section_index) -> 'items') -> _item_index;
  IF v_item IS NULL THEN RAISE EXCEPTION 'Template item not found'; END IF;

  SELECT COALESCE(MAX(sort_order),-1)+1 INTO v_sort FROM public.scope_items
   WHERE section_id = _target_section_id AND organization_id = v_org;

  INSERT INTO public.scope_items (organization_id, project_id, section_id, room_id, title,
    scope_item_key, trade_key, action_key, description, sort_order, created_by,
    is_included, completion_status, origin_type, origin_ref, origin_at)
  VALUES (v_org, _project_id, _target_section_id, _room_id, COALESCE(v_item->>'title','Item'),
    v_item->>'scope_item_key', v_item->>'trade_key',
    NULLIF(v_item->>'action_key','')::public.scope_action,
    v_item->>'description', v_sort, auth.uid(), true, 'draft',
    'template', _template_id, now())
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END $function$;

-- 3. PRICING INHERITANCE AT CREATION ------------------------------------

CREATE OR REPLACE FUNCTION public.create_estimate_from_scope(_project_id uuid, _title text DEFAULT ''::text, _pricing jsonb DEFAULT NULL::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_version int;
  v_estimate uuid;
  v_currency text;
  v_count int := 0;
  v_priced jsonb;
  v_o public.organizations%ROWTYPE;
  v_method text;
  v_target numeric;
  v_oh numeric;
  v_profit numeric;
  v_rate numeric;
  v_tax numeric;
BEGIN
  SELECT COALESCE(MAX(version),0)+1 INTO v_version FROM public.estimates WHERE project_id = _project_id;
  SELECT * INTO v_o FROM public.organizations WHERE id = v_org;

  v_currency := COALESCE(v_o.currency, 'USD');
  v_tax := COALESCE(v_o.tax_rate, 0);
  v_rate := COALESCE(NULLIF(v_o.default_labor_rate, 0), 65);
  v_method := COALESCE(NULLIF(btrim(v_o.default_pricing_method), ''), 'overhead_profit');
  IF v_method NOT IN ('overhead_profit','target_gross_margin') THEN
    v_method := 'overhead_profit';
  END IF;

  /* Mutually exclusive by construction: only the active method's inputs survive. */
  IF v_method = 'target_gross_margin' THEN
    v_target := COALESCE(v_o.default_target_gross_margin_pct, 0);
    IF v_target < 0 OR v_target >= 100 THEN v_target := 0; END IF;
    v_oh := 0; v_profit := 0;
  ELSE
    v_target := 0;
    v_oh := COALESCE(v_o.default_overhead_pct, 10);
    v_profit := COALESCE(v_o.default_profit_pct, 10);
  END IF;

  INSERT INTO public.estimates (organization_id, project_id, version, title, status,
    currency, tax_rate, created_by, pricing_method, target_gross_margin_pct,
    default_overhead_pct, default_profit_pct, default_labor_rate)
  VALUES (v_org, _project_id, v_version,
    COALESCE(NULLIF(btrim(_title),''), 'Estimate v' || v_version), 'draft',
    v_currency, v_tax, auth.uid(), v_method, v_target, v_oh, v_profit, v_rate)
  RETURNING id INTO v_estimate;

  INSERT INTO public.estimate_line_items (organization_id, project_id, estimate_id,
    scope_item_id, scope_section_id, room_id, group_label, description,
    category_key, subcategory_key, trade_key, quantity, unit_key,
    is_client_visible, internal_notes, sort_order, created_by,
    overhead_pct, profit_pct, contingency_pct,
    origin_type, origin_ref, origin_at,
    quantity_basis, quantity_basis_note, quantity_basis_formula, quantity_source_measurement_id)
  SELECT v_org, _project_id, v_estimate, si.id, si.section_id, si.room_id,
    ss.name, si.title, si.category_key, si.subcategory_key, si.trade_key,
    COALESCE(si.quantity, 1), si.unit_key, si.is_client_visible, si.internal_notes,
    (ss.sort_order * 1000) + si.sort_order, auth.uid(), 0, 0, 0,
    'scope_sync', si.id, now(),
    si.quantity_basis, si.quantity_basis_note, si.quantity_basis_formula,
    si.quantity_source_measurement_id
  FROM public.scope_items si
  JOIN public.scope_sections ss ON ss.id = si.section_id
  WHERE si.project_id = _project_id AND si.organization_id = v_org
    AND si.archived_at IS NULL AND si.is_included = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  v_priced := public.kb_apply_pricing(v_estimate, _pricing, true);

  /* Lines with no Knowledge Base match inherit the estimate's own snapshot,
     never a hard-coded 10/10, and stay at zero under target-margin pricing. */
  PERFORM set_config('vw.kb_pricing', 'on', true);
  UPDATE public.estimate_line_items
     SET overhead_pct = v_oh, profit_pct = v_profit
   WHERE estimate_id = v_estimate AND overhead_pct = 0 AND profit_pct = 0;
  PERFORM set_config('vw.kb_pricing', 'off', true);

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, _project_id, v_estimate, auth.uid(), 'created', 'estimate', v_estimate,
    'Estimate generated from scope',
    jsonb_build_object('lines', v_count, 'version', v_version,
      'pricing_inherited', jsonb_build_object(
        'source', 'organization_defaults', 'organization_id', v_org,
        'pricing_method', v_method, 'target_gross_margin_pct', v_target,
        'default_overhead_pct', v_oh, 'default_profit_pct', v_profit,
        'default_labor_rate', v_rate, 'tax_rate', v_tax))
    || COALESCE(v_priced, '{}'::jsonb));

  RETURN v_estimate;
END $function$;

-- 4. GEOMETRY RE-DERIVATION ---------------------------------------------

CREATE OR REPLACE FUNCTION public.rederive_measurement_quantities(_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_m public.project_measurements%ROWTYPE;
  v_scope int := 0;
  v_lines int := 0;
  r record;
  v_qty numeric;
  v_note text;
  v_base numeric;
  v_waste numeric;
BEGIN
  SELECT * INTO v_m FROM public.project_measurements
   WHERE project_id = _project_id AND organization_id = v_org AND room_id IS NULL
   ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('scope_items', 0, 'estimate_lines', 0, 'reason', 'no_measurement');
  END IF;

  FOR r IN
    SELECT id, quantity_basis_formula, title
      FROM public.scope_items
     WHERE project_id = _project_id AND organization_id = v_org
       AND archived_at IS NULL
       AND quantity_basis = 'geometry_derived'
       AND quantity_basis_formula ? 'kind'
  LOOP
    v_waste := COALESCE((r.quantity_basis_formula->>'wastePct')::numeric, 0);
    v_base := NULL;
    CASE r.quantity_basis_formula->>'kind'
      WHEN 'floor_area', 'ceiling_area' THEN
        v_base := COALESCE(v_m.width_ft,0) * COALESCE(v_m.length_ft,0);
        v_note := format('%s ft x %s ft = %s SF', v_m.length_ft, v_m.width_ft, round(v_base,2));
      WHEN 'wall_area' THEN
        v_base := 2 * (COALESCE(v_m.width_ft,0) + COALESCE(v_m.length_ft,0)) * COALESCE(v_m.ceiling_height_ft,0);
        v_note := format('perimeter %s LF x %s ft height = %s SF',
          round(2*(COALESCE(v_m.width_ft,0)+COALESCE(v_m.length_ft,0)),2),
          v_m.ceiling_height_ft, round(v_base,2));
      WHEN 'perimeter_lf' THEN
        v_base := 2 * (COALESCE(v_m.width_ft,0) + COALESCE(v_m.length_ft,0));
        v_note := format('perimeter of %s ft x %s ft = %s LF', v_m.length_ft, v_m.width_ft, round(v_base,2));
      WHEN 'volume' THEN
        v_base := COALESCE(v_m.width_ft,0) * COALESCE(v_m.length_ft,0) * COALESCE(v_m.ceiling_height_ft,0);
        v_note := format('%s x %s x %s = %s CF', v_m.length_ft, v_m.width_ft, v_m.ceiling_height_ft, round(v_base,2));
      ELSE
        v_base := NULL;
    END CASE;

    CONTINUE WHEN v_base IS NULL OR v_base <= 0;

    v_qty := round(v_base * (1 + v_waste/100.0), 2);
    IF v_waste > 0 THEN
      v_note := v_note || format('; +%s%% waste = %s', v_waste, v_qty);
    END IF;

    UPDATE public.scope_items
       SET quantity = v_qty,
           quantity_basis_note = v_note,
           quantity_source_measurement_id = v_m.id
     WHERE id = r.id;
    v_scope := v_scope + 1;

    /* Estimate lines that are still derived follow the scope quantity.
       Contractor-entered quantities are never overwritten. */
    UPDATE public.estimate_line_items li
       SET quantity = v_qty,
           quantity_basis_note = v_note,
           quantity_source_measurement_id = v_m.id,
           is_quantity_placeholder = false
     WHERE li.scope_item_id = r.id
       AND li.archived_at IS NULL
       AND li.organization_id = v_org
       AND li.quantity_basis = 'geometry_derived';
    v_lines := v_lines + (SELECT count(*) FROM public.estimate_line_items li
                           WHERE li.scope_item_id = r.id AND li.archived_at IS NULL
                             AND li.quantity_basis = 'geometry_derived');
  END LOOP;

  RETURN jsonb_build_object('scope_items', v_scope, 'estimate_lines', v_lines,
                            'measurement_id', v_m.id);
END $function$;

GRANT EXECUTE ON FUNCTION public.rederive_measurement_quantities(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_scope_template(uuid, uuid, uuid, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.template_matches_project(text, text) TO authenticated;
