ALTER FUNCTION public.kb_norm(text) SET search_path = public;
ALTER FUNCTION public.kb_overlap(text, text) SET search_path = public;

REVOKE ALL ON FUNCTION public.kb_resolved_assemblies(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_knowledge_base_pricing(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_estimate_from_scope(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_estimate_from_scope(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.flag_estimate_line_price_override() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.kb_resolved_assemblies(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_knowledge_base_pricing(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_estimate_from_scope(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_estimate_from_scope(uuid, jsonb) TO authenticated, service_role;
