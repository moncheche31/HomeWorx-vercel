
-- 1. platform_products
CREATE TABLE public.platform_products (
  key text PRIMARY KEY,
  display_name_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_products_key_uppercase CHECK (key = upper(key) AND key ~ '^[A-Z][A-Z0-9_]*$')
);

GRANT SELECT ON public.platform_products TO authenticated;

ALTER TABLE public.platform_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_products_read_authenticated"
  ON public.platform_products FOR SELECT TO authenticated
  USING (true);

-- 2. organization_products
CREATE TABLE public.organization_products (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.platform_products(key),
  access_status text NOT NULL DEFAULT 'active',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, product_key),
  CONSTRAINT organization_products_access_status_check
    CHECK (access_status IN ('active', 'revoked'))
);

GRANT SELECT, INSERT, UPDATE ON public.organization_products TO authenticated;

ALTER TABLE public.organization_products ENABLE ROW LEVEL SECURITY;

-- Members read their org's product access
CREATE POLICY "organization_products_member_read"
  ON public.organization_products FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- Only owner/administrator members may insert
CREATE POLICY "organization_products_admin_insert"
  ON public.organization_products FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::public.app_role)
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  );

-- Only owner/administrator members may update
CREATE POLICY "organization_products_admin_update"
  ON public.organization_products FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::public.app_role)
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.has_role(auth.uid(), 'owner'::public.app_role)
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  );

-- updated_at trigger (reuse existing set_updated_at)
CREATE TRIGGER trg_organization_products_updated_at
  BEFORE UPDATE ON public.organization_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Seed CONTRACTOR product
INSERT INTO public.platform_products (key, display_name_key, is_active)
VALUES ('CONTRACTOR', 'products.contractor.name', true)
ON CONFLICT (key) DO NOTHING;

-- 4. has_product_access — membership-scoped
CREATE OR REPLACE FUNCTION public.has_product_access(_organization_id uuid, _product_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_products op
    JOIN public.platform_products pp ON pp.key = op.product_key
    WHERE op.organization_id = _organization_id
      AND op.product_key = _product_key
      AND op.access_status = 'active'
      AND pp.is_active = true
      AND public.is_org_member(_organization_id)
  );
$$;

REVOKE ALL ON FUNCTION public.has_product_access(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_product_access(uuid, text) TO authenticated;

-- 5. Backfill CONTRACTOR for existing organizations (idempotent)
INSERT INTO public.organization_products (organization_id, product_key, access_status)
SELECT o.id, 'CONTRACTOR', 'active'
FROM public.organizations o
ON CONFLICT (organization_id, product_key) DO NOTHING;

-- 6. Extend create_organization_for_current_user to provision CONTRACTOR access transactionally
CREATE OR REPLACE FUNCTION public.create_organization_for_current_user(payload jsonb)
 RETURNS organizations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  existing_org uuid;
  new_org public.organizations;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO existing_org FROM public.profiles WHERE id = uid;
  IF existing_org IS NOT NULL THEN
    RAISE EXCEPTION 'User already belongs to an organization' USING ERRCODE = '23505';
  END IF;

  IF COALESCE(btrim(payload->>'organization_name'), '') = '' THEN
    RAISE EXCEPTION 'organization_name is required' USING ERRCODE = '22004';
  END IF;

  INSERT INTO public.organizations (
    organization_name, business_name, license_state, license_number, primary_trade,
    phone, email, website, address_line1, address_line2, city, region, postal_code, country,
    tax_rate, timezone, language, measurement_system, currency
  ) VALUES (
    payload->>'organization_name',
    NULLIF(payload->>'business_name',''),
    NULLIF(payload->>'license_state',''),
    NULLIF(payload->>'license_number',''),
    NULLIF(payload->>'primary_trade',''),
    NULLIF(payload->>'phone',''),
    NULLIF(payload->>'email',''),
    NULLIF(payload->>'website',''),
    NULLIF(payload->>'address_line1',''),
    NULLIF(payload->>'address_line2',''),
    NULLIF(payload->>'city',''),
    NULLIF(payload->>'region',''),
    NULLIF(payload->>'postal_code',''),
    NULLIF(payload->>'country',''),
    COALESCE((payload->>'tax_rate')::numeric, 0),
    COALESCE(NULLIF(payload->>'timezone',''), 'America/New_York'),
    COALESCE(NULLIF(payload->>'language',''), 'en-US'),
    COALESCE(NULLIF(payload->>'measurement_system','')::measurement_system, 'imperial'::measurement_system),
    COALESCE(NULLIF(payload->>'currency',''), 'USD')
  )
  RETURNING * INTO new_org;

  UPDATE public.profiles
     SET organization_id = new_org.id,
         role = 'owner'::app_role,
         updated_at = now()
   WHERE id = uid;

  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (uid, new_org.id, 'owner'::app_role)
  ON CONFLICT DO NOTHING;

  -- Provision CONTRACTOR product access in the same transaction
  INSERT INTO public.organization_products (organization_id, product_key, access_status)
  VALUES (new_org.id, 'CONTRACTOR', 'active')
  ON CONFLICT (organization_id, product_key) DO NOTHING;

  RETURN new_org;
END;
$function$;
