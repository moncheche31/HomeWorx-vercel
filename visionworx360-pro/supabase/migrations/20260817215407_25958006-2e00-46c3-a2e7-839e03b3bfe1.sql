CREATE UNIQUE INDEX IF NOT EXISTS project_photos_project_storage_path_key
  ON public.project_photos (project_id, storage_path);
