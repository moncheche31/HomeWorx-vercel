
-- =========================================================================
-- Module 004 — Project Workspace
-- =========================================================================

-- ----- Enums --------------------------------------------------------------
CREATE TYPE public.room_type AS ENUM (
  'kitchen','bathroom','bedroom','living_room','dining_room','basement',
  'garage','exterior','roof','addition','whole_house','other'
);

CREATE TYPE public.room_status AS ENUM ('active','archived');

CREATE TYPE public.note_type AS ENUM ('general','field','followup','decision','issue');

CREATE TYPE public.photo_type AS ENUM (
  'existing','design','rendering','progress','completed','damage','inspiration','other'
);

CREATE TYPE public.document_type AS ENUM (
  'pdf','plan','contract','permit','inspection','survey','specification','image','other'
);

CREATE TYPE public.activity_type AS ENUM (
  'created','updated','status_changed','archived','restored','uploaded','reordered'
);

CREATE TYPE public.activity_entity_type AS ENUM (
  'project','room','note','photo','document'
);

-- ----- Helper: verified active organization for the current user ----------
-- Reads the caller's profile.organization_id and verifies the caller has a
-- user_roles row for that org. Never trusts client-supplied org ids.
CREATE OR REPLACE FUNCTION public.current_active_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  org uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO org FROM public.profiles WHERE id = uid;
  IF org IS NULL THEN
    RAISE EXCEPTION 'No active organization' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid AND organization_id = org
  ) THEN
    RAISE EXCEPTION 'Not a member of active organization' USING ERRCODE = '42501';
  END IF;

  RETURN org;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_active_organization_id() TO authenticated;

-- ----- Helper: assert a project belongs to the caller's active org --------
CREATE OR REPLACE FUNCTION public.assert_project_in_active_org(_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org uuid := public.current_active_organization_id();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = _project_id AND organization_id = org
  ) THEN
    RAISE EXCEPTION 'Project not in active organization' USING ERRCODE = '42501';
  END IF;
  RETURN org;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_project_in_active_org(uuid) TO authenticated;

-- ==========================================================================
-- project_rooms
-- ==========================================================================
CREATE TABLE public.project_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  room_type public.room_type NOT NULL DEFAULT 'other',
  floor_level text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status public.room_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.project_rooms TO authenticated;

ALTER TABLE public.project_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_rooms_select ON public.project_rooms
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY project_rooms_insert ON public.project_rooms
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = public.current_active_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.organization_id = organization_id
    )
    AND created_by = auth.uid()
  );

CREATE POLICY project_rooms_update ON public.project_rooms
  FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = public.current_active_organization_id()
  );

CREATE TRIGGER trg_project_rooms_updated_at
  BEFORE UPDATE ON public.project_rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_project_rooms_project ON public.project_rooms(project_id, sort_order);
CREATE INDEX idx_project_rooms_org ON public.project_rooms(organization_id);

-- ==========================================================================
-- project_notes
-- ==========================================================================
CREATE TABLE public.project_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  body text NOT NULL,
  note_type public.note_type NOT NULL DEFAULT 'general',
  is_internal boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.project_notes TO authenticated;

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_notes_select ON public.project_notes
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY project_notes_insert ON public.project_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = public.current_active_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.organization_id = organization_id
    )
    AND (
      room_id IS NULL OR EXISTS (
        SELECT 1 FROM public.project_rooms r
        WHERE r.id = room_id
          AND r.project_id = project_id
          AND r.organization_id = organization_id
      )
    )
    AND created_by = auth.uid()
  );

CREATE POLICY project_notes_update ON public.project_notes
  FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = public.current_active_organization_id()
    AND (
      room_id IS NULL OR EXISTS (
        SELECT 1 FROM public.project_rooms r
        WHERE r.id = room_id
          AND r.project_id = project_notes.project_id
          AND r.organization_id = organization_id
      )
    )
  );

CREATE TRIGGER trg_project_notes_updated_at
  BEFORE UPDATE ON public.project_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_project_notes_project ON public.project_notes(project_id, created_at DESC);
CREATE INDEX idx_project_notes_room ON public.project_notes(room_id);

-- ==========================================================================
-- project_photos
-- ==========================================================================
CREATE TABLE public.project_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  caption text,
  alt_text text,
  photo_type public.photo_type NOT NULL DEFAULT 'existing',
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.project_photos TO authenticated;

ALTER TABLE public.project_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_photos_select ON public.project_photos
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY project_photos_insert ON public.project_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = public.current_active_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.organization_id = organization_id
    )
    AND (
      room_id IS NULL OR EXISTS (
        SELECT 1 FROM public.project_rooms r
        WHERE r.id = room_id
          AND r.project_id = project_id
          AND r.organization_id = organization_id
      )
    )
    AND created_by = auth.uid()
    AND storage_path LIKE (organization_id::text || '/' || project_id::text || '/photos/%')
  );

CREATE POLICY project_photos_update ON public.project_photos
  FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = public.current_active_organization_id()
  );

CREATE TRIGGER trg_project_photos_updated_at
  BEFORE UPDATE ON public.project_photos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_project_photos_project ON public.project_photos(project_id, created_at DESC);
CREATE INDEX idx_project_photos_room ON public.project_photos(room_id);

-- ==========================================================================
-- project_documents
-- ==========================================================================
CREATE TABLE public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  document_type public.document_type NOT NULL DEFAULT 'other',
  description text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.project_documents TO authenticated;

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_documents_select ON public.project_documents
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY project_documents_insert ON public.project_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = public.current_active_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.organization_id = organization_id
    )
    AND (
      room_id IS NULL OR EXISTS (
        SELECT 1 FROM public.project_rooms r
        WHERE r.id = room_id
          AND r.project_id = project_id
          AND r.organization_id = organization_id
      )
    )
    AND created_by = auth.uid()
    AND storage_path LIKE (organization_id::text || '/' || project_id::text || '/documents/%')
  );

CREATE POLICY project_documents_update ON public.project_documents
  FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = public.current_active_organization_id()
  );

CREATE TRIGGER trg_project_documents_updated_at
  BEFORE UPDATE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_project_documents_project ON public.project_documents(project_id, created_at DESC);
CREATE INDEX idx_project_documents_room ON public.project_documents(room_id);

-- ==========================================================================
-- project_activity  (immutable audit log)
-- ==========================================================================
CREATE TABLE public.project_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL DEFAULT auth.uid(),
  activity_type public.activity_type NOT NULL,
  entity_type public.activity_entity_type NOT NULL,
  entity_id uuid,
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- SELECT for members; INSERT allowed for authenticated (used only by triggers
-- and SECURITY DEFINER RPCs); NO UPDATE, NO DELETE policies -> immutable.
GRANT SELECT, INSERT ON public.project_activity TO authenticated;

ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_activity_select ON public.project_activity
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

-- Direct inserts by users are allowed only for their own actor_user_id within
-- their active org — but the UI never inserts here; triggers do the work.
CREATE POLICY project_activity_insert ON public.project_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(organization_id)
    AND actor_user_id = auth.uid()
  );

CREATE INDEX idx_project_activity_project ON public.project_activity(project_id, created_at DESC);

-- ==========================================================================
-- Activity triggers — automatic transactional logging
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.log_project_workspace_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity public.activity_entity_type;
  v_activity public.activity_type;
  v_summary text;
  v_entity_id uuid;
  v_org uuid;
  v_project uuid;
BEGIN
  -- Resolve which entity fired this trigger
  IF TG_TABLE_NAME = 'project_rooms' THEN v_entity := 'room';
  ELSIF TG_TABLE_NAME = 'project_notes' THEN v_entity := 'note';
  ELSIF TG_TABLE_NAME = 'project_photos' THEN v_entity := 'photo';
  ELSIF TG_TABLE_NAME = 'project_documents' THEN v_entity := 'document';
  ELSE RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_org := NEW.organization_id;
    v_project := NEW.project_id;
    v_entity_id := NEW.id;
    v_activity := CASE WHEN v_entity IN ('photo','document') THEN 'uploaded'::public.activity_type
                       ELSE 'created'::public.activity_type END;
    v_summary := CASE v_entity
      WHEN 'room' THEN NEW.name
      WHEN 'note' THEN left(NEW.body, 120)
      WHEN 'photo' THEN COALESCE(NEW.caption, NEW.file_name)
      WHEN 'document' THEN COALESCE(NEW.description, NEW.file_name)
    END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_org := NEW.organization_id;
    v_project := NEW.project_id;
    v_entity_id := NEW.id;
    IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      v_activity := CASE WHEN NEW.archived_at IS NOT NULL
                         THEN 'archived'::public.activity_type
                         ELSE 'restored'::public.activity_type END;
    ELSE
      v_activity := 'updated'::public.activity_type;
    END IF;
    v_summary := CASE v_entity
      WHEN 'room' THEN NEW.name
      WHEN 'note' THEN left(NEW.body, 120)
      WHEN 'photo' THEN COALESCE(NEW.caption, NEW.file_name)
      WHEN 'document' THEN COALESCE(NEW.description, NEW.file_name)
    END;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.project_activity
    (organization_id, project_id, actor_user_id, activity_type, entity_type, entity_id, summary)
  VALUES
    (v_org, v_project, COALESCE(auth.uid(), NEW.created_by), v_activity, v_entity, v_entity_id, v_summary);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rooms_activity
  AFTER INSERT OR UPDATE ON public.project_rooms
  FOR EACH ROW EXECUTE FUNCTION public.log_project_workspace_activity();

CREATE TRIGGER trg_notes_activity
  AFTER INSERT OR UPDATE ON public.project_notes
  FOR EACH ROW EXECUTE FUNCTION public.log_project_workspace_activity();

CREATE TRIGGER trg_photos_activity
  AFTER INSERT OR UPDATE ON public.project_photos
  FOR EACH ROW EXECUTE FUNCTION public.log_project_workspace_activity();

CREATE TRIGGER trg_documents_activity
  AFTER INSERT OR UPDATE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.log_project_workspace_activity();

-- Also log project status changes on public.projects (already existing table)
CREATE OR REPLACE FUNCTION public.log_project_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.project_activity
      (organization_id, project_id, actor_user_id, activity_type, entity_type, entity_id, summary)
    VALUES
      (NEW.organization_id, NEW.id, COALESCE(auth.uid(), NEW.created_by),
       'created', 'project', NEW.id, NEW.name);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.project_activity
        (organization_id, project_id, actor_user_id, activity_type, entity_type, entity_id, summary,
         metadata)
      VALUES
        (NEW.organization_id, NEW.id, COALESCE(auth.uid(), NEW.created_by),
         'status_changed', 'project', NEW.id, NEW.name,
         jsonb_build_object('from', OLD.status, 'to', NEW.status));
    ELSE
      INSERT INTO public.project_activity
        (organization_id, project_id, actor_user_id, activity_type, entity_type, entity_id, summary)
      VALUES
        (NEW.organization_id, NEW.id, COALESCE(auth.uid(), NEW.created_by),
         'updated', 'project', NEW.id, NEW.name);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_projects_activity
  AFTER INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_project_status_change();

-- ==========================================================================
-- Reorder RPC  (atomic reorder + single activity row)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.reorder_project_rooms(_project_id uuid, _ordered_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_id uuid;
  v_idx integer := 0;
BEGIN
  -- Verify every id belongs to this project + org
  IF EXISTS (
    SELECT 1 FROM unnest(_ordered_ids) AS x(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.project_rooms r
      WHERE r.id = x.id AND r.project_id = _project_id AND r.organization_id = v_org
    )
  ) THEN
    RAISE EXCEPTION 'Room not in project' USING ERRCODE = '42501';
  END IF;

  FOREACH v_id IN ARRAY _ordered_ids LOOP
    UPDATE public.project_rooms
       SET sort_order = v_idx, updated_at = now()
     WHERE id = v_id AND project_id = _project_id AND organization_id = v_org;
    v_idx := v_idx + 1;
  END LOOP;

  INSERT INTO public.project_activity
    (organization_id, project_id, actor_user_id, activity_type, entity_type, summary, metadata)
  VALUES
    (v_org, _project_id, auth.uid(), 'reordered', 'room', 'Rooms reordered',
     jsonb_build_object('count', array_length(_ordered_ids, 1)));
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_project_rooms(uuid, uuid[]) TO authenticated;
