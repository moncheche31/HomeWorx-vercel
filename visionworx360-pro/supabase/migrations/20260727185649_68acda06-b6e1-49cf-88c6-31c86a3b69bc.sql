
CREATE OR REPLACE FUNCTION public.create_organization_for_current_user(payload jsonb)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN new_org;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_for_current_user(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_for_current_user(jsonb) TO authenticated;

-- Tighten organizations INSERT: only allow via the SECURITY DEFINER RPC path.
DROP POLICY IF EXISTS organizations_insert_authenticated ON public.organizations;
