ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_project_last_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    _project_id := OLD.project_id;
  ELSE
    _project_id := NEW.project_id;
  END IF;
  IF _project_id IS NOT NULL THEN
    UPDATE public.projects
      SET last_activity_at = now()
      WHERE id = _project_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_own_project_last_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.last_activity_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_touch_last_activity ON public.projects;
CREATE TRIGGER trg_projects_touch_last_activity
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  WHEN (
    OLD.name IS DISTINCT FROM NEW.name
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.priority IS DISTINCT FROM NEW.priority
    OR OLD.budget IS DISTINCT FROM NEW.budget
    OR OLD.description IS DISTINCT FROM NEW.description
    OR OLD.internal_notes IS DISTINCT FROM NEW.internal_notes
    OR OLD.target_completion IS DISTINCT FROM NEW.target_completion
    OR OLD.cover_photo_id IS DISTINCT FROM NEW.cover_photo_id
    OR OLD.project_type_key IS DISTINCT FROM NEW.project_type_key
    OR OLD.project_category_key IS DISTINCT FROM NEW.project_category_key
  )
  EXECUTE FUNCTION public.touch_own_project_last_activity();

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scope_items','scope_sections','estimates','project_notes','project_photos',
    'project_documents','project_rooms','project_measurements','project_activity',
    'estimate_line_items','estimate_audit_events','estimate_ballpark_sessions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_project_activity ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_project_activity AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_project_last_activity()', t);
  END LOOP;
END $$;

WITH activity AS (
  SELECT p.id,
    GREATEST(
      p.updated_at,
      COALESCE((SELECT max(x.updated_at) FROM public.scope_items x WHERE x.project_id = p.id), p.created_at),
      COALESCE((SELECT max(x.updated_at) FROM public.scope_sections x WHERE x.project_id = p.id), p.created_at),
      COALESCE((SELECT max(x.updated_at) FROM public.estimates x WHERE x.project_id = p.id), p.created_at),
      COALESCE((SELECT max(x.updated_at) FROM public.estimate_line_items x WHERE x.project_id = p.id), p.created_at),
      COALESCE((SELECT max(x.updated_at) FROM public.project_notes x WHERE x.project_id = p.id), p.created_at),
      COALESCE((SELECT max(x.updated_at) FROM public.project_photos x WHERE x.project_id = p.id), p.created_at),
      COALESCE((SELECT max(x.updated_at) FROM public.project_documents x WHERE x.project_id = p.id), p.created_at),
      COALESCE((SELECT max(x.updated_at) FROM public.project_rooms x WHERE x.project_id = p.id), p.created_at),
      COALESCE((SELECT max(x.updated_at) FROM public.project_measurements x WHERE x.project_id = p.id), p.created_at),
      COALESCE((SELECT max(x.updated_at) FROM public.estimate_ballpark_sessions x WHERE x.project_id = p.id), p.created_at),
      COALESCE((SELECT max(x.created_at) FROM public.project_activity x WHERE x.project_id = p.id), p.created_at),
      COALESCE((SELECT max(x.created_at) FROM public.estimate_audit_events x WHERE x.project_id = p.id), p.created_at)
    ) AS ts
  FROM public.projects p
)
UPDATE public.projects p
  SET last_activity_at = a.ts
  FROM activity a
  WHERE a.id = p.id;

CREATE INDEX IF NOT EXISTS projects_org_last_activity_idx
  ON public.projects (organization_id, last_activity_at DESC);
