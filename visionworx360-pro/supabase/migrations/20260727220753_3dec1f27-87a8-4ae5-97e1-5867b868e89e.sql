ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_subtype_key text,
  ADD COLUMN IF NOT EXISTS project_subtype_custom text;

CREATE INDEX IF NOT EXISTS projects_project_subtype_key_idx
  ON public.projects (project_subtype_key)
  WHERE project_subtype_key IS NOT NULL;
