ALTER TABLE public.estimate_ballpark_sessions
  ADD COLUMN IF NOT EXISTS completed_payload jsonb;

UPDATE public.estimate_ballpark_sessions
SET completed_payload = payload
WHERE current_stage = 'results' AND completed_payload IS NULL;

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

  SELECT public.save_estimate_ballpark_session(_estimate_id, v_completed) INTO v_row;

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
GRANT EXECUTE ON FUNCTION public.save_estimate_ballpark(uuid, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.discard_estimate_ballpark_draft(
  _estimate_id uuid
) RETURNS public.estimate_ballpark_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.estimate_ballpark_sessions;
  v_completed jsonb;
BEGIN
  SELECT completed_payload INTO v_completed
  FROM public.estimate_ballpark_sessions
  WHERE estimate_id = _estimate_id
    AND organization_id = public.current_active_organization_id()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ballpark_session_not_found'; END IF;
  IF v_completed IS NULL THEN RAISE EXCEPTION 'completed_ballpark_not_found'; END IF;

  UPDATE public.estimate_ballpark_sessions
  SET schema_key = COALESCE(NULLIF(v_completed->>'schemaKey', ''), schema_key),
      schema_version = GREATEST(1, COALESCE((v_completed->>'schemaVersion')::integer, schema_version)),
      intake_source = COALESCE(NULLIF(v_completed->>'intakeSource', ''), intake_source),
      current_stage = 'results',
      interview_type = COALESCE(NULLIF(v_completed->>'interviewType', ''), interview_type),
      frozen_question_ids = COALESCE(v_completed->'frozenQuestionIds', '[]'::jsonb),
      current_question_id = NULL,
      answers = COALESCE(v_completed->'answers', '{}'::jsonb),
      transcripts = COALESCE(v_completed->'transcripts', '{}'::jsonb),
      photo_references = COALESCE(v_completed->'photoReferences', '[]'::jsonb),
      photo_analysis = COALESCE(v_completed->'photoAnalysis', '{}'::jsonb),
      confirmed_values = COALESCE(v_completed->'confirmedValues', '{}'::jsonb),
      inferred_values = COALESCE(v_completed->'inferredValues', '{}'::jsonb),
      assumed_values = COALESCE(v_completed->'assumedValues', '{}'::jsonb),
      contractor_overrides = COALESCE(v_completed->'contractorOverrides', '{}'::jsonb),
      derived_geometry = COALESCE(v_completed->'derivedGeometry', '{}'::jsonb),
      derived_quantities = COALESCE(v_completed->'derivedQuantities', '[]'::jsonb),
      unknowns = COALESCE(v_completed->'unknowns', '[]'::jsonb),
      range_inputs = COALESCE(v_completed->'rangeInputs', '{}'::jsonb),
      draft_preview = NULL,
      payload = v_completed,
      updated_at = now()
  WHERE estimate_id = _estimate_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.discard_estimate_ballpark_draft(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discard_estimate_ballpark_draft(uuid) TO authenticated;
