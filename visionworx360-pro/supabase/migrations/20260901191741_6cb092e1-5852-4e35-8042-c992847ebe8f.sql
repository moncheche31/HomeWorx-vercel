CREATE OR REPLACE FUNCTION public.bump_terminology_correction_usage(_org_id uuid, _ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.contractor_terminology_corrections
     SET applied_count = applied_count + 1,
         last_applied_at = now()
   WHERE organization_id = _org_id
     AND id = ANY(_ids);
$$;

REVOKE ALL ON FUNCTION public.bump_terminology_correction_usage(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_terminology_correction_usage(uuid, uuid[]) TO authenticated;
