CREATE TABLE public.estimate_ballpark_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  schema_key text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  intake_source text NOT NULL CHECK (intake_source IN ('onsite', 'photos', 'description')),
  current_stage text NOT NULL CHECK (current_stage IN ('intake', 'review', 'questions', 'results')),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  transcripts jsonb NOT NULL DEFAULT '{}'::jsonb,
  photo_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  photo_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  inferred_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  assumed_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  contractor_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  derived_geometry jsonb NOT NULL DEFAULT '{}'::jsonb,
  derived_quantities jsonb NOT NULL DEFAULT '[]'::jsonb,
  unknowns jsonb NOT NULL DEFAULT '[]'::jsonb,
  range_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  range_snapshot jsonb,
  confidence text CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimate_ballpark_sessions_one_per_estimate UNIQUE (estimate_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_ballpark_sessions TO authenticated;
GRANT ALL ON public.estimate_ballpark_sessions TO service_role;
ALTER TABLE public.estimate_ballpark_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view ballpark sessions"
ON public.estimate_ballpark_sessions FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));
CREATE POLICY "Org members can create ballpark sessions"
ON public.estimate_ballpark_sessions FOR INSERT TO authenticated
WITH CHECK (
  public.is_org_member(organization_id)
  AND organization_id = public.current_active_organization_id()
  AND created_by = auth.uid()
);
CREATE POLICY "Org members can update ballpark sessions"
ON public.estimate_ballpark_sessions FOR UPDATE TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (
  public.is_org_member(organization_id)
  AND organization_id = public.current_active_organization_id()
);
CREATE POLICY "Org members can delete ballpark sessions"
ON public.estimate_ballpark_sessions FOR DELETE TO authenticated
USING (public.is_org_member(organization_id));
CREATE INDEX estimate_ballpark_sessions_project_idx
ON public.estimate_ballpark_sessions (organization_id, project_id, updated_at DESC);
CREATE TRIGGER set_estimate_ballpark_sessions_updated_at
BEFORE UPDATE ON public.estimate_ballpark_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
BEGIN
  SELECT * INTO v_est
  FROM public.estimates
  WHERE id = _estimate_id
    AND organization_id = public.current_active_organization_id()
    AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;

  v_source := COALESCE(_session->>'intakeSource', 'onsite');
  v_stage := COALESCE(_session->>'currentStage', 'questions');
  IF v_source NOT IN ('onsite', 'photos', 'description') THEN RAISE EXCEPTION 'invalid_intake_source'; END IF;
  IF v_stage NOT IN ('intake', 'review', 'questions', 'results') THEN RAISE EXCEPTION 'invalid_ballpark_stage'; END IF;

  INSERT INTO public.estimate_ballpark_sessions (
    organization_id, estimate_id, project_id, schema_key, schema_version,
    intake_source, current_stage, answers, transcripts, photo_references,
    photo_analysis, confirmed_values, inferred_values, assumed_values,
    contractor_overrides, derived_geometry, derived_quantities, unknowns,
    range_inputs, range_snapshot, confidence, payload, created_by
  ) VALUES (
    v_est.organization_id, v_est.id, v_est.project_id,
    COALESCE(NULLIF(_session->>'schemaKey', ''), 'quick-ballpark'),
    GREATEST(1, COALESCE((_session->>'schemaVersion')::integer, 1)),
    v_source, v_stage,
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
    _session->'rangeSnapshot',
    NULLIF(_session->>'confidence', ''),
    _session,
    auth.uid()
  )
  ON CONFLICT (estimate_id) DO UPDATE SET
    schema_key = EXCLUDED.schema_key,
    schema_version = EXCLUDED.schema_version,
    intake_source = EXCLUDED.intake_source,
    current_stage = EXCLUDED.current_stage,
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
    range_snapshot = COALESCE(EXCLUDED.range_snapshot, estimate_ballpark_sessions.range_snapshot),
    confidence = COALESCE(EXCLUDED.confidence, estimate_ballpark_sessions.confidence),
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
    jsonb_set(jsonb_set(_session, '{rangeSnapshot}', _range_snapshot, true), '{currentStage}', '"results"'::jsonb, true)
  ) INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.save_estimate_ballpark(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_estimate_ballpark(uuid, jsonb, jsonb) TO authenticated;

INSERT INTO public.estimate_ballpark_sessions (
  organization_id, estimate_id, project_id, schema_key, schema_version,
  intake_source, current_stage, range_snapshot, confidence, payload, created_by
)
SELECT
  e.organization_id, e.id, e.project_id, 'recovered-from-estimate-snapshot', 1,
  CASE WHEN e.range_snapshot->>'intakeMethod' IN ('onsite', 'photos', 'description')
       THEN e.range_snapshot->>'intakeMethod' ELSE 'onsite' END,
  'results', e.range_snapshot,
  CASE WHEN e.range_snapshot->>'confidence' IN ('high', 'medium', 'low')
       THEN e.range_snapshot->>'confidence' ELSE NULL END,
  jsonb_build_object(
    'schemaKey', 'recovered-from-estimate-snapshot',
    'schemaVersion', 1,
    'estimateId', e.id,
    'projectId', e.project_id,
    'intakeSource', COALESCE(e.range_snapshot->>'intakeMethod', 'onsite'),
    'currentStage', 'results',
    'answers', '{}'::jsonb,
    'rangeSnapshot', e.range_snapshot,
    'confidence', e.range_snapshot->'confidence',
    'recoveredFromEstimateSnapshot', true,
    'updatedAt', e.updated_at
  ),
  e.created_by
FROM public.estimates e
WHERE e.range_snapshot->>'kind' = 'ballpark'
ON CONFLICT (estimate_id) DO NOTHING;
