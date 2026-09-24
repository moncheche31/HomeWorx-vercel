
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.scope_unit AS ENUM (
    'each','linear_foot','square_foot','cubic_foot','cubic_yard','sheet','board_foot',
    'gallon','pound','hour','day','allowance','lump_sum','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.scope_action AS ENUM (
    'install','remove','replace','repair','refinish','paint','clean','relocate',
    'modify','build','inspect','protect','supply_only','labor_only','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.scope_confidence AS ENUM (
    'confirmed','needs_verification','assumed','customer_decision_required','not_applicable'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.scope_completion AS ENUM (
    'draft','ready','approved','deferred','completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.activity_entity_type ADD VALUE IF NOT EXISTS 'scope_section';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.activity_entity_type ADD VALUE IF NOT EXISTS 'scope_item';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.activity_entity_type ADD VALUE IF NOT EXISTS 'scope_template';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'applied';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'duplicated';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'moved';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'bulk_updated';
EXCEPTION WHEN others THEN NULL; END $$;

-- ============ TABLES ============
CREATE TABLE IF NOT EXISTS public.scope_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  section_key text,
  trade_key text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_scope_sections_project ON public.scope_sections(project_id, sort_order);
CREATE INDEX IF NOT EXISTS ix_scope_sections_room ON public.scope_sections(room_id);
CREATE INDEX IF NOT EXISTS ix_scope_sections_org ON public.scope_sections(organization_id);

GRANT SELECT, INSERT, UPDATE ON public.scope_sections TO authenticated;
GRANT ALL ON public.scope_sections TO service_role;
ALTER TABLE public.scope_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scope_sections_select_org" ON public.scope_sections FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "scope_sections_insert_org" ON public.scope_sections FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "scope_sections_update_org" ON public.scope_sections FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TABLE IF NOT EXISTS public.scope_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.scope_sections(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  scope_item_key text,
  trade_key text,
  action_key public.scope_action,
  description text,
  quantity numeric,
  unit_key public.scope_unit,
  material_selection text,
  finish_selection text,
  labor_notes text,
  customer_notes text,
  internal_notes text,
  assumptions text,
  exclusions text,
  is_included boolean NOT NULL DEFAULT true,
  is_customer_selection boolean NOT NULL DEFAULT false,
  confidence_status public.scope_confidence,
  completion_status public.scope_completion NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_scope_items_section ON public.scope_items(section_id, sort_order);
CREATE INDEX IF NOT EXISTS ix_scope_items_project ON public.scope_items(project_id);
CREATE INDEX IF NOT EXISTS ix_scope_items_room ON public.scope_items(room_id);
CREATE INDEX IF NOT EXISTS ix_scope_items_org ON public.scope_items(organization_id);
CREATE INDEX IF NOT EXISTS ix_scope_items_trade ON public.scope_items(trade_key);

GRANT SELECT, INSERT, UPDATE ON public.scope_items TO authenticated;
GRANT ALL ON public.scope_items TO service_role;
ALTER TABLE public.scope_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scope_items_select_org" ON public.scope_items FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "scope_items_insert_org" ON public.scope_items FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "scope_items_update_org" ON public.scope_items FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TABLE IF NOT EXISTS public.scope_item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scope_item_id uuid NOT NULL REFERENCES public.scope_items(id) ON DELETE CASCADE,
  project_photo_id uuid NOT NULL REFERENCES public.project_photos(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope_item_id, project_photo_id)
);
CREATE INDEX IF NOT EXISTS ix_scope_item_photos_item ON public.scope_item_photos(scope_item_id);
CREATE INDEX IF NOT EXISTS ix_scope_item_photos_photo ON public.scope_item_photos(project_photo_id);

GRANT SELECT, INSERT, DELETE ON public.scope_item_photos TO authenticated;
GRANT ALL ON public.scope_item_photos TO service_role;
ALTER TABLE public.scope_item_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scope_item_photos_select_org" ON public.scope_item_photos FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "scope_item_photos_insert_org" ON public.scope_item_photos FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "scope_item_photos_delete_org" ON public.scope_item_photos FOR DELETE TO authenticated
  USING (public.is_org_member(organization_id));

CREATE TABLE IF NOT EXISTS public.scope_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  name text NOT NULL,
  description text,
  is_system_template boolean NOT NULL DEFAULT false,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_category_key text,
  project_type_key text,
  project_subtype_key text,
  business_type_key text,
  template_data jsonb NOT NULL DEFAULT '{"sections":[]}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_key, organization_id)
);
CREATE INDEX IF NOT EXISTS ix_scope_templates_org ON public.scope_templates(organization_id);
CREATE INDEX IF NOT EXISTS ix_scope_templates_type ON public.scope_templates(project_type_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_scope_templates_system_key
  ON public.scope_templates(template_key) WHERE organization_id IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.scope_templates TO authenticated;
GRANT ALL ON public.scope_templates TO service_role;
ALTER TABLE public.scope_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scope_templates_select_visible" ON public.scope_templates FOR SELECT TO authenticated
  USING (is_system_template OR (organization_id IS NOT NULL AND public.is_org_member(organization_id)));
CREATE POLICY "scope_templates_insert_org" ON public.scope_templates FOR INSERT TO authenticated
  WITH CHECK (is_system_template = false AND organization_id IS NOT NULL AND public.is_org_member(organization_id));
CREATE POLICY "scope_templates_update_org" ON public.scope_templates FOR UPDATE TO authenticated
  USING (is_system_template = false AND organization_id IS NOT NULL AND public.is_org_member(organization_id))
  WITH CHECK (is_system_template = false AND organization_id IS NOT NULL AND public.is_org_member(organization_id));

-- ============ UPDATED_AT TRIGGERS ============
DROP TRIGGER IF EXISTS trg_scope_sections_updated_at ON public.scope_sections;
CREATE TRIGGER trg_scope_sections_updated_at BEFORE UPDATE ON public.scope_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_scope_items_updated_at ON public.scope_items;
CREATE TRIGGER trg_scope_items_updated_at BEFORE UPDATE ON public.scope_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_scope_templates_updated_at ON public.scope_templates;
CREATE TRIGGER trg_scope_templates_updated_at BEFORE UPDATE ON public.scope_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CROSS-ENTITY GUARDS ============
CREATE OR REPLACE FUNCTION public.assert_scope_section_consistency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE proj_org uuid;
BEGIN
  SELECT organization_id INTO proj_org FROM public.projects WHERE id = NEW.project_id;
  IF proj_org IS NULL OR proj_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Project does not belong to organization';
  END IF;
  IF NEW.room_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.project_rooms
      WHERE id = NEW.room_id AND project_id = NEW.project_id AND organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'Room does not belong to project';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_scope_sections_consistency ON public.scope_sections;
CREATE TRIGGER trg_scope_sections_consistency BEFORE INSERT OR UPDATE ON public.scope_sections
  FOR EACH ROW EXECUTE FUNCTION public.assert_scope_section_consistency();

CREATE OR REPLACE FUNCTION public.assert_scope_item_consistency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sec_project uuid; sec_org uuid;
BEGIN
  SELECT project_id, organization_id INTO sec_project, sec_org
  FROM public.scope_sections WHERE id = NEW.section_id;
  IF sec_project IS NULL THEN RAISE EXCEPTION 'Section not found'; END IF;
  IF sec_project <> NEW.project_id OR sec_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Section does not belong to project/organization';
  END IF;
  IF NEW.room_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.project_rooms
      WHERE id = NEW.room_id AND project_id = NEW.project_id AND organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'Room does not belong to project';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_scope_items_consistency ON public.scope_items;
CREATE TRIGGER trg_scope_items_consistency BEFORE INSERT OR UPDATE ON public.scope_items
  FOR EACH ROW EXECUTE FUNCTION public.assert_scope_item_consistency();

CREATE OR REPLACE FUNCTION public.assert_scope_item_photo_consistency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it_project uuid; it_org uuid; ph_project uuid; ph_org uuid;
BEGIN
  SELECT project_id, organization_id INTO it_project, it_org
  FROM public.scope_items WHERE id = NEW.scope_item_id;
  SELECT project_id, organization_id INTO ph_project, ph_org
  FROM public.project_photos WHERE id = NEW.project_photo_id;
  IF it_project IS NULL OR ph_project IS NULL THEN
    RAISE EXCEPTION 'Scope item or photo not found';
  END IF;
  IF it_project <> ph_project OR it_org <> ph_org THEN
    RAISE EXCEPTION 'Scope item and photo must belong to same project';
  END IF;
  NEW.organization_id := it_org;
  NEW.project_id := it_project;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_scope_item_photos_consistency ON public.scope_item_photos;
CREATE TRIGGER trg_scope_item_photos_consistency BEFORE INSERT OR UPDATE ON public.scope_item_photos
  FOR EACH ROW EXECUTE FUNCTION public.assert_scope_item_photo_consistency();

-- ============ ARCHIVE GUARD ============
CREATE OR REPLACE FUNCTION public.guard_scope_section_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND (OLD.archived_at IS NULL) THEN
    IF EXISTS (
      SELECT 1 FROM public.scope_items
      WHERE section_id = NEW.id AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'section_has_active_items';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_scope_sections_archive_guard ON public.scope_sections;
CREATE TRIGGER trg_scope_sections_archive_guard BEFORE UPDATE ON public.scope_sections
  FOR EACH ROW EXECUTE FUNCTION public.guard_scope_section_archive();

-- ============ ACTIVITY LOGGING ============
CREATE OR REPLACE FUNCTION public.log_scope_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entity public.activity_entity_type;
  v_activity public.activity_type;
  v_summary text;
BEGIN
  IF current_setting('app.suppress_scope_activity', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'scope_sections' THEN v_entity := 'scope_section';
  ELSIF TG_TABLE_NAME = 'scope_items' THEN v_entity := 'scope_item';
  ELSE RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN v_activity := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      v_activity := CASE WHEN NEW.archived_at IS NOT NULL THEN 'archived' ELSE 'restored' END;
    ELSE v_activity := 'updated'; END IF;
  ELSE RETURN NEW; END IF;

  IF v_entity = 'scope_section' THEN v_summary := NEW.name;
  ELSE v_summary := NEW.title; END IF;

  INSERT INTO public.project_activity
    (organization_id, project_id, actor_user_id, activity_type, entity_type, entity_id, summary)
  VALUES
    (NEW.organization_id, NEW.project_id, COALESCE(auth.uid(), NEW.created_by),
     v_activity, v_entity, NEW.id, v_summary);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_scope_sections_activity ON public.scope_sections;
CREATE TRIGGER trg_scope_sections_activity AFTER INSERT OR UPDATE ON public.scope_sections
  FOR EACH ROW EXECUTE FUNCTION public.log_scope_activity();
DROP TRIGGER IF EXISTS trg_scope_items_activity ON public.scope_items;
CREATE TRIGGER trg_scope_items_activity AFTER INSERT OR UPDATE ON public.scope_items
  FOR EACH ROW EXECUTE FUNCTION public.log_scope_activity();

-- ============ RPC: reorder ============
CREATE OR REPLACE FUNCTION public.reorder_scope_sections(_project_id uuid, _ordered_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.assert_project_in_active_org(_project_id); v_id uuid; v_idx int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(_ordered_ids) AS x(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.scope_sections
      WHERE id = x.id AND project_id = _project_id AND organization_id = v_org)) THEN
    RAISE EXCEPTION 'Section not in project';
  END IF;
  PERFORM set_config('app.suppress_scope_activity','on', true);
  FOREACH v_id IN ARRAY _ordered_ids LOOP
    UPDATE public.scope_sections SET sort_order = v_idx, updated_at = now()
      WHERE id = v_id AND project_id = _project_id AND organization_id = v_org;
    v_idx := v_idx + 1;
  END LOOP;
  PERFORM set_config('app.suppress_scope_activity','off', true);
  INSERT INTO public.project_activity (organization_id, project_id, actor_user_id,
    activity_type, entity_type, summary, metadata)
  VALUES (v_org, _project_id, auth.uid(), 'reordered', 'scope_section',
    'Scope sections reordered', jsonb_build_object('count', array_length(_ordered_ids,1)));
END; $$;

CREATE OR REPLACE FUNCTION public.reorder_scope_items(_section_id uuid, _ordered_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_project uuid; v_org uuid; v_id uuid; v_idx int := 0;
BEGIN
  SELECT project_id, organization_id INTO v_project, v_org
  FROM public.scope_sections WHERE id = _section_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Section not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_project);
  IF EXISTS (SELECT 1 FROM unnest(_ordered_ids) AS x(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.scope_items
      WHERE id = x.id AND section_id = _section_id AND organization_id = v_org)) THEN
    RAISE EXCEPTION 'Item not in section';
  END IF;
  PERFORM set_config('app.suppress_scope_activity','on', true);
  FOREACH v_id IN ARRAY _ordered_ids LOOP
    UPDATE public.scope_items SET sort_order = v_idx, updated_at = now()
      WHERE id = v_id AND section_id = _section_id AND organization_id = v_org;
    v_idx := v_idx + 1;
  END LOOP;
  PERFORM set_config('app.suppress_scope_activity','off', true);
  INSERT INTO public.project_activity (organization_id, project_id, actor_user_id,
    activity_type, entity_type, summary, metadata)
  VALUES (v_org, v_project, auth.uid(), 'reordered', 'scope_item',
    'Scope items reordered', jsonb_build_object('section_id', _section_id,
    'count', array_length(_ordered_ids,1)));
END; $$;

-- ============ RPC: duplicate ============
CREATE OR REPLACE FUNCTION public.duplicate_scope_item(_item_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_project uuid; v_new_id uuid; v_max int;
BEGIN
  SELECT organization_id, project_id INTO v_org, v_project
  FROM public.scope_items WHERE id = _item_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_project);
  SELECT COALESCE(MAX(sort_order),-1)+1 INTO v_max FROM public.scope_items
   WHERE section_id = (SELECT section_id FROM public.scope_items WHERE id = _item_id);
  INSERT INTO public.scope_items (organization_id, project_id, section_id, room_id, title,
    scope_item_key, trade_key, action_key, description, quantity, unit_key,
    material_selection, finish_selection, labor_notes, customer_notes, internal_notes,
    assumptions, exclusions, is_included, is_customer_selection, confidence_status,
    completion_status, sort_order, created_by)
  SELECT organization_id, project_id, section_id, room_id, title || ' (copy)',
    scope_item_key, trade_key, action_key, description, quantity, unit_key,
    material_selection, finish_selection, labor_notes, customer_notes, internal_notes,
    assumptions, exclusions, is_included, is_customer_selection, confidence_status,
    'draft'::public.scope_completion, v_max, auth.uid()
  FROM public.scope_items WHERE id = _item_id
  RETURNING id INTO v_new_id;
  INSERT INTO public.project_activity (organization_id, project_id, actor_user_id,
    activity_type, entity_type, entity_id, summary)
  VALUES (v_org, v_project, auth.uid(), 'duplicated', 'scope_item', v_new_id, 'Item duplicated');
  RETURN v_new_id;
END; $$;

-- ============ RPC: move item ============
DROP FUNCTION IF EXISTS public.move_scope_item(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.move_scope_item(_item_id uuid, _new_section_id uuid, _new_room_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_project uuid; v_target_project uuid; v_target_org uuid; v_max int;
BEGIN
  SELECT organization_id, project_id INTO v_org, v_project
  FROM public.scope_items WHERE id = _item_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_project);
  SELECT project_id, organization_id INTO v_target_project, v_target_org
  FROM public.scope_sections WHERE id = _new_section_id;
  IF v_target_project IS NULL OR v_target_project <> v_project OR v_target_org <> v_org THEN
    RAISE EXCEPTION 'Target section not in project';
  END IF;
  IF _new_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_rooms
    WHERE id = _new_room_id AND project_id = v_project AND organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'Target room not in project';
  END IF;
  SELECT COALESCE(MAX(sort_order),-1)+1 INTO v_max FROM public.scope_items WHERE section_id = _new_section_id;
  UPDATE public.scope_items SET section_id = _new_section_id, room_id = _new_room_id,
    sort_order = v_max, updated_at = now() WHERE id = _item_id;
  INSERT INTO public.project_activity (organization_id, project_id, actor_user_id,
    activity_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, v_project, auth.uid(), 'moved', 'scope_item', _item_id, 'Scope item moved',
    jsonb_build_object('section_id', _new_section_id, 'room_id', _new_room_id));
END; $$;

-- ============ RPC: bulk inclusion ============
CREATE OR REPLACE FUNCTION public.bulk_update_scope_inclusion(_project_id uuid, _item_ids uuid[], _is_included boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.assert_project_in_active_org(_project_id); v_count int;
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(_item_ids) AS x(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.scope_items
      WHERE id = x.id AND project_id = _project_id AND organization_id = v_org)) THEN
    RAISE EXCEPTION 'Item not in project';
  END IF;
  PERFORM set_config('app.suppress_scope_activity','on', true);
  UPDATE public.scope_items SET is_included = _is_included, updated_at = now()
    WHERE id = ANY(_item_ids) AND project_id = _project_id AND organization_id = v_org;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.suppress_scope_activity','off', true);
  INSERT INTO public.project_activity (organization_id, project_id, actor_user_id,
    activity_type, entity_type, summary, metadata)
  VALUES (v_org, _project_id, auth.uid(), 'bulk_updated', 'scope_item',
    CASE WHEN _is_included THEN 'Items marked included' ELSE 'Items marked excluded' END,
    jsonb_build_object('count', v_count));
  RETURN v_count;
END; $$;

-- ============ RPC: apply template ============
DROP FUNCTION IF EXISTS public.apply_scope_template(uuid, uuid, uuid, boolean);
CREATE OR REPLACE FUNCTION public.apply_scope_template(_project_id uuid, _template_id uuid,
  _room_id uuid, _allow_append boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_template public.scope_templates%ROWTYPE;
  v_sections int := 0; v_items int := 0;
  v_section jsonb; v_item jsonb; v_section_id uuid; v_next_sort int;
BEGIN
  SELECT * INTO v_template FROM public.scope_templates WHERE id = _template_id AND is_active = true;
  IF v_template.id IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF NOT v_template.is_system_template AND
     (v_template.organization_id IS NULL OR v_template.organization_id <> v_org) THEN
    RAISE EXCEPTION 'Template not accessible';
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
            is_included, completion_status)
          VALUES (v_org, _project_id, v_section_id, _room_id,
            COALESCE(v_item->>'title','Item'),
            v_item->>'scope_item_key', v_item->>'trade_key',
            NULLIF(v_item->>'action_key','')::public.scope_action,
            v_item->>'description', v_idx, auth.uid(), true, 'draft');
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
    'items_created', v_items, 'room_id', _room_id));

  RETURN jsonb_build_object('sections_created', v_sections, 'items_created', v_items);
END; $$;

-- ============ SEED SYSTEM TEMPLATES ============
INSERT INTO public.scope_templates (template_key, name, description, is_system_template, organization_id,
  project_category_key, project_type_key, template_data)
VALUES
('system_kitchen_remodel','Kitchen Remodel','Standard scope for a full kitchen remodel', true, NULL,
 'INTERIOR_REMODELING','kitchen_remodel',
 '{"sections":[
   {"name":"Demolition","section_key":"demolition","trade_key":"general","items":[
     {"title":"Remove existing cabinets and countertops","trade_key":"general","action_key":"remove"},
     {"title":"Remove flooring","trade_key":"flooring","action_key":"remove"},
     {"title":"Disconnect and remove appliances","trade_key":"general","action_key":"remove"}]},
   {"name":"Plumbing","section_key":"plumbing","trade_key":"plumbing","items":[
     {"title":"Rough plumbing for sink relocation","trade_key":"plumbing","action_key":"install"},
     {"title":"Install new shutoffs and supply lines","trade_key":"plumbing","action_key":"install"}]},
   {"name":"Electrical","section_key":"electrical","trade_key":"electrical","items":[
     {"title":"Add dedicated appliance circuits","trade_key":"electrical","action_key":"install"},
     {"title":"Install under-cabinet lighting","trade_key":"electrical","action_key":"install"},
     {"title":"Add GFCI receptacles at counters","trade_key":"electrical","action_key":"install"}]},
   {"name":"Cabinets & Countertops","section_key":"cabinets","trade_key":"cabinets","items":[
     {"title":"Install base and wall cabinets","trade_key":"cabinets","action_key":"install"},
     {"title":"Template and install countertops","trade_key":"countertops","action_key":"install"}]},
   {"name":"Flooring","section_key":"flooring","trade_key":"flooring","items":[
     {"title":"Install new kitchen flooring","trade_key":"flooring","action_key":"install"}]},
   {"name":"Paint & Trim","section_key":"painting","trade_key":"painting","items":[
     {"title":"Paint walls and ceilings","trade_key":"painting","action_key":"paint"},
     {"title":"Install/replace baseboards","trade_key":"carpentry","action_key":"install"}]}
 ]}'::jsonb),
('system_bathroom_remodel','Bathroom Remodel','Standard full bath remodel scope', true, NULL,
 'INTERIOR_REMODELING','bathroom_remodel',
 '{"sections":[
   {"name":"Demolition","section_key":"demolition","trade_key":"general","items":[
     {"title":"Remove tub/shower and surround","action_key":"remove"},
     {"title":"Remove vanity, toilet, flooring","action_key":"remove"}]},
   {"name":"Plumbing","section_key":"plumbing","trade_key":"plumbing","items":[
     {"title":"Rough plumbing for new fixtures","action_key":"install"},
     {"title":"Install new tub/shower valve","action_key":"install"}]},
   {"name":"Electrical","section_key":"electrical","trade_key":"electrical","items":[
     {"title":"GFCI outlets and vanity lighting","action_key":"install"},
     {"title":"Exhaust fan replacement","action_key":"replace"}]},
   {"name":"Tile & Waterproofing","section_key":"tile","trade_key":"tile","items":[
     {"title":"Waterproof shower substrate","action_key":"install"},
     {"title":"Install shower/floor tile","action_key":"install"}]},
   {"name":"Fixtures","section_key":"fixtures","trade_key":"plumbing","items":[
     {"title":"Install vanity, toilet, mirror","action_key":"install"},
     {"title":"Install trim (faucets, handles)","action_key":"install"}]},
   {"name":"Paint","section_key":"painting","trade_key":"painting","items":[
     {"title":"Paint walls and ceiling","action_key":"paint"}]}
 ]}'::jsonb),
('system_garage_conversion','Garage Conversion','Convert garage to conditioned living space', true, NULL,
 'INTERIOR_REMODELING','garage_conversion',
 '{"sections":[
   {"name":"Framing & Insulation","section_key":"framing","trade_key":"framing","items":[
     {"title":"Frame walls to code","action_key":"build"},
     {"title":"Insulate walls, ceiling, floor","action_key":"install"}]},
   {"name":"Electrical","section_key":"electrical","trade_key":"electrical","items":[
     {"title":"New circuits, outlets, lighting","action_key":"install"}]},
   {"name":"HVAC","section_key":"hvac","trade_key":"hvac","items":[
     {"title":"Extend HVAC to new space","action_key":"install"}]},
   {"name":"Drywall & Paint","section_key":"drywall","trade_key":"drywall","items":[
     {"title":"Hang, tape, finish drywall","action_key":"install"},
     {"title":"Prime and paint","action_key":"paint"}]},
   {"name":"Flooring","section_key":"flooring","trade_key":"flooring","items":[
     {"title":"Install finished flooring","action_key":"install"}]},
   {"name":"Trim & Doors","section_key":"trim","trade_key":"carpentry","items":[
     {"title":"Install interior doors and trim","action_key":"install"}]}
 ]}'::jsonb),
('system_basement_finish','Basement Finish','Finish an unfinished basement', true, NULL,
 'INTERIOR_REMODELING','basement_finish',
 '{"sections":[
   {"name":"Moisture & Prep","section_key":"general_conditions","trade_key":"general","items":[
     {"title":"Inspect and address moisture","action_key":"inspect"}]},
   {"name":"Framing & Insulation","section_key":"framing","trade_key":"framing","items":[
     {"title":"Frame partition walls","action_key":"build"},
     {"title":"Insulate perimeter walls","action_key":"install"}]},
   {"name":"Electrical","section_key":"electrical","trade_key":"electrical","items":[
     {"title":"Rough electrical and lighting","action_key":"install"}]},
   {"name":"Drywall & Ceiling","section_key":"drywall","trade_key":"drywall","items":[
     {"title":"Hang and finish drywall","action_key":"install"},
     {"title":"Install drop or drywall ceiling","action_key":"install"}]},
   {"name":"Flooring","section_key":"flooring","trade_key":"flooring","items":[
     {"title":"Install basement flooring","action_key":"install"}]},
   {"name":"Paint & Trim","section_key":"painting","trade_key":"painting","items":[
     {"title":"Prime and paint","action_key":"paint"},
     {"title":"Install trim and doors","action_key":"install"}]}
 ]}'::jsonb),
('system_roof_replacement','Roof Replacement','Tear-off and re-roof', true, NULL,
 'EXTERIOR','roof_replacement',
 '{"sections":[
   {"name":"Site Protection","section_key":"general_conditions","trade_key":"general","items":[
     {"title":"Protect landscaping and property","action_key":"protect"}]},
   {"name":"Tear-off","section_key":"demolition","trade_key":"roofing","items":[
     {"title":"Remove existing roofing to deck","action_key":"remove"},
     {"title":"Inspect and replace bad decking","action_key":"repair"}]},
   {"name":"Underlayment & Flashing","section_key":"roofing","trade_key":"roofing","items":[
     {"title":"Install ice & water shield","action_key":"install"},
     {"title":"Install synthetic underlayment","action_key":"install"},
     {"title":"Replace step and drip edge flashing","action_key":"replace"}]},
   {"name":"Shingles","section_key":"roofing","trade_key":"roofing","items":[
     {"title":"Install new shingles","action_key":"install"},
     {"title":"Install ridge vent and cap","action_key":"install"}]},
   {"name":"Cleanup","section_key":"cleanup","trade_key":"general","items":[
     {"title":"Magnetic sweep and haul-off","action_key":"clean"}]}
 ]}'::jsonb),
('system_deck_build','Deck Build','New deck build', true, NULL,
 'OUTDOOR_LIVING','deck_build',
 '{"sections":[
   {"name":"Permits & Layout","section_key":"permits","trade_key":"general","items":[
     {"title":"Pull building permit","action_key":"other"},
     {"title":"Layout and mark footings","action_key":"other"}]},
   {"name":"Footings & Framing","section_key":"framing","trade_key":"carpentry","items":[
     {"title":"Excavate and pour footings","action_key":"install"},
     {"title":"Install posts, beams, joists","action_key":"install"}]},
   {"name":"Decking & Rails","section_key":"trim","trade_key":"carpentry","items":[
     {"title":"Install decking boards","action_key":"install"},
     {"title":"Install railing system","action_key":"install"},
     {"title":"Build stairs","action_key":"build"}]},
   {"name":"Finish","section_key":"painting","trade_key":"painting","items":[
     {"title":"Seal or stain deck","action_key":"refinish"}]}
 ]}'::jsonb),
('system_exterior_paint','Exterior Painting','Full exterior repaint', true, NULL,
 'EXTERIOR','exterior_painting',
 '{"sections":[
   {"name":"Prep","section_key":"general_conditions","trade_key":"painting","items":[
     {"title":"Pressure wash exterior","action_key":"clean"},
     {"title":"Scrape and sand loose paint","action_key":"other"},
     {"title":"Caulk seams and gaps","action_key":"repair"}]},
   {"name":"Priming","section_key":"painting","trade_key":"painting","items":[
     {"title":"Spot prime bare surfaces","action_key":"paint"}]},
   {"name":"Painting","section_key":"painting","trade_key":"painting","items":[
     {"title":"Apply two coats to body","action_key":"paint"},
     {"title":"Paint trim and accents","action_key":"paint"},
     {"title":"Paint doors and shutters","action_key":"paint"}]}
 ]}'::jsonb),
('system_whole_house_general','Whole House — General','Placeholder scope for a whole-house project', true, NULL,
 'INTERIOR_REMODELING','whole_house_remodel',
 '{"sections":[
   {"name":"General Conditions","section_key":"general_conditions","trade_key":"general","items":[
     {"title":"Site protection and dust control","action_key":"protect"},
     {"title":"Dumpster and debris removal","action_key":"clean"}]},
   {"name":"Permits","section_key":"permits","trade_key":"general","items":[
     {"title":"Pull required permits","action_key":"other"}]},
   {"name":"Final Cleanup","section_key":"cleanup","trade_key":"general","items":[
     {"title":"Final construction clean","action_key":"clean"}]}
 ]}'::jsonb)
ON CONFLICT (template_key) WHERE organization_id IS NULL DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description,
    project_category_key = EXCLUDED.project_category_key,
    project_type_key = EXCLUDED.project_type_key,
    template_data = EXCLUDED.template_data,
    is_active = true, updated_at = now();
