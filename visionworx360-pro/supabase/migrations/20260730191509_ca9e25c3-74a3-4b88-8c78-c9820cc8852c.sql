-- 1. New scope item fields
DO $$ BEGIN
  CREATE TYPE public.scope_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.scope_items
  ADD COLUMN IF NOT EXISTS category_key text,
  ADD COLUMN IF NOT EXISTS subcategory_key text,
  ADD COLUMN IF NOT EXISTS priority public.scope_priority NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS is_client_visible boolean NOT NULL DEFAULT true;

-- 2. Attachments (scope item <-> project document)
CREATE TABLE IF NOT EXISTS public.scope_item_documents (
  scope_item_id uuid NOT NULL REFERENCES public.scope_items(id) ON DELETE CASCADE,
  project_document_id uuid NOT NULL REFERENCES public.project_documents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_item_id, project_document_id)
);

GRANT SELECT, INSERT, DELETE ON public.scope_item_documents TO authenticated;
GRANT ALL ON public.scope_item_documents TO service_role;

ALTER TABLE public.scope_item_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sid_select" ON public.scope_item_documents;
CREATE POLICY "sid_select" ON public.scope_item_documents
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "sid_insert" ON public.scope_item_documents;
CREATE POLICY "sid_insert" ON public.scope_item_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "sid_delete" ON public.scope_item_documents;
CREATE POLICY "sid_delete" ON public.scope_item_documents
  FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS scope_item_documents_item_idx
  ON public.scope_item_documents(scope_item_id);

CREATE OR REPLACE FUNCTION public.validate_scope_item_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i RECORD; d RECORD;
BEGIN
  SELECT project_id, organization_id INTO i FROM public.scope_items WHERE id = NEW.scope_item_id;
  IF NOT FOUND OR i.project_id <> NEW.project_id OR i.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'scope_item_document.scope_item must belong to same project/org' USING ERRCODE='42501';
  END IF;
  SELECT project_id, organization_id INTO d FROM public.project_documents WHERE id = NEW.project_document_id;
  IF NOT FOUND OR d.project_id <> NEW.project_id OR d.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'scope_item_document.document must belong to same project/org' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_scope_item_document ON public.scope_item_documents;
CREATE TRIGGER trg_validate_scope_item_document
  BEFORE INSERT ON public.scope_item_documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_scope_item_document();

-- 3. Permanent delete of a scope item
CREATE OR REPLACE FUNCTION public.delete_scope_item(_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_project uuid; v_title text;
BEGIN
  SELECT organization_id, project_id, title INTO v_org, v_project, v_title
  FROM public.scope_items WHERE id = _item_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_project);

  DELETE FROM public.scope_item_photos WHERE scope_item_id = _item_id;
  DELETE FROM public.scope_item_documents WHERE scope_item_id = _item_id;
  PERFORM set_config('app.suppress_scope_activity','on', true);
  DELETE FROM public.scope_items WHERE id = _item_id;
  PERFORM set_config('app.suppress_scope_activity','off', true);

  INSERT INTO public.project_activity (organization_id, project_id, actor_user_id,
    activity_type, entity_type, entity_id, summary)
  VALUES (v_org, v_project, auth.uid(), 'archived', 'scope_item', _item_id,
    COALESCE(v_title,'Scope item') || ' (deleted)');
END $$;

-- 4. Ordered move between sections
CREATE OR REPLACE FUNCTION public.move_scope_item_to_position(
  _item_id uuid, _new_section_id uuid, _new_room_id uuid, _new_index integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_project uuid; v_tp uuid; v_to uuid; v_id uuid; v_idx int := 0;
BEGIN
  SELECT organization_id, project_id INTO v_org, v_project
  FROM public.scope_items WHERE id = _item_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_project);

  SELECT project_id, organization_id INTO v_tp, v_to
  FROM public.scope_sections WHERE id = _new_section_id;
  IF v_tp IS NULL OR v_tp <> v_project OR v_to <> v_org THEN
    RAISE EXCEPTION 'Target section not in project';
  END IF;
  IF _new_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_rooms
    WHERE id = _new_room_id AND project_id = v_project AND organization_id = v_org
  ) THEN RAISE EXCEPTION 'Target room not in project'; END IF;

  PERFORM set_config('app.suppress_scope_activity','on', true);

  UPDATE public.scope_items
     SET section_id = _new_section_id,
         room_id = _new_room_id,
         sort_order = -1,
         updated_at = now()
   WHERE id = _item_id;

  FOR v_id IN
    SELECT id FROM (
      SELECT id, sort_order,
             CASE WHEN id = _item_id THEN 0 ELSE 1 END AS self_rank
      FROM public.scope_items
      WHERE section_id = _new_section_id AND organization_id = v_org AND archived_at IS NULL
      ORDER BY sort_order ASC, self_rank ASC, created_at ASC
    ) q
  LOOP
    IF v_id = _item_id THEN CONTINUE; END IF;
    IF v_idx = GREATEST(_new_index, 0) THEN
      UPDATE public.scope_items SET sort_order = v_idx WHERE id = _item_id;
      v_idx := v_idx + 1;
    END IF;
    UPDATE public.scope_items SET sort_order = v_idx WHERE id = v_id;
    v_idx := v_idx + 1;
  END LOOP;

  UPDATE public.scope_items SET sort_order = v_idx WHERE id = _item_id AND sort_order = -1;

  PERFORM set_config('app.suppress_scope_activity','off', true);

  INSERT INTO public.project_activity (organization_id, project_id, actor_user_id,
    activity_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, v_project, auth.uid(), 'moved', 'scope_item', _item_id, 'Scope item moved',
    jsonb_build_object('section_id', _new_section_id, 'room_id', _new_room_id, 'index', _new_index));
END $$;

-- 5. Granular template insertion (never overwrites)
CREATE OR REPLACE FUNCTION public.insert_template_section(
  _project_id uuid, _template_id uuid, _section_index integer, _room_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      is_included, completion_status)
    VALUES (v_org, _project_id, v_section_id, _room_id, COALESCE(v_item->>'title','Item'),
      v_item->>'scope_item_key', v_item->>'trade_key',
      NULLIF(v_item->>'action_key','')::public.scope_action,
      v_item->>'description', v_idx, auth.uid(), true, 'draft');
    v_idx := v_idx + 1; v_items := v_items + 1;
  END LOOP;
  PERFORM set_config('app.suppress_scope_activity','off', true);

  INSERT INTO public.project_activity (organization_id, project_id, actor_user_id,
    activity_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, _project_id, auth.uid(), 'applied', 'scope_section', v_section_id,
    COALESCE(v_section->>'name','Section'),
    jsonb_build_object('template_id', _template_id, 'items_created', v_items));

  RETURN v_section_id;
END $$;

CREATE OR REPLACE FUNCTION public.insert_template_item(
  _project_id uuid, _template_id uuid, _section_index integer, _item_index integer,
  _target_section_id uuid, _room_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    is_included, completion_status)
  VALUES (v_org, _project_id, _target_section_id, _room_id, COALESCE(v_item->>'title','Item'),
    v_item->>'scope_item_key', v_item->>'trade_key',
    NULLIF(v_item->>'action_key','')::public.scope_action,
    v_item->>'description', v_sort, auth.uid(), true, 'draft')
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END $$;
