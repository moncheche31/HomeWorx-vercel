-- 1. Organizations: only owners/administrators may modify org-wide settings
DROP POLICY IF EXISTS organizations_update_member ON public.organizations;
CREATE POLICY organizations_update_admin ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.organization_id = organizations.id)
    AND (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'administrator'::app_role))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.organization_id = organizations.id)
    AND (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'administrator'::app_role))
  );

-- 2. Profiles: block self-service role / organization changes
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- privileged/server-side path (service role, definer RPCs)
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'administrator'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized to change profile role';
  END IF;
  IF auth.uid() = OLD.id AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Not authorized to change your own role';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     AND OLD.organization_id IS NOT NULL
     AND NOT (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'administrator'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized to change organization membership';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_profiles_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER zzz_profiles_prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 3. Scope templates: remove permissive policies that bypassed the admin role check
DROP POLICY IF EXISTS scope_templates_insert_org ON public.scope_templates;
DROP POLICY IF EXISTS scope_templates_update_org ON public.scope_templates;

-- 4. SECURITY DEFINER hardening: fail-closed org guards + no PUBLIC/anon execute
DO $do$
DECLARE r record; new_def text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND pg_get_functiondef(p.oid) ILIKE '%auth.uid() IS NOT NULL AND NOT%'
  LOOP
    new_def := regexp_replace(
      pg_get_functiondef(r.oid),
      'auth\.uid\(\)\s+IS\s+NOT\s+NULL\s+AND\s+NOT',
      'auth.uid() IS NULL OR NOT',
      'gi'
    );
    EXECUTE new_def;
  END LOOP;

  FOR r IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
  END LOOP;
END
$do$;
