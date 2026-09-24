
REVOKE ALL ON FUNCTION public.estimate_is_editable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_editable_estimate_line(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_estimate_line_catalog(uuid, text, numeric, public.scope_unit, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_estimate_line_manual_pricing(uuid, numeric, public.scope_unit, text, numeric, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_estimate_line_quantity(uuid, numeric, public.scope_unit, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.flag_estimate_line_placeholder_quantity() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.estimate_is_editable(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_editable_estimate_line(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_estimate_line_catalog(uuid, text, numeric, public.scope_unit, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_estimate_line_manual_pricing(uuid, numeric, public.scope_unit, text, numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_estimate_line_quantity(uuid, numeric, public.scope_unit, text) TO authenticated, service_role;
