-- Permission helper: only owners/administrators may permanently delete CRM records.
CREATE OR REPLACE FUNCTION public.can_delete_org_records(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role IN ('owner'::app_role, 'administrator'::app_role)
  )
$$;

-- Dependency audit for a project: counts of owned records + retention blockers.
CREATE OR REPLACE FUNCTION public.audit_project_deletion(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_counts jsonb;
  v_blockers text[] := ARRAY[]::text[];
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = p_project_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND';
  END IF;
  IF NOT public.is_org_member(v_org) THEN
    RAISE EXCEPTION 'NOT_ORG_MEMBER';
  END IF;

  SELECT jsonb_build_object(
    'estimates', (SELECT count(*) FROM public.estimates WHERE project_id = p_project_id),
    'estimateLineItems', (SELECT count(*) FROM public.estimate_line_items l
                            JOIN public.estimates e ON e.id = l.estimate_id
                           WHERE e.project_id = p_project_id),
    'ballparkSessions', (SELECT count(*) FROM public.estimate_ballpark_sessions WHERE project_id = p_project_id),
    'scopeSections', (SELECT count(*) FROM public.scope_sections WHERE project_id = p_project_id),
    'scopeItems', (SELECT count(*) FROM public.scope_items WHERE project_id = p_project_id),
    'narrativeScopes', (SELECT count(*) FROM public.project_narrative_scopes WHERE project_id = p_project_id),
    'rooms', (SELECT count(*) FROM public.project_rooms WHERE project_id = p_project_id),
    'measurements', (SELECT count(*) FROM public.project_measurements WHERE project_id = p_project_id),
    'measurementCaptures', (SELECT count(*) FROM public.project_measurement_captures WHERE project_id = p_project_id),
    'measurementItems', (SELECT count(*) FROM public.project_measurement_items WHERE project_id = p_project_id),
    'photos', (SELECT count(*) FROM public.project_photos WHERE project_id = p_project_id),
    'documents', (SELECT count(*) FROM public.project_documents WHERE project_id = p_project_id),
    'notes', (SELECT count(*) FROM public.project_notes WHERE project_id = p_project_id),
    'proposalShares', (SELECT count(*) FROM public.proposal_shares WHERE project_id = p_project_id),
    'changeRequests', (SELECT count(*) FROM public.proposal_change_requests WHERE project_id = p_project_id),
    'activity', (SELECT count(*) FROM public.project_activity WHERE project_id = p_project_id)
  ) INTO v_counts;

  IF EXISTS (
    SELECT 1 FROM public.estimates
     WHERE project_id = p_project_id
       AND (accepted_at IS NOT NULL OR status IN ('approved'::estimate_status, 'accepted'::estimate_status))
  ) THEN
    v_blockers := v_blockers || 'accepted_or_approved_estimate';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.proposal_shares
     WHERE project_id = p_project_id AND status = 'accepted'
  ) THEN
    v_blockers := v_blockers || 'accepted_client_proposal';
  END IF;

  RETURN jsonb_build_object(
    'kind', 'project',
    'id', p_project_id,
    'organizationId', v_org,
    'name', (SELECT name FROM public.projects WHERE id = p_project_id),
    'counts', v_counts,
    'blockers', to_jsonb(v_blockers),
    'canDelete', (cardinality(v_blockers) = 0),
    'mayDelete', public.can_delete_org_records(auth.uid(), v_org)
  );
END;
$$;

-- Dependency audit for a client.
CREATE OR REPLACE FUNCTION public.audit_client_deletion(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_projects bigint;
  v_properties bigint;
  v_estimates bigint;
  v_shares bigint;
  v_blockers text[] := ARRAY[]::text[];
BEGIN
  SELECT organization_id INTO v_org FROM public.clients WHERE id = p_client_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'CLIENT_NOT_FOUND';
  END IF;
  IF NOT public.is_org_member(v_org) THEN
    RAISE EXCEPTION 'NOT_ORG_MEMBER';
  END IF;

  SELECT count(*) INTO v_projects FROM public.projects WHERE client_id = p_client_id;
  SELECT count(*) INTO v_properties FROM public.properties WHERE client_id = p_client_id;
  SELECT count(*) INTO v_estimates FROM public.estimates e
    JOIN public.projects p ON p.id = e.project_id WHERE p.client_id = p_client_id;
  SELECT count(*) INTO v_shares FROM public.proposal_shares s
    JOIN public.projects p ON p.id = s.project_id WHERE p.client_id = p_client_id;

  IF EXISTS (
    SELECT 1 FROM public.estimates e
     JOIN public.projects p ON p.id = e.project_id
    WHERE p.client_id = p_client_id
      AND (e.accepted_at IS NOT NULL OR e.status IN ('approved'::estimate_status, 'accepted'::estimate_status))
  ) THEN
    v_blockers := v_blockers || 'accepted_or_approved_estimate';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.proposal_shares s
     JOIN public.projects p ON p.id = s.project_id
    WHERE p.client_id = p_client_id AND s.status = 'accepted'
  ) THEN
    v_blockers := v_blockers || 'accepted_client_proposal';
  END IF;

  RETURN jsonb_build_object(
    'kind', 'client',
    'id', p_client_id,
    'organizationId', v_org,
    'counts', jsonb_build_object(
      'projects', v_projects,
      'properties', v_properties,
      'estimates', v_estimates,
      'proposalShares', v_shares
    ),
    'hasDependencies', (v_projects > 0 OR v_properties > 0),
    'blockers', to_jsonb(v_blockers),
    'canDelete', (cardinality(v_blockers) = 0),
    'mayDelete', public.can_delete_org_records(auth.uid(), v_org)
  );
END;
$$;

-- Permanently delete a single project and only its own dependent records.
CREATE OR REPLACE FUNCTION public.delete_project_permanently(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit jsonb;
  v_org uuid;
BEGIN
  v_audit := public.audit_project_deletion(p_project_id);
  v_org := (v_audit->>'organizationId')::uuid;

  IF NOT public.can_delete_org_records(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_DELETE';
  END IF;
  IF NOT (v_audit->>'canDelete')::boolean THEN
    RAISE EXCEPTION 'DELETE_BLOCKED:%', v_audit->>'blockers';
  END IF;

  UPDATE public.projects SET cover_photo_id = NULL WHERE id = p_project_id;
  DELETE FROM public.projects WHERE id = p_project_id AND organization_id = v_org;

  RETURN jsonb_build_object('ok', true, 'deleted', v_audit->'counts', 'projectId', p_project_id);
END;
$$;

-- Permanently delete a client. Dependent projects/properties require explicit opt-in.
CREATE OR REPLACE FUNCTION public.delete_client_permanently(
  p_client_id uuid,
  p_delete_dependents boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit jsonb;
  v_org uuid;
  v_project uuid;
BEGIN
  v_audit := public.audit_client_deletion(p_client_id);
  v_org := (v_audit->>'organizationId')::uuid;

  IF NOT public.can_delete_org_records(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_DELETE';
  END IF;
  IF NOT (v_audit->>'canDelete')::boolean THEN
    RAISE EXCEPTION 'DELETE_BLOCKED:%', v_audit->>'blockers';
  END IF;
  IF (v_audit->>'hasDependencies')::boolean AND NOT p_delete_dependents THEN
    RAISE EXCEPTION 'CLIENT_HAS_DEPENDENTS:%', v_audit->'counts';
  END IF;

  IF p_delete_dependents THEN
    FOR v_project IN
      SELECT id FROM public.projects WHERE client_id = p_client_id AND organization_id = v_org
    LOOP
      PERFORM public.delete_project_permanently(v_project);
    END LOOP;
    DELETE FROM public.properties WHERE client_id = p_client_id AND organization_id = v_org;
  END IF;

  DELETE FROM public.clients WHERE id = p_client_id AND organization_id = v_org;

  RETURN jsonb_build_object('ok', true, 'deleted', v_audit->'counts', 'clientId', p_client_id);
END;
$$;

REVOKE ALL ON FUNCTION public.can_delete_org_records(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.audit_project_deletion(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.audit_client_deletion(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_project_permanently(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_client_permanently(uuid, boolean) FROM anon;

GRANT EXECUTE ON FUNCTION public.can_delete_org_records(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_project_deletion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_client_deletion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_project_permanently(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_client_permanently(uuid, boolean) TO authenticated;
