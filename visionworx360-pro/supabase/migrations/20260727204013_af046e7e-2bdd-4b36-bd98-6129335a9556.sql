CREATE OR REPLACE FUNCTION public.log_project_workspace_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity public.activity_entity_type;
  v_activity public.activity_type;
  v_summary text;
  v_entity_id uuid;
  v_org uuid;
  v_project uuid;
BEGIN
  IF TG_TABLE_NAME = 'project_rooms' THEN v_entity := 'room';
  ELSIF TG_TABLE_NAME = 'project_notes' THEN v_entity := 'note';
  ELSIF TG_TABLE_NAME = 'project_photos' THEN v_entity := 'photo';
  ELSIF TG_TABLE_NAME = 'project_documents' THEN v_entity := 'document';
  ELSE RETURN NEW;
  END IF;

  v_org := NEW.organization_id;
  v_project := NEW.project_id;
  v_entity_id := NEW.id;

  IF TG_OP = 'INSERT' THEN
    v_activity := CASE WHEN v_entity IN ('photo','document') THEN 'uploaded'::public.activity_type
                       ELSE 'created'::public.activity_type END;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      v_activity := CASE WHEN NEW.archived_at IS NOT NULL
                         THEN 'archived'::public.activity_type
                         ELSE 'restored'::public.activity_type END;
    ELSE
      v_activity := 'updated'::public.activity_type;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_entity = 'room' THEN
    EXECUTE 'SELECT $1.name' INTO v_summary USING NEW;
  ELSIF v_entity = 'note' THEN
    EXECUTE 'SELECT left($1.body, 120)' INTO v_summary USING NEW;
  ELSIF v_entity = 'photo' THEN
    EXECUTE 'SELECT COALESCE($1.caption, $1.file_name)' INTO v_summary USING NEW;
  ELSIF v_entity = 'document' THEN
    EXECUTE 'SELECT COALESCE($1.description, $1.file_name)' INTO v_summary USING NEW;
  END IF;

  INSERT INTO public.project_activity
    (organization_id, project_id, actor_user_id, activity_type, entity_type, entity_id, summary)
  VALUES
    (v_org, v_project, COALESCE(auth.uid(), NEW.created_by), v_activity, v_entity, v_entity_id, v_summary);

  RETURN NEW;
END;
$function$;
