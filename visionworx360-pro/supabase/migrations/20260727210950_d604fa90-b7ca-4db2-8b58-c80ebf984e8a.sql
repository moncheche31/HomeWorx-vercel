ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_category_key text,
  ADD COLUMN IF NOT EXISTS project_type_key text,
  ADD COLUMN IF NOT EXISTS project_type_custom text;

CREATE INDEX IF NOT EXISTS projects_category_key_idx ON public.projects (project_category_key);
CREATE INDEX IF NOT EXISTS projects_type_key_idx ON public.projects (project_type_key);

-- Backfill the known Garage Conversion project(s)
UPDATE public.projects
SET project_category_key = 'INTERIOR_REMODELING',
    project_type_key = 'GARAGE_CONVERSION'
WHERE project_type_key IS NULL
  AND (
    lower(coalesce(project_type, '')) IN ('garage_conversion','garage conversion')
    OR lower(name) LIKE '%garage conversion%'
  );
