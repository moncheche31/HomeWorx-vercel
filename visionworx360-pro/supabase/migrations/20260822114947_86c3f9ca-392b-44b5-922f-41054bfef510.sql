CREATE TABLE public.scope_validation_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_key TEXT NOT NULL,
  subject_fingerprint TEXT NOT NULL,
  finding_kind TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('kept', 'reassigned', 'dismissed')),
  decided_trade_key TEXT,
  item_ids UUID[] NOT NULL DEFAULT '{}',
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, subject_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scope_validation_decisions TO authenticated;
GRANT ALL ON public.scope_validation_decisions TO service_role;

ALTER TABLE public.scope_validation_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read scope validation decisions"
  ON public.scope_validation_decisions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Org members record scope validation decisions"
  ON public.scope_validation_decisions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Org members update scope validation decisions"
  ON public.scope_validation_decisions FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Org members delete scope validation decisions"
  ON public.scope_validation_decisions FOR DELETE TO authenticated
  USING (public.is_org_member(organization_id));

CREATE INDEX scope_validation_decisions_project_idx
  ON public.scope_validation_decisions (project_id);

CREATE TRIGGER scope_validation_decisions_set_updated_at
  BEFORE UPDATE ON public.scope_validation_decisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
