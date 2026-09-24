REVOKE ALL ON FUNCTION public.resync_estimate_scope_quantities(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resync_estimate_scope_quantities(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.resync_estimate_scope_quantities(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resync_estimate_scope_quantities(uuid) TO service_role;
