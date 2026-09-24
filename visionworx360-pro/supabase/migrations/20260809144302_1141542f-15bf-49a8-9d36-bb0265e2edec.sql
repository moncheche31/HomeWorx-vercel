CREATE TABLE public.project_narrative_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  edited_text text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_text text,
  approved_at timestamptz,
  approved_scope_fingerprint text,
  approval_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_narrative_scopes_project_unique UNIQUE (project_id)
);

GRANT SELECT, INSERT, UPDATE ON public.project_narrative_scopes TO authenticated;
GRANT ALL ON public.project_narrative_scopes TO service_role;

ALTER TABLE public.project_narrative_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pns_select" ON public.project_narrative_scopes
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "pns_insert" ON public.project_narrative_scopes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_narrative_scopes.project_id
        AND p.organization_id = project_narrative_scopes.organization_id
    )
  );

CREATE POLICY "pns_update" ON public.project_narrative_scopes
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (
    public.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_narrative_scopes.project_id
        AND p.organization_id = project_narrative_scopes.organization_id
    )
  );

CREATE TRIGGER project_narrative_scopes_set_updated_at
  BEFORE UPDATE ON public.project_narrative_scopes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX project_narrative_scopes_org_idx
  ON public.project_narrative_scopes (organization_id);
