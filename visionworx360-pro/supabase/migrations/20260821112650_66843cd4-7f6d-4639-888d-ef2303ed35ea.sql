REVOKE ALL ON FUNCTION public.can_delete_org_records(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_project_deletion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_client_deletion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_project_permanently(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_client_permanently(uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_delete_org_records(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_project_deletion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_client_deletion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_project_permanently(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_client_permanently(uuid, boolean) TO authenticated;
