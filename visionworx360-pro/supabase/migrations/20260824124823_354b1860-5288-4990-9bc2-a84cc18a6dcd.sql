REVOKE EXECUTE ON FUNCTION public.cost_book_entry(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.line_pricing_basis(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reprice_estimate_from_cost_book(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_org_assembly_override_change() FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.cost_book_entry(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.line_pricing_basis(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reprice_estimate_from_cost_book(uuid) TO authenticated, service_role;
