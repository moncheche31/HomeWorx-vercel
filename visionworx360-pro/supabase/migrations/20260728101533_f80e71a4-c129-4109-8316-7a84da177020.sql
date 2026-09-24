-- ============================================================
-- Module 005 — Scope Builder foundation
-- ============================================================

-- ---------- ENUMS ----------
CREATE TYPE public.scope_unit AS ENUM (
  'each','linear_foot','square_foot','cubic_foot','cubic_yard','sheet',
  'board_foot','gallon','pound','hour','day','allowance','lump_sum','other'
);

CREATE TYPE public.scope_action AS ENUM (
  'install','remove','replace','repair','refinish','paint','clean',
  'relocate','modify','build','inspect','protect','supply_only','labor_only','other'
);

CREATE TYPE public.scope_confidence AS ENUM (
  'confirmed','needs_verification','assumed','customer_decision_required','not_applicable'
);

CREATE TYPE public.scope_completion AS ENUM (
  'draft','ready','approved','deferred','completed'
);

-- Extend existing activity enums
ALTER TYPE public.activity_entity_type ADD VALUE IF NOT EXISTS 'scope_section';
ALTER TYPE public.activity_entity_type ADD VALUE IF NOT EXISTS 'scope_item';
ALTER TYPE public.activity_entity_type ADD VALUE IF NOT EXISTS 'scope_template';

ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'applied';
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'duplicated';
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'moved';
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'bulk_updated';

-- ============================================================
-- TEMPLATES
-- ============================================================
CREATE TABLE public.scope_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  project_category_key text,
  project_type_key text,
  project_subtype_key text,
  business_type_key text,
  name text NOT NULL,
  description text,
  is_system_template boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  template_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scope_templates_system_no_org CHECK (
    (is_system_template AND organization_id IS NULL) OR
    (NOT is_system_template AND organization_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX scope_templates_system_key_uidx
  ON public.scope_templates (template_key) WHERE is_system_template;
CREATE UNIQUE INDEX scope_templates_org_key_uidx
  ON public.scope_templates (organization_id, template_key) WHERE NOT is_system_template;
CREATE INDEX scope_templates_org_idx ON public.scope_templates(organization_id);

GRANT SELECT, INSERT, UPDATE ON public.scope_templates TO authenticated;

ALTER TABLE public.scope_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY scope_templates_select ON public.scope_templates FOR SELECT TO authenticated USING (
  (is_system_template AND is_active) OR
  (organization_id IS NOT NULL AND public.is_org_member(organization_id))
);
CREATE POLICY scope_templates_insert ON public.scope_templates FOR INSERT TO authenticated WITH CHECK (
  NOT is_system_template
  AND organization_id IS NOT NULL
  AND public.is_org_member(organization_id)
  AND (public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'administrator'::app_role))
);
CREATE POLICY scope_templates_update ON public.scope_templates FOR UPDATE TO authenticated
  USING (
    NOT is_system_template
    AND organization_id IS NOT NULL
    AND public.is_org_member(organization_id)
    AND (public.has_role(auth.uid(),'owner'::app_role) OR public.has_role(auth.uid(),'administrator'::app_role))
  )
  WITH CHECK (
    NOT is_system_template
    AND organization_id IS NOT NULL
    AND public.is_org_member(organization_id)
  );

CREATE TRIGGER scope_templates_updated_at BEFORE UPDATE ON public.scope_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- SECTIONS
-- ============================================================
CREATE TABLE public.scope_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  section_key text,
  trade_key text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX scope_sections_project_idx ON public.scope_sections(project_id, organization_id);
CREATE INDEX scope_sections_room_idx ON public.scope_sections(room_id) WHERE room_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.scope_sections TO authenticated;

ALTER TABLE public.scope_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY scope_sections_select ON public.scope_sections FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY scope_sections_insert ON public.scope_sections FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY scope_sections_update ON public.scope_sections FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TRIGGER scope_sections_updated_at BEFORE UPDATE ON public.scope_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Same-project/org integrity for section.room_id
CREATE OR REPLACE FUNCTION public.validate_scope_section_room()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  IF NEW.room_id IS NULL THEN RETURN NEW; END IF;
  SELECT project_id, organization_id INTO r FROM public.project_rooms WHERE id = NEW.room_id;
  IF NOT FOUND OR r.project_id <> NEW.project_id OR r.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'scope_section.room_id must belong to the same project and organization'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER scope_sections_validate_room
  BEFORE INSERT OR UPDATE OF room_id, project_id, organization_id ON public.scope_sections
  FOR EACH ROW EXECUTE FUNCTION public.validate_scope_section_room();

-- ============================================================
-- ITEMS
-- ============================================================
CREATE TABLE public.scope_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  section_id uuid NOT NULL REFERENCES public.scope_sections(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  scope_item_key text,
  trade_key text,
  action_key public.scope_action,
  description text,
  quantity numeric CHECK (quantity IS NULL OR quantity >= 0),
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
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX scope_items_section_idx ON public.scope_items(section_id);
CREATE INDEX scope_items_project_idx ON public.scope_items(project_id, organization_id);
CREATE INDEX scope_items_room_idx ON public.scope_items(room_id) WHERE room_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.scope_items TO authenticated;

ALTER TABLE public.scope_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY scope_items_select ON public.scope_items FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY scope_items_insert ON public.scope_items FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY scope_items_update ON public.scope_items FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TRIGGER scope_items_updated_at BEFORE UPDATE ON public.scope_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Same-project/org integrity for item.section_id and item.room_id
CREATE OR REPLACE FUNCTION public.validate_scope_item_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s RECORD; r RECORD;
BEGIN
  SELECT project_id, organization_id INTO s FROM public.scope_sections WHERE id = NEW.section_id;
  IF NOT FOUND OR s.project_id <> NEW.project_id OR s.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'scope_item.section_id must belong to the same project and organization'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.room_id IS NOT NULL THEN
    SELECT project_id, organization_id INTO r FROM public.project_rooms WHERE id = NEW.room_id;
    IF NOT FOUND OR r.project_id <> NEW.project_id OR r.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'scope_item.room_id must belong to the same project and organization'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER scope_items_validate_refs
  BEFORE INSERT OR UPDATE OF section_id, room_id, project_id, organization_id ON public.scope_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_scope_item_refs();

-- Block archiving a section that still has active items
CREATE OR REPLACE FUNCTION public.block_archive_section_with_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.scope_items WHERE section_id = NEW.id AND archived_at IS NULL) THEN
      RAISE EXCEPTION 'section_has_active_items' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER scope_sections_block_archive
  BEFORE UPDATE OF archived_at ON public.scope_sections
  FOR EACH ROW EXECUTE FUNCTION public.block_archive_section_with_items();

-- ============================================================
-- ITEM PHOTOS (link table)
-- ============================================================
CREATE TABLE public.scope_item_photos (
  scope_item_id uuid NOT NULL REFERENCES public.scope_items(id) ON DELETE CASCADE,
  project_photo_id uuid NOT NULL REFERENCES public.project_photos(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_item_id, project_photo_id)
);
CREATE INDEX scope_item_photos_project_idx ON public.scope_item_photos(project_id, organization_id);

GRANT SELECT, INSERT, DELETE ON public.scope_item_photos TO authenticated;

ALTER TABLE public.scope_item_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY scope_item_photos_select ON public.scope_item_photos FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY scope_item_photos_insert ON public.scope_item_photos FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY scope_item_photos_delete ON public.scope_item_photos FOR DELETE TO authenticated
  USING (public.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.validate_scope_item_photo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i RECORD; p RECORD;
BEGIN
  SELECT project_id, organization_id INTO i FROM public.scope_items WHERE id = NEW.scope_item_id;
  IF NOT FOUND OR i.project_id <> NEW.project_id OR i.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'scope_item_photo.scope_item must belong to same project/org' USING ERRCODE='42501';
  END IF;
  SELECT project_id, organization_id INTO p FROM public.project_photos WHERE id = NEW.project_photo_id;
  IF NOT FOUND OR p.project_id <> NEW.project_id OR p.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'scope_item_photo.project_photo must belong to same project/org' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER scope_item_photos_validate
  BEFORE INSERT ON public.scope_item_photos
  FOR EACH ROW EXECUTE FUNCTION public.validate_scope_item_photo();

-- ============================================================
-- ACTIVITY TRIGGERS (table-specific, safe)
-- Each trigger checks a suppression flag so RPCs that log
-- explicitly are not duplicated.
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_scope_section_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_activity public.activity_type; v_summary text; suppressed text;
BEGIN
  suppressed := current_setting('scope.suppress_activity', true);
  IF suppressed = 'on' THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN v_activity := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      v_activity := CASE WHEN NEW.archived_at IS NOT NULL THEN 'archived' ELSE 'restored' END;
    ELSE v_activity := 'updated'; END IF;
  ELSE RETURN NEW; END IF;

  v_summary := NEW.name;

  INSERT INTO public.project_activity
    (organization_id, project_id, actor_user_id, activity_type, entity_type, entity_id, summary)
  VALUES
    (NEW.organization_id, NEW.project_id, COALESCE(auth.uid(), NEW.created_by),
     v_activity, 'scope_section', NEW.id, v_summary);
  RETURN NEW;
END $$;

CREATE TRIGGER scope_sections_activity
  AFTER INSERT OR UPDATE ON public.scope_sections
  FOR EACH ROW EXECUTE FUNCTION public.log_scope_section_activity();

CREATE OR REPLACE FUNCTION public.log_scope_item_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_activity public.activity_type; v_summary text; suppressed text;
BEGIN
  suppressed := current_setting('scope.suppress_activity', true);
  IF suppressed = 'on' THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN v_activity := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      v_activity := CASE WHEN NEW.archived_at IS NOT NULL THEN 'archived' ELSE 'restored' END;
    ELSE v_activity := 'updated'; END IF;
  ELSE RETURN NEW; END IF;

  v_summary := left(NEW.title, 160);

  INSERT INTO public.project_activity
    (organization_id, project_id, actor_user_id, activity_type, entity_type, entity_id, summary)
  VALUES
    (NEW.organization_id, NEW.project_id, COALESCE(auth.uid(), NEW.created_by),
     v_activity, 'scope_item', NEW.id, v_summary);
  RETURN NEW;
END $$;

CREATE TRIGGER scope_items_activity
  AFTER INSERT OR UPDATE ON public.scope_items
  FOR EACH ROW EXECUTE FUNCTION public.log_scope_item_activity();

-- ============================================================
-- TRANSACTIONAL RPCs
-- ============================================================

-- Duplicate a scope item (returns new item id)
CREATE OR REPLACE FUNCTION public.duplicate_scope_item(_item_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_new uuid; v_row public.scope_items;
BEGIN
  SELECT * INTO v_row FROM public.scope_items WHERE id = _item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  v_org := public.assert_project_in_active_org(v_row.project_id);

  PERFORM set_config('scope.suppress_activity','on',true);

  INSERT INTO public.scope_items (
    organization_id, project_id, room_id, section_id, title, scope_item_key, trade_key, action_key,
    description, quantity, unit_key, material_selection, finish_selection, labor_notes,
    customer_notes, internal_notes, assumptions, exclusions, is_included, is_customer_selection,
    confidence_status, completion_status, sort_order, created_by
  ) VALUES (
    v_row.organization_id, v_row.project_id, v_row.room_id, v_row.section_id,
    v_row.title || ' (copy)', v_row.scope_item_key, v_row.trade_key, v_row.action_key,
    v_row.description, v_row.quantity, v_row.unit_key, v_row.material_selection,
    v_row.finish_selection, v_row.labor_notes, v_row.customer_notes, v_row.internal_notes,
    v_row.assumptions, v_row.exclusions, v_row.is_included, v_row.is_customer_selection,
    v_row.confidence_status, v_row.completion_status, v_row.sort_order + 1, auth.uid()
  ) RETURNING id INTO v_new;

  INSERT INTO public.project_activity
    (organization_id, project_id, actor_user_id, activity_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, v_row.project_id, auth.uid(), 'duplicated','scope_item', v_new,
          left(v_row.title,160), jsonb_build_object('source_id', v_row.id));

  PERFORM set_config('scope.suppress_activity','off',true);
  RETURN v_new;
END $$;

-- Move a scope item to another section/room
CREATE OR REPLACE FUNCTION public.move_scope_item(
  _item_id uuid, _new_section_id uuid, _new_room_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.scope_items; v_section public.scope_sections; v_org uuid;
BEGIN
  SELECT * INTO v_row FROM public.scope_items WHERE id = _item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  v_org := public.assert_project_in_active_org(v_row.project_id);

  SELECT * INTO v_section FROM public.scope_sections WHERE id = _new_section_id;
  IF NOT FOUND OR v_section.project_id <> v_row.project_id OR v_section.organization_id <> v_row.organization_id THEN
    RAISE EXCEPTION 'section_not_in_project' USING ERRCODE='42501';
  END IF;

  PERFORM set_config('scope.suppress_activity','on',true);

  UPDATE public.scope_items
     SET section_id = _new_section_id,
         room_id = _new_room_id,
         updated_at = now()
   WHERE id = _item_id;

  INSERT INTO public.project_activity
    (organization_id, project_id, actor_user_id, activity_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, v_row.project_id, auth.uid(),'moved','scope_item', _item_id, left(v_row.title,160),
          jsonb_build_object('from_section', v_row.section_id, 'to_section', _new_section_id,
                             'from_room', v_row.room_id, 'to_room', _new_room_id));

  PERFORM set_config('scope.suppress_activity','off',true);
END $$;

-- Bulk include/exclude
CREATE OR REPLACE FUNCTION public.bulk_update_scope_inclusion(
  _project_id uuid, _item_ids uuid[], _is_included boolean
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_count integer;
BEGIN
  v_org := public.assert_project_in_active_org(_project_id);

  PERFORM set_config('scope.suppress_activity','on',true);

  UPDATE public.scope_items
     SET is_included = _is_included, updated_at = now()
   WHERE id = ANY(_item_ids) AND project_id = _project_id AND organization_id = v_org;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.project_activity
    (organization_id, project_id, actor_user_id, activity_type, entity_type, summary, metadata)
  VALUES (v_org, _project_id, auth.uid(), 'bulk_updated', 'scope_item',
          CASE WHEN _is_included THEN 'Included items' ELSE 'Excluded items' END,
          jsonb_build_object('count', v_count, 'is_included', _is_included));

  PERFORM set_config('scope.suppress_activity','off',true);
  RETURN v_count;
END $$;

-- Reorder sections
CREATE OR REPLACE FUNCTION public.reorder_scope_sections(_project_id uuid, _ordered_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_id uuid; v_idx integer := 0;
BEGIN
  v_org := public.assert_project_in_active_org(_project_id);

  IF EXISTS (
    SELECT 1 FROM unnest(_ordered_ids) x(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.scope_sections
      WHERE id = x.id AND project_id = _project_id AND organization_id = v_org
    )
  ) THEN RAISE EXCEPTION 'section_not_in_project' USING ERRCODE='42501';
  END IF;

  PERFORM set_config('scope.suppress_activity','on',true);
  FOREACH v_id IN ARRAY _ordered_ids LOOP
    UPDATE public.scope_sections SET sort_order = v_idx, updated_at = now() WHERE id = v_id;
    v_idx := v_idx + 1;
  END LOOP;

  INSERT INTO public.project_activity
    (organization_id, project_id, actor_user_id, activity_type, entity_type, summary, metadata)
  VALUES (v_org, _project_id, auth.uid(),'reordered','scope_section','Sections reordered',
          jsonb_build_object('count', array_length(_ordered_ids,1)));

  PERFORM set_config('scope.suppress_activity','off',true);
END $$;

-- Reorder items within a section
CREATE OR REPLACE FUNCTION public.reorder_scope_items(_section_id uuid, _ordered_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_section public.scope_sections; v_org uuid; v_id uuid; v_idx integer := 0;
BEGIN
  SELECT * INTO v_section FROM public.scope_sections WHERE id = _section_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  v_org := public.assert_project_in_active_org(v_section.project_id);

  IF EXISTS (
    SELECT 1 FROM unnest(_ordered_ids) x(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.scope_items
      WHERE id = x.id AND section_id = _section_id AND organization_id = v_org
    )
  ) THEN RAISE EXCEPTION 'item_not_in_section' USING ERRCODE='42501'; END IF;

  PERFORM set_config('scope.suppress_activity','on',true);
  FOREACH v_id IN ARRAY _ordered_ids LOOP
    UPDATE public.scope_items SET sort_order = v_idx, updated_at = now() WHERE id = v_id;
    v_idx := v_idx + 1;
  END LOOP;

  INSERT INTO public.project_activity
    (organization_id, project_id, actor_user_id, activity_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, v_section.project_id, auth.uid(),'reordered','scope_item', _section_id,
          'Scope items reordered', jsonb_build_object('count', array_length(_ordered_ids,1)));

  PERFORM set_config('scope.suppress_activity','off',true);
END $$;

-- Apply template
CREATE OR REPLACE FUNCTION public.apply_scope_template(
  _project_id uuid,
  _template_id uuid,
  _room_id uuid DEFAULT NULL,
  _allow_append boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_template public.scope_templates;
  v_section jsonb;
  v_item jsonb;
  v_new_section_id uuid;
  v_sections_created integer := 0;
  v_items_created integer := 0;
  v_sort_offset integer := 0;
BEGIN
  v_org := public.assert_project_in_active_org(_project_id);

  SELECT * INTO v_template FROM public.scope_templates WHERE id = _template_id;
  IF NOT FOUND OR NOT v_template.is_active THEN
    RAISE EXCEPTION 'template_not_found' USING ERRCODE='P0002';
  END IF;
  IF NOT v_template.is_system_template
     AND (v_template.organization_id IS NULL OR NOT public.is_org_member(v_template.organization_id)) THEN
    RAISE EXCEPTION 'template_forbidden' USING ERRCODE='42501';
  END IF;

  IF _room_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.project_rooms
      WHERE id = _room_id AND project_id = _project_id AND organization_id = v_org
    ) THEN RAISE EXCEPTION 'room_not_in_project' USING ERRCODE='42501'; END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.scope_sections
    WHERE project_id = _project_id AND organization_id = v_org AND archived_at IS NULL
  ) THEN
    IF NOT _allow_append THEN
      RAISE EXCEPTION 'scope_exists_append_required' USING ERRCODE='23505';
    END IF;
    SELECT COALESCE(MAX(sort_order),-1)+1 INTO v_sort_offset
      FROM public.scope_sections
     WHERE project_id = _project_id AND organization_id = v_org AND archived_at IS NULL;
  END IF;

  PERFORM set_config('scope.suppress_activity','on',true);

  FOR v_section IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.template_data->'sections','[]'::jsonb)) LOOP
    INSERT INTO public.scope_sections
      (organization_id, project_id, room_id, name, section_key, trade_key, description, sort_order, created_by)
    VALUES
      (v_org, _project_id, _room_id, v_section->>'name', v_section->>'section_key',
       v_section->>'trade_key', v_section->>'description',
       v_sort_offset + COALESCE((v_section->>'sort_order')::int, v_sections_created), auth.uid())
    RETURNING id INTO v_new_section_id;
    v_sections_created := v_sections_created + 1;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_section->'items','[]'::jsonb)) LOOP
      INSERT INTO public.scope_items
        (organization_id, project_id, room_id, section_id, title, scope_item_key, trade_key,
         action_key, description, sort_order, completion_status, created_by)
      VALUES
        (v_org, _project_id, _room_id, v_new_section_id, v_item->>'title',
         v_item->>'scope_item_key', v_item->>'trade_key',
         NULLIF(v_item->>'action_key','')::public.scope_action, v_item->>'description',
         COALESCE((v_item->>'sort_order')::int, v_items_created),'draft'::public.scope_completion, auth.uid());
      v_items_created := v_items_created + 1;
    END LOOP;
  END LOOP;

  INSERT INTO public.project_activity
    (organization_id, project_id, actor_user_id, activity_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, _project_id, auth.uid(),'applied','scope_template', v_template.id, v_template.name,
          jsonb_build_object('sections_created', v_sections_created,
                             'items_created', v_items_created,
                             'appended', _allow_append,
                             'room_id', _room_id));

  PERFORM set_config('scope.suppress_activity','off',true);
  RETURN jsonb_build_object('sections_created', v_sections_created, 'items_created', v_items_created);
END $$;

-- ============================================================
-- SEED SYSTEM TEMPLATES (idempotent via ON CONFLICT on template_key)
-- ============================================================
INSERT INTO public.scope_templates
  (template_key, project_category_key, project_type_key, name, description, is_system_template, is_active, template_data)
VALUES
  ('sys.kitchen_remodel','INTERIOR','kitchen_remodel','Kitchen Remodel',
   'Starter kitchen remodel scope', true, true,
   '{"sections":[
      {"section_key":"demolition","name":"Demolition","trade_key":"general","sort_order":0,
        "items":[{"scope_item_key":"demo_cabinets","title":"Remove existing cabinets"},
                 {"scope_item_key":"demo_countertops","title":"Remove existing countertops"},
                 {"scope_item_key":"demo_flooring","title":"Remove existing flooring"}]},
      {"section_key":"plumbing","name":"Plumbing","trade_key":"plumbing","sort_order":1,
        "items":[{"scope_item_key":"plumb_rough","title":"Plumbing rough-in"},
                 {"scope_item_key":"plumb_sink","title":"Install sink and faucet"}]},
      {"section_key":"electrical","name":"Electrical","trade_key":"electrical","sort_order":2,
        "items":[{"scope_item_key":"elec_rough","title":"Electrical rough-in"},
                 {"scope_item_key":"elec_lighting","title":"Install lighting"}]},
      {"section_key":"cabinets","name":"Cabinets / Millwork","trade_key":"carpentry","sort_order":3,
        "items":[{"scope_item_key":"install_cabinets","title":"Install cabinets"}]},
      {"section_key":"countertops","name":"Countertops","trade_key":"countertops","sort_order":4,
        "items":[{"scope_item_key":"install_counters","title":"Install countertops"}]},
      {"section_key":"flooring","name":"Flooring","trade_key":"flooring","sort_order":5,
        "items":[{"scope_item_key":"install_floor","title":"Install flooring"}]},
      {"section_key":"painting","name":"Painting","trade_key":"painting","sort_order":6,
        "items":[{"scope_item_key":"paint_walls","title":"Paint walls and ceiling"}]},
      {"section_key":"cleanup","name":"Cleanup","trade_key":"general","sort_order":7,
        "items":[{"scope_item_key":"final_cleanup","title":"Final cleanup"}]}
    ]}'::jsonb),

  ('sys.bathroom_remodel','INTERIOR','bathroom_remodel','Bathroom Remodel',
   'Starter bathroom remodel scope', true, true,
   '{"sections":[
      {"section_key":"demolition","name":"Demolition","trade_key":"general","sort_order":0,
        "items":[{"scope_item_key":"demo_existing","title":"Remove existing fixtures and finishes"}]},
      {"section_key":"plumbing","name":"Plumbing","trade_key":"plumbing","sort_order":1,
        "items":[{"scope_item_key":"plumb_rough","title":"Plumbing rough-in"}]},
      {"section_key":"electrical","name":"Electrical","trade_key":"electrical","sort_order":2,
        "items":[{"scope_item_key":"elec_rough","title":"Electrical rough-in"}]},
      {"section_key":"framing","name":"Framing","trade_key":"carpentry","sort_order":3,
        "items":[{"scope_item_key":"framing","title":"Framing modifications"}]},
      {"section_key":"insulation","name":"Insulation","trade_key":"insulation","sort_order":4,
        "items":[{"scope_item_key":"insulation","title":"Install insulation"}]},
      {"section_key":"drywall","name":"Drywall","trade_key":"drywall","sort_order":5,
        "items":[{"scope_item_key":"drywall","title":"Install and finish drywall"}]},
      {"section_key":"waterproofing","name":"Waterproofing","trade_key":"tile","sort_order":6,
        "items":[{"scope_item_key":"waterproofing","title":"Waterproof wet areas"}]},
      {"section_key":"tile","name":"Tile","trade_key":"tile","sort_order":7,
        "items":[{"scope_item_key":"tile_floor","title":"Install floor tile"},
                 {"scope_item_key":"tile_shower","title":"Install shower tile"}]},
      {"section_key":"vanity","name":"Vanity / Cabinets","trade_key":"carpentry","sort_order":8,
        "items":[{"scope_item_key":"install_vanity","title":"Install vanity"}]},
      {"section_key":"countertops","name":"Countertops","trade_key":"countertops","sort_order":9,
        "items":[{"scope_item_key":"install_counters","title":"Install countertop"}]},
      {"section_key":"fixtures","name":"Fixtures","trade_key":"plumbing","sort_order":10,
        "items":[{"scope_item_key":"install_fixtures","title":"Install bathroom fixtures"}]},
      {"section_key":"painting","name":"Painting","trade_key":"painting","sort_order":11,
        "items":[{"scope_item_key":"paint_walls","title":"Paint walls and ceiling"}]},
      {"section_key":"trim","name":"Trim / Finish Carpentry","trade_key":"carpentry","sort_order":12,
        "items":[{"scope_item_key":"trim","title":"Install trim"}]},
      {"section_key":"cleanup","name":"Cleanup","trade_key":"general","sort_order":13,
        "items":[{"scope_item_key":"final_cleanup","title":"Final cleanup"}]}
    ]}'::jsonb),

  ('sys.garage_conversion','ADDITIONS','garage_conversion','Garage Conversion',
   'Starter garage conversion scope', true, true,
   '{"sections":[
      {"section_key":"demolition","name":"Demolition","trade_key":"general","sort_order":0,
        "items":[{"scope_item_key":"demo_prep","title":"Site protection and demolition"}]},
      {"section_key":"foundation","name":"Foundation / Slab","trade_key":"concrete","sort_order":1,
        "items":[{"scope_item_key":"slab_prep","title":"Prep slab / infill"}]},
      {"section_key":"framing","name":"Framing","trade_key":"carpentry","sort_order":2,
        "items":[{"scope_item_key":"framing","title":"Frame new walls"}]},
      {"section_key":"insulation","name":"Insulation","trade_key":"insulation","sort_order":3,
        "items":[{"scope_item_key":"insulation","title":"Install insulation"}]},
      {"section_key":"windows_doors","name":"Windows / Doors","trade_key":"carpentry","sort_order":4,
        "items":[{"scope_item_key":"windows","title":"Install windows and doors"}]},
      {"section_key":"electrical","name":"Electrical","trade_key":"electrical","sort_order":5,
        "items":[{"scope_item_key":"electrical","title":"Electrical rough-in and finish"}]},
      {"section_key":"plumbing","name":"Plumbing","trade_key":"plumbing","sort_order":6,
        "items":[{"scope_item_key":"plumbing","title":"Plumbing rough-in"}]},
      {"section_key":"hvac","name":"HVAC","trade_key":"hvac","sort_order":7,
        "items":[{"scope_item_key":"hvac","title":"HVAC install"}]},
      {"section_key":"drywall","name":"Drywall","trade_key":"drywall","sort_order":8,
        "items":[{"scope_item_key":"drywall","title":"Install and finish drywall"}]},
      {"section_key":"flooring","name":"Flooring","trade_key":"flooring","sort_order":9,
        "items":[{"scope_item_key":"flooring","title":"Install flooring"}]},
      {"section_key":"painting","name":"Painting","trade_key":"painting","sort_order":10,
        "items":[{"scope_item_key":"paint","title":"Paint walls and ceiling"}]},
      {"section_key":"trim","name":"Trim","trade_key":"carpentry","sort_order":11,
        "items":[{"scope_item_key":"trim","title":"Install trim"}]},
      {"section_key":"permits","name":"Permits / Inspections","trade_key":"general","sort_order":12,
        "items":[{"scope_item_key":"permits","title":"Permits and inspections"}]},
      {"section_key":"cleanup","name":"Cleanup","trade_key":"general","sort_order":13,
        "items":[{"scope_item_key":"cleanup","title":"Final cleanup"}]}
    ]}'::jsonb),

  ('sys.interior_painting','INTERIOR','interior_painting','Interior Painting',
   'Starter interior painting scope', true, true,
   '{"sections":[
      {"section_key":"prep","name":"Preparation","trade_key":"painting","sort_order":0,
        "items":[{"scope_item_key":"prep","title":"Surface prep and masking"}]},
      {"section_key":"primer","name":"Primer","trade_key":"painting","sort_order":1,
        "items":[{"scope_item_key":"primer","title":"Apply primer where needed"}]},
      {"section_key":"paint","name":"Paint","trade_key":"painting","sort_order":2,
        "items":[{"scope_item_key":"walls","title":"Paint walls"},
                 {"scope_item_key":"ceilings","title":"Paint ceilings"},
                 {"scope_item_key":"trim","title":"Paint trim"}]},
      {"section_key":"cleanup","name":"Cleanup","trade_key":"general","sort_order":3,
        "items":[{"scope_item_key":"cleanup","title":"Cleanup"}]}
    ]}'::jsonb),

  ('sys.exterior_painting','EXTERIOR','exterior_painting','Exterior Painting',
   'Starter exterior painting scope', true, true,
   '{"sections":[
      {"section_key":"prep","name":"Preparation","trade_key":"painting","sort_order":0,
        "items":[{"scope_item_key":"pressure_wash","title":"Pressure wash"},
                 {"scope_item_key":"scrape","title":"Scrape and sand"}]},
      {"section_key":"repairs","name":"Repairs","trade_key":"carpentry","sort_order":1,
        "items":[{"scope_item_key":"caulk","title":"Caulk gaps and cracks"}]},
      {"section_key":"primer","name":"Primer","trade_key":"painting","sort_order":2,
        "items":[{"scope_item_key":"primer","title":"Apply primer"}]},
      {"section_key":"paint","name":"Paint","trade_key":"painting","sort_order":3,
        "items":[{"scope_item_key":"body","title":"Paint body"},
                 {"scope_item_key":"trim","title":"Paint trim"}]},
      {"section_key":"cleanup","name":"Cleanup","trade_key":"general","sort_order":4,
        "items":[{"scope_item_key":"cleanup","title":"Cleanup"}]}
    ]}'::jsonb),

  ('sys.roof_replacement','EXTERIOR','roof_replacement','Roof Replacement',
   'Starter roof replacement scope', true, true,
   '{"sections":[
      {"section_key":"tear_off","name":"Tear-off","trade_key":"roofing","sort_order":0,
        "items":[{"scope_item_key":"tearoff","title":"Tear off existing roofing"}]},
      {"section_key":"deck_repair","name":"Deck Repair","trade_key":"carpentry","sort_order":1,
        "items":[{"scope_item_key":"deck","title":"Repair roof deck as needed"}]},
      {"section_key":"underlayment","name":"Underlayment","trade_key":"roofing","sort_order":2,
        "items":[{"scope_item_key":"underlayment","title":"Install underlayment"}]},
      {"section_key":"flashing","name":"Flashing","trade_key":"roofing","sort_order":3,
        "items":[{"scope_item_key":"flashing","title":"Install flashing"}]},
      {"section_key":"shingles","name":"Shingles","trade_key":"roofing","sort_order":4,
        "items":[{"scope_item_key":"shingles","title":"Install shingles"}]},
      {"section_key":"cleanup","name":"Cleanup","trade_key":"general","sort_order":5,
        "items":[{"scope_item_key":"cleanup","title":"Site cleanup and haul-away"}]}
    ]}'::jsonb),

  ('sys.deck','OUTDOOR_LIVING','deck','Deck',
   'Starter deck build scope', true, true,
   '{"sections":[
      {"section_key":"site","name":"Site Prep","trade_key":"general","sort_order":0,
        "items":[{"scope_item_key":"layout","title":"Layout and site prep"}]},
      {"section_key":"footings","name":"Footings","trade_key":"concrete","sort_order":1,
        "items":[{"scope_item_key":"footings","title":"Install footings"}]},
      {"section_key":"framing","name":"Framing","trade_key":"carpentry","sort_order":2,
        "items":[{"scope_item_key":"framing","title":"Frame deck"}]},
      {"section_key":"decking","name":"Decking","trade_key":"carpentry","sort_order":3,
        "items":[{"scope_item_key":"decking","title":"Install decking boards"}]},
      {"section_key":"railing","name":"Railing","trade_key":"carpentry","sort_order":4,
        "items":[{"scope_item_key":"railing","title":"Install railing"}]},
      {"section_key":"stairs","name":"Stairs","trade_key":"carpentry","sort_order":5,
        "items":[{"scope_item_key":"stairs","title":"Build stairs"}]},
      {"section_key":"finish","name":"Finish","trade_key":"painting","sort_order":6,
        "items":[{"scope_item_key":"finish","title":"Stain or seal"}]}
    ]}'::jsonb),

  ('sys.handyman_repair','HANDYMAN','handyman_small_repair','Handyman Small Repair',
   'Starter small repair scope', true, true,
   '{"sections":[
      {"section_key":"assessment","name":"Assessment","trade_key":"general","sort_order":0,
        "items":[{"scope_item_key":"assess","title":"Assess area and materials needed"}]},
      {"section_key":"repair","name":"Repair","trade_key":"general","sort_order":1,
        "items":[{"scope_item_key":"repair","title":"Perform repair"}]},
      {"section_key":"cleanup","name":"Cleanup","trade_key":"general","sort_order":2,
        "items":[{"scope_item_key":"cleanup","title":"Cleanup"}]}
    ]}'::jsonb)
ON CONFLICT (template_key) WHERE is_system_template DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      template_data = EXCLUDED.template_data,
      is_active = EXCLUDED.is_active,
      updated_at = now();
