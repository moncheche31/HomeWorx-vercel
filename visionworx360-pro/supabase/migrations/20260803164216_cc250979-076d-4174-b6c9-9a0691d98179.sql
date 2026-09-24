REVOKE ALL ON FUNCTION public.kb_norm(text) FROM anon;
REVOKE ALL ON FUNCTION public.kb_overlap(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.kb_resolved_assemblies(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.apply_knowledge_base_pricing(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_estimate_from_scope(uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.sync_estimate_from_scope(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.flag_estimate_line_price_override() FROM anon;
