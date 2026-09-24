
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS cover_photo_id uuid NULL
    REFERENCES public.project_photos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_cover_photo_id_idx
  ON public.projects (cover_photo_id);

CREATE OR REPLACE FUNCTION public.clear_project_cover_on_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project uuid;
  v_org uuid;
BEGIN
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    UPDATE public.projects
       SET cover_photo_id = NULL, updated_at = now()
     WHERE cover_photo_id = NEW.id
    RETURNING id, organization_id INTO v_project, v_org;

    IF v_project IS NOT NULL THEN
      INSERT INTO public.project_activity
        (organization_id, project_id, actor_user_id, activity_type,
         entity_type, entity_id, summary, metadata)
      VALUES
        (v_org, v_project, COALESCE(auth.uid(), NEW.created_by),
         'updated'::public.activity_type, 'photo'::public.activity_entity_type,
         NEW.id, 'Project cover automatically changed after archive',
         jsonb_build_object('reason', 'photo_archived', 'photo_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_photos_clear_cover_on_archive ON public.project_photos;
CREATE TRIGGER project_photos_clear_cover_on_archive
AFTER UPDATE OF archived_at ON public.project_photos
FOR EACH ROW
EXECUTE FUNCTION public.clear_project_cover_on_archive();
