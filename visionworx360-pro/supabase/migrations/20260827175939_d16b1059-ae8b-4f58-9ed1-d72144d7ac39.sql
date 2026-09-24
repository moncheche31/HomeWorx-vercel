CREATE TYPE public.material_pricing_provider_type AS ENUM ('bigbox_home_depot');

CREATE TABLE public.material_pricing_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_type public.material_pricing_provider_type NOT NULL,
  api_key TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_verified_at TIMESTAMPTZ,
  last_verify_status TEXT,
  last_verify_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider_type)
);

-- Column-level grants: the api_key column is intentionally EXCLUDED so the
-- Data API can never return it. Server-side code reads it with the admin client.
GRANT SELECT (id, organization_id, provider_type, is_enabled, last_verified_at, last_verify_status, last_verify_error, created_at, updated_at)
  ON public.material_pricing_providers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.material_pricing_providers TO authenticated;
GRANT ALL ON public.material_pricing_providers TO service_role;

ALTER TABLE public.material_pricing_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view provider config"
  ON public.material_pricing_providers FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Admins can add providers"
  ON public.material_pricing_providers FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'administrator'))
  );

CREATE POLICY "Admins can update providers"
  ON public.material_pricing_providers FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'administrator'))
  )
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'administrator'))
  );

CREATE POLICY "Admins can remove providers"
  ON public.material_pricing_providers FOR DELETE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'administrator'))
  );

CREATE TRIGGER update_material_pricing_providers_updated_at
  BEFORE UPDATE ON public.material_pricing_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
