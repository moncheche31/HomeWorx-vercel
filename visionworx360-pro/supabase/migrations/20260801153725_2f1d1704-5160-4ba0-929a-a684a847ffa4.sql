-- Backfill missing membership rows for existing users linked to an organization.
-- Uses the profile's role if present, otherwise defaults to 'owner'.
INSERT INTO public.user_roles (user_id, organization_id, role)
SELECT p.id, p.organization_id, COALESCE(p.role, 'owner'::public.app_role)
FROM public.profiles p
WHERE p.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.organization_id = p.organization_id
  )
ON CONFLICT DO NOTHING;

-- Defensive trigger: whenever a profile is linked to an organization,
-- ensure the corresponding user_roles membership row exists.
CREATE OR REPLACE FUNCTION public.ensure_user_role_for_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL AND (
    OLD.organization_id IS DISTINCT FROM NEW.organization_id
  ) THEN
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (NEW.id, NEW.organization_id, COALESCE(NEW.role, 'owner'::public.app_role))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_organization_link ON public.profiles;
CREATE TRIGGER on_profile_organization_link
  AFTER INSERT OR UPDATE OF organization_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_user_role_for_profile();
