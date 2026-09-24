CREATE TABLE public.project_media_understanding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  spoken_narration text,
  visual_observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_fingerprint text,
  visual_status text NOT NULL DEFAULT 'no_media',
  analyzed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_media_understanding_project_unique UNIQUE (project_id)
);

GRANT SELECT, INSERT, UPDATE ON public.project_media_understanding TO authenticated;
GRANT ALL ON public.project_media_understanding TO service_role;

ALTER TABLE public.project_media_understanding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pmu_select" ON public.project_media_understanding
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "pmu_insert" ON public.project_media_understanding
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_media_understanding.project_id
        AND p.organization_id = project_media_understanding.organization_id
    )
  );

CREATE POLICY "pmu_update" ON public.project_media_understanding
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TRIGGER update_project_media_understanding_updated_at
  BEFORE UPDATE ON public.project_media_understanding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
