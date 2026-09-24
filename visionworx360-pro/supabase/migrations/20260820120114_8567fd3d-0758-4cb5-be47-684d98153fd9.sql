REVOKE ALL ON FUNCTION public.enforce_estimate_pricing_method(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preserve_explicit_estimate_pricing() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_estimate_lines_on_scope_exclusion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_estimate_pricing_method(uuid) TO service_role;
