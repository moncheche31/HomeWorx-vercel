CREATE TABLE public.proposal_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  estimate_id uuid,
  token_hash text NOT NULL UNIQUE,
  recipient_email text NOT NULL,
  recipient_name text,
  subject text,
  message text,
  locale text NOT NULL DEFAULT 'en-US',
  template text,
  share_version integer NOT NULL DEFAULT 1,
  document jsonb NOT NULL,
  media_paths text[] NOT NULL DEFAULT '{}',
  logo_path text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  delivery_status text NOT NULL DEFAULT 'link_ready' CHECK (delivery_status IN ('link_ready','emailed','failed')),
  delivery_detail text,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  first_viewed_at timestamp with time zone,
  last_viewed_at timestamp with time zone,
  view_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX proposal_shares_project_idx ON public.proposal_shares (project_id, share_version DESC);

GRANT SELECT, INSERT, UPDATE ON public.proposal_shares TO authenticated;
GRANT ALL ON public.proposal_shares TO service_role;
ALTER TABLE public.proposal_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read proposal shares" ON public.proposal_shares
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "org members create proposal shares" ON public.proposal_shares
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "org members update proposal shares" ON public.proposal_shares
  FOR UPDATE TO authenticated USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TRIGGER proposal_shares_set_updated_at
  BEFORE UPDATE ON public.proposal_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.proposal_change_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  share_id uuid NOT NULL REFERENCES public.proposal_shares(id) ON DELETE CASCADE,
  share_version integer NOT NULL DEFAULT 1,
  kind text NOT NULL DEFAULT 'change_request' CHECK (kind IN ('change_request','question')),
  message text NOT NULL,
  selections jsonb NOT NULL DEFAULT '[]'::jsonb,
  requester_name text,
  requester_email text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','reviewing','applied','declined')),
  contractor_note text,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX proposal_change_requests_project_idx ON public.proposal_change_requests (project_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.proposal_change_requests TO authenticated;
GRANT ALL ON public.proposal_change_requests TO service_role;
ALTER TABLE public.proposal_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read change requests" ON public.proposal_change_requests
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "org members create change requests" ON public.proposal_change_requests
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "org members update change requests" ON public.proposal_change_requests
  FOR UPDATE TO authenticated USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TRIGGER proposal_change_requests_set_updated_at
  BEFORE UPDATE ON public.proposal_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
