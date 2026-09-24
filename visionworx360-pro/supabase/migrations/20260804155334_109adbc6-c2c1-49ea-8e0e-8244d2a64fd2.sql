REVOKE EXECUTE ON FUNCTION public.save_estimate_ballpark_session(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_estimate_ballpark(uuid, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.discard_estimate_ballpark_draft(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_estimate_ballpark_session(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_estimate_ballpark(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_estimate_ballpark_draft(uuid) TO authenticated;
