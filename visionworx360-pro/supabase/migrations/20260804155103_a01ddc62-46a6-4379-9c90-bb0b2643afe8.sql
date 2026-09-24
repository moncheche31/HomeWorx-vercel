ALTER TABLE public.estimate_ballpark_sessions
  ADD COLUMN IF NOT EXISTS interview_type text NOT NULL DEFAULT 'full_refinement'
    CHECK (interview_type IN ('initial', 'full_refinement', 'photo_clarification')),
  ADD COLUMN IF NOT EXISTS frozen_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(frozen_question_ids) = 'array'),
  ADD COLUMN IF NOT EXISTS current_question_id text,
  ADD COLUMN IF NOT EXISTS draft_preview jsonb;

CREATE OR REPLACE FUNCTION public.save_estimate_ballpark_session(
  _estimate_id uuid,
  _session jsonb
) RETURNS public.estimate_ballpark_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_est public.estimates;
  v_row public.estimate_ballpark_sessions;
  v_source text;
  v_stage text;
  v_interview_type text;
  v_payload jsonb;
BEGIN
  SELECT * INTO v_est
  FROM public.estimates
  WHERE id = _estimate_id
    AND organization_id = public.current_active_organization_id()
    AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;

  v_source := COALESCE(_session->>'intakeSource', 'onsite');
  v_stage := COALESCE(_session->>'currentStage', 'questions');
  v_interview_type := COALESCE(_session->>'interviewType', 'full_refinement');
  IF v_source NOT IN ('onsite', 'photos', 'description') THEN RAISE EXCEPTION 'invalid_intake_source'; END IF;
  IF v_stage NOT IN ('intake', 'review', 'questions', 'results') THEN RAISE EXCEPTION 'invalid_ballpark_stage'; END IF;
  IF v_interview_type NOT IN ('initial', 'full_refinement', 'photo_clarification') THEN RAISE EXCEPTION 'invalid_interview_type'; END IF;
  IF jsonb_typeof(COALESCE(_session->'frozenQuestionIds', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_frozen_question_ids';
  END IF;

  -- A draft payload never carries the authoritative completed snapshot.
  v_payload := _session - 'rangeSnapshot';

  INSERT INTO public.estimate_ballpark_sessions (
    organization_id, estimate_id, project_id, schema_key, schema_version,
    intake_source, current_stage, interview_type, frozen_question_ids,
    current_question_id, answers, transcripts, photo_references,
    photo_analysis, confirmed_values, inferred_values, assumed_values,
    contractor_overrides, derived_geometry, derived_quantities, unknowns,
    range_inputs, draft_preview, confidence, payload, created_by
  ) VALUES (
    v_est.organization_id, v_est.id, v_est.project_id,
    COALESCE(NULLIF(_session->>'schemaKey', ''), 'quick-ballpark'),
    GREATEST(1, COALESCE((_session->>'schemaVersion')::integer, 1)),
    v_source, v_stage, v_interview_type,
    COALESCE(_session->'frozenQuestionIds', '[]'::jsonb),
    NULLIF(_session->>'currentQuestionId', ''),
    COALESCE(_session->'answers', '{}'::jsonb),
    COALESCE(_session->'transcripts', '{}'::jsonb),
    COALESCE(_session->'photoReferences', '[]'::jsonb),
    COALESCE(_session->'photoAnalysis', '{}'::jsonb),
    COALESCE(_session->'confirmedValues', '{}'::jsonb),
    COALESCE(_session->'inferredValues', '{}'::jsonb),
    COALESCE(_session->'assumedValues', '{}'::jsonb),
    COALESCE(_session->'contractorOverrides', '{}'::jsonb),
    COALESCE(_session->'derivedGeometry', '{}'::jsonb),
    COALESCE(_session->'derivedQuantities', '[]'::jsonb),
    COALESCE(_session->'unknowns', '[]'::jsonb),
    COALESCE(_session->'rangeInputs', '{}'::jsonb),
    _session->'draftPreview',
    NULLIF(_session->>'confidence', ''),
    v_payload,
    auth.uid()
  )
  ON CONFLICT (estimate_id) DO UPDATE SET
    schema_key = EXCLUDED.schema_key,
    schema_version = EXCLUDED.schema_version,
    intake_source = EXCLUDED.intake_source,
    current_stage = EXCLUDED.current_stage,
    interview_type = EXCLUDED.interview_type,
    frozen_question_ids = EXCLUDED.frozen_question_ids,
    current_question_id = EXCLUDED.current_question_id,
    answers = EXCLUDED.answers,
    transcripts = EXCLUDED.transcripts,
    photo_references = EXCLUDED.photo_references,
    photo_analysis = EXCLUDED.photo_analysis,
    confirmed_values = EXCLUDED.confirmed_values,
    inferred_values = EXCLUDED.inferred_values,
    assumed_values = EXCLUDED.assumed_values,
    contractor_overrides = EXCLUDED.contractor_overrides,
    derived_geometry = EXCLUDED.derived_geometry,
    derived_quantities = EXCLUDED.derived_quantities,
    unknowns = EXCLUDED.unknowns,
    range_inputs = EXCLUDED.range_inputs,
    draft_preview = EXCLUDED.draft_preview,
    confidence = EXCLUDED.confidence,
    payload = EXCLUDED.payload
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.save_estimate_ballpark_session(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_estimate_ballpark_session(uuid, jsonb) TO authenticated;

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

  SELECT public.save_estimate_ballpark_session(
    _estimate_id,
    jsonb_set(_session - 'draftPreview', '{currentStage}', '"results"'::jsonb, true)
  ) INTO v_row;

  UPDATE public.estimate_ballpark_sessions
  SET range_snapshot = _range_snapshot,
      draft_preview = NULL,
      current_stage = 'results',
      current_question_id = NULL,
      payload = jsonb_set(
        jsonb_set(payload, '{rangeSnapshot}', _range_snapshot, true),
        '{currentStage}', '"results"'::jsonb, true
      ),
      updated_at = now()
  WHERE estimate_id = _estimate_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.save_estimate_ballpark(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_estimate_ballpark(uuid, jsonb, jsonb) TO authenticated;
