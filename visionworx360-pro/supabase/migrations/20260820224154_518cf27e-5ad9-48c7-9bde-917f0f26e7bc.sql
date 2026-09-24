-- 1) Provenance reference becomes a generic text reference
ALTER TABLE public.scope_items
  ALTER COLUMN origin_ref TYPE text USING origin_ref::text;
ALTER TABLE public.estimate_line_items
  ALTER COLUMN origin_ref TYPE text USING origin_ref::text;

-- 2) Template compatibility on EVERY insertion path
CREATE OR REPLACE FUNCTION public.insert_template_section(_project_id uuid, _template_id uuid, _section_index integer, _room_id uuid, _confirm_mismatch boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_tpl public.scope_templates%ROWTYPE;
  v_project_type text;
  v_section jsonb; v_item jsonb; v_section_id uuid; v_sort int; v_idx int := 0; v_items int := 0;
BEGIN
  SELECT * INTO v_tpl FROM public.scope_templates WHERE id = _template_id AND is_active = true;
  IF v_tpl.id IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF NOT v_tpl.is_system_template AND (v_tpl.organization_id IS NULL OR v_tpl.organization_id <> v_org) THEN
    RAISE EXCEPTION 'Template not accessible';
  END IF;

  SELECT project_type_key INTO v_project_type FROM public.projects WHERE id = _project_id;
  IF NOT COALESCE(_confirm_mismatch, false)
     AND NOT public.template_matches_project(v_project_type, v_tpl.project_type_key) THEN
    RAISE EXCEPTION 'template_project_type_mismatch:%:%',
      COALESCE(v_project_type,'unknown'), COALESCE(v_tpl.project_type_key,'unknown');
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
      'template', _template_id::text, now());
    v_idx := v_idx + 1; v_items := v_items + 1;
  END LOOP;
  PERFORM set_config('app.suppress_scope_activity','off', true);

  INSERT INTO public.project_activity (organization_id, project_id, actor_user_id,
    activity_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, _project_id, auth.uid(), 'applied', 'scope_section', v_section_id,
    COALESCE(v_section->>'name','Section'),
    jsonb_build_object('template_id', _template_id, 'items_created', v_items,
      'project_type_key', v_project_type,
      'template_project_type_key', v_tpl.project_type_key,
      'mismatch_confirmed', COALESCE(_confirm_mismatch,false)));

  RETURN v_section_id;
END $function$;

CREATE OR REPLACE FUNCTION public.insert_template_item(_project_id uuid, _template_id uuid, _section_index integer, _item_index integer, _target_section_id uuid, _room_id uuid, _confirm_mismatch boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_tpl public.scope_templates%ROWTYPE;
  v_project_type text;
  v_item jsonb; v_sort int; v_new_id uuid; v_tp uuid; v_to uuid;
BEGIN
  SELECT * INTO v_tpl FROM public.scope_templates WHERE id = _template_id AND is_active = true;
  IF v_tpl.id IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF NOT v_tpl.is_system_template AND (v_tpl.organization_id IS NULL OR v_tpl.organization_id <> v_org) THEN
    RAISE EXCEPTION 'Template not accessible';
  END IF;

  SELECT project_type_key INTO v_project_type FROM public.projects WHERE id = _project_id;
  IF NOT COALESCE(_confirm_mismatch, false)
     AND NOT public.template_matches_project(v_project_type, v_tpl.project_type_key) THEN
    RAISE EXCEPTION 'template_project_type_mismatch:%:%',
      COALESCE(v_project_type,'unknown'), COALESCE(v_tpl.project_type_key,'unknown');
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
    'template', _template_id::text, now())
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END $function$;

-- 3) Estimate-level pricing confirmation state
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS pricing_confirmation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pricing_confirmation_reason text,
  ADD COLUMN IF NOT EXISTS pricing_source text,
  ADD COLUMN IF NOT EXISTS pricing_confirmed_at timestamp with time zone;

-- 4) Gross-margin / overhead+profit mutex enforced in PERSISTED state
CREATE OR REPLACE FUNCTION public.enforce_estimate_pricing_mutex()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.pricing_method, 'overhead_profit') = 'target_gross_margin' THEN
    NEW.default_overhead_pct := 0;
    NEW.default_profit_pct := 0;
  ELSE
    NEW.target_gross_margin_pct := 0;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS estimates_pricing_mutex ON public.estimates;
CREATE TRIGGER estimates_pricing_mutex
BEFORE INSERT OR UPDATE ON public.estimates
FOR EACH ROW EXECUTE FUNCTION public.enforce_estimate_pricing_mutex();

-- 5) Measurement re-derivation failures must be visible
ALTER TABLE public.project_measurements
  ADD COLUMN IF NOT EXISTS quantities_stale_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS quantities_stale_reason text;
