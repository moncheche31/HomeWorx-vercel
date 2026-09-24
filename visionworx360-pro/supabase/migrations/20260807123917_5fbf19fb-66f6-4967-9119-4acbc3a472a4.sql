CREATE TABLE public.organization_subscriptions (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_key text NOT NULL DEFAULT 'contractor',
  provider text NOT NULL DEFAULT 'stripe',
  provider_customer_id text,
  provider_subscription_id text,
  price_id text,
  status text NOT NULL DEFAULT 'none',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.organization_subscriptions TO authenticated;
GRANT ALL ON public.organization_subscriptions TO service_role;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their organization subscription"
ON public.organization_subscriptions FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));

CREATE TRIGGER set_organization_subscriptions_updated_at
BEFORE UPDATE ON public.organization_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_org_subscriptions_provider_sub
ON public.organization_subscriptions(provider_subscription_id);

CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  document_key text NOT NULL,
  document_version text NOT NULL,
  locale text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, document_key, document_version)
);

GRANT SELECT, INSERT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own legal acceptances"
ON public.legal_acceptances FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can record their own legal acceptances"
ON public.legal_acceptances FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE TABLE public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'problem',
  message text,
  contact_preference text NOT NULL DEFAULT 'email',
  contact_value text,
  reference_id text,
  route text,
  app_version text,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_requests TO authenticated;
GRANT ALL ON public.support_requests TO service_role;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own support requests"
ON public.support_requests FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own support requests"
ON public.support_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND (organization_id IS NULL OR public.is_org_member(organization_id)));

CREATE TRIGGER set_support_requests_updated_at
BEFORE UPDATE ON public.support_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
