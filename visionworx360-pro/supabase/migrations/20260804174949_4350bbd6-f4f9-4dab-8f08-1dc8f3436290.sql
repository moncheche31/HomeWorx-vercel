CREATE OR REPLACE FUNCTION public.save_estimate_ballpark(
  _estimate_id uuid,
  _range_snapshot jsonb,
  _session jsonb
) RETURNS public.estimate_ballpark_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_est public.estimates;
  v_row public.estimate_ballpark_sessions;
  v_completed jsonb;
BEGIN
  SELECT * INTO v_est
  FROM public.estimates
  WHERE id = _estimate_id
    AND organization_id = public.current_active_organization_id()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;
  IF v_est.archived_at IS NOT NULL OR v_est.locked_at IS NOT NULL OR v_est.superseded_by_id IS NOT NULL
     OR v_est.status IN ('approved', 'sent', 'accepted', 'declined', 'superseded')
  THEN RAISE EXCEPTION 'estimate_locked'; END IF;
  IF COALESCE(_range_snapshot->>'kind', '') <> 'ballpark' THEN RAISE EXCEPTION 'invalid_ballpark_snapshot'; END IF;

  UPDATE public.estimates
  SET range_snapshot = _range_snapshot, intake_mode = 'ballpark', updated_at = now()
  WHERE id = _estimate_id;

  v_completed := jsonb_set(
    jsonb_set(_session - 'draftPreview', '{rangeSnapshot}', _range_snapshot, true),
    '{currentStage}', '"results"'::jsonb,
    true
  );

  -- The upsert helper returns a composite row; PERFORM avoids assigning that
  -- composite into a record's first (uuid) field, which used to abort the save.
  PERFORM public.save_estimate_ballpark_session(_estimate_id, v_completed);

  UPDATE public.estimate_ballpark_sessions
  SET range_snapshot = _range_snapshot,
      draft_preview = NULL,
      current_stage = 'results',
      current_question_id = NULL,
      payload = v_completed,
      completed_payload = v_completed,
      updated_at = now()
  WHERE estimate_id = _estimate_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.save_estimate_ballpark(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_estimate_ballpark(uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_estimate_ballpark(uuid, jsonb, jsonb) TO authenticated;
