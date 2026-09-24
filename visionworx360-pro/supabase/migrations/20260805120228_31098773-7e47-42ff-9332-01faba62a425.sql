-- 1. Lock down SECURITY DEFINER functions -------------------------------

-- 1a. Trigger functions must never be directly callable
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_function_result(p.oid) = 'trigger'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- 1b. Callable SECURITY DEFINER RPCs: no PUBLIC/anon execute, keep authenticated
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_function_result(p.oid) <> 'trigger'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- has_role / is_org_member are internal helpers used inside policies
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kb_apply_pricing(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;

-- 2. clients: allow org-scoped deletion ---------------------------------
DROP POLICY IF EXISTS clients_delete ON public.clients;
CREATE POLICY clients_delete ON public.clients
  FOR DELETE TO authenticated
  USING (is_org_member(organization_id));

REVOKE ALL ON public.clients FROM anon;

-- 3. estimate_ballpark_sessions: verify parent linkage -------------------
DROP POLICY IF EXISTS "Org members can create ballpark sessions" ON public.estimate_ballpark_sessions;
CREATE POLICY "Org members can create ballpark sessions" ON public.estimate_ballpark_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = current_active_organization_id()
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.projects p
                WHERE p.id = estimate_ballpark_sessions.project_id
                  AND p.organization_id = estimate_ballpark_sessions.organization_id)
    AND (estimate_id IS NULL OR EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_ballpark_sessions.estimate_id
        AND e.organization_id = estimate_ballpark_sessions.organization_id
        AND e.project_id = estimate_ballpark_sessions.project_id))
  );

DROP POLICY IF EXISTS "Org members can update ballpark sessions" ON public.estimate_ballpark_sessions;
CREATE POLICY "Org members can update ballpark sessions" ON public.estimate_ballpark_sessions
  FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = current_active_organization_id()
    AND EXISTS (SELECT 1 FROM public.projects p
                WHERE p.id = estimate_ballpark_sessions.project_id
                  AND p.organization_id = estimate_ballpark_sessions.organization_id)
    AND (estimate_id IS NULL OR EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_ballpark_sessions.estimate_id
        AND e.organization_id = estimate_ballpark_sessions.organization_id
        AND e.project_id = estimate_ballpark_sessions.project_id))
  );

-- 4. Parent/child organization consistency ------------------------------

-- estimate_line_items
DROP POLICY IF EXISTS eli_insert ON public.estimate_line_items;
CREATE POLICY eli_insert ON public.estimate_line_items
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(organization_id)
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.estimates e
                WHERE e.id = estimate_line_items.estimate_id
                  AND e.organization_id = estimate_line_items.organization_id
                  AND e.project_id = estimate_line_items.project_id)
    AND (scope_item_id IS NULL OR EXISTS (
      SELECT 1 FROM public.scope_items si
      WHERE si.id = estimate_line_items.scope_item_id
        AND si.organization_id = estimate_line_items.organization_id))
    AND (scope_section_id IS NULL OR EXISTS (
      SELECT 1 FROM public.scope_sections ss
      WHERE ss.id = estimate_line_items.scope_section_id
        AND ss.organization_id = estimate_line_items.organization_id))
    AND (room_id IS NULL OR EXISTS (
      SELECT 1 FROM public.project_rooms r
      WHERE r.id = estimate_line_items.room_id
        AND r.organization_id = estimate_line_items.organization_id))
  );

DROP POLICY IF EXISTS eli_update ON public.estimate_line_items;
CREATE POLICY eli_update ON public.estimate_line_items
  FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (
    is_org_member(organization_id)
    AND EXISTS (SELECT 1 FROM public.estimates e
                WHERE e.id = estimate_line_items.estimate_id
                  AND e.organization_id = estimate_line_items.organization_id
                  AND e.project_id = estimate_line_items.project_id)
    AND (scope_item_id IS NULL OR EXISTS (
      SELECT 1 FROM public.scope_items si
      WHERE si.id = estimate_line_items.scope_item_id
        AND si.organization_id = estimate_line_items.organization_id))
    AND (scope_section_id IS NULL OR EXISTS (
      SELECT 1 FROM public.scope_sections ss
      WHERE ss.id = estimate_line_items.scope_section_id
        AND ss.organization_id = estimate_line_items.organization_id))
    AND (room_id IS NULL OR EXISTS (
      SELECT 1 FROM public.project_rooms r
      WHERE r.id = estimate_line_items.room_id
        AND r.organization_id = estimate_line_items.organization_id))
  );

-- scope_sections (drop duplicate legacy policies, keep one hardened pair)
DROP POLICY IF EXISTS scope_sections_insert_org ON public.scope_sections;
DROP POLICY IF EXISTS scope_sections_update_org ON public.scope_sections;
DROP POLICY IF EXISTS scope_sections_select_org ON public.scope_sections;
DROP POLICY IF EXISTS scope_sections_insert ON public.scope_sections;
CREATE POLICY scope_sections_insert ON public.scope_sections
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(organization_id)
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.projects p
                WHERE p.id = scope_sections.project_id
                  AND p.organization_id = scope_sections.organization_id)
    AND (room_id IS NULL OR EXISTS (
      SELECT 1 FROM public.project_rooms r
      WHERE r.id = scope_sections.room_id
        AND r.project_id = scope_sections.project_id
        AND r.organization_id = scope_sections.organization_id))
  );

DROP POLICY IF EXISTS scope_sections_update ON public.scope_sections;
CREATE POLICY scope_sections_update ON public.scope_sections
  FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (
    is_org_member(organization_id)
    AND EXISTS (SELECT 1 FROM public.projects p
                WHERE p.id = scope_sections.project_id
                  AND p.organization_id = scope_sections.organization_id)
    AND (room_id IS NULL OR EXISTS (
      SELECT 1 FROM public.project_rooms r
      WHERE r.id = scope_sections.room_id
        AND r.project_id = scope_sections.project_id
        AND r.organization_id = scope_sections.organization_id))
  );

-- scope_items
DROP POLICY IF EXISTS scope_items_insert_org ON public.scope_items;
DROP POLICY IF EXISTS scope_items_update_org ON public.scope_items;
DROP POLICY IF EXISTS scope_items_select_org ON public.scope_items;
DROP POLICY IF EXISTS scope_items_insert ON public.scope_items;
CREATE POLICY scope_items_insert ON public.scope_items
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(organization_id)
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.projects p
                WHERE p.id = scope_items.project_id
                  AND p.organization_id = scope_items.organization_id)
    AND (section_id IS NULL OR EXISTS (
      SELECT 1 FROM public.scope_sections ss
      WHERE ss.id = scope_items.section_id
        AND ss.project_id = scope_items.project_id
        AND ss.organization_id = scope_items.organization_id))
    AND (room_id IS NULL OR EXISTS (
      SELECT 1 FROM public.project_rooms r
      WHERE r.id = scope_items.room_id
        AND r.project_id = scope_items.project_id
        AND r.organization_id = scope_items.organization_id))
  );

DROP POLICY IF EXISTS scope_items_update ON public.scope_items;
CREATE POLICY scope_items_update ON public.scope_items
  FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (
    is_org_member(organization_id)
    AND EXISTS (SELECT 1 FROM public.projects p
                WHERE p.id = scope_items.project_id
                  AND p.organization_id = scope_items.organization_id)
    AND (section_id IS NULL OR EXISTS (
      SELECT 1 FROM public.scope_sections ss
      WHERE ss.id = scope_items.section_id
        AND ss.project_id = scope_items.project_id
        AND ss.organization_id = scope_items.organization_id))
    AND (room_id IS NULL OR EXISTS (
      SELECT 1 FROM public.project_rooms r
      WHERE r.id = scope_items.room_id
        AND r.project_id = scope_items.project_id
        AND r.organization_id = scope_items.organization_id))
  );

-- project_notes: replace tautological EXISTS comparisons
DROP POLICY IF EXISTS project_notes_insert ON public.project_notes;
CREATE POLICY project_notes_insert ON public.project_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = current_active_organization_id()
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.projects p
                WHERE p.id = project_notes.project_id
                  AND p.organization_id = project_notes.organization_id)
    AND (room_id IS NULL OR EXISTS (
      SELECT 1 FROM public.project_rooms r
      WHERE r.id = project_notes.room_id
        AND r.project_id = project_notes.project_id
        AND r.organization_id = project_notes.organization_id))
  );

DROP POLICY IF EXISTS project_notes_update ON public.project_notes;
CREATE POLICY project_notes_update ON public.project_notes
  FOR UPDATE TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (
    is_org_member(organization_id)
    AND organization_id = current_active_organization_id()
    AND EXISTS (SELECT 1 FROM public.projects p
                WHERE p.id = project_notes.project_id
                  AND p.organization_id = project_notes.organization_id)
    AND (room_id IS NULL OR EXISTS (
      SELECT 1 FROM public.project_rooms r
      WHERE r.id = project_notes.room_id
        AND r.project_id = project_notes.project_id
        AND r.organization_id = project_notes.organization_id))
  );

-- 5. user_roles: no client-side role assignment -------------------------
REVOKE ALL ON public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.user_roles FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

DROP POLICY IF EXISTS user_roles_no_self_assignment ON public.user_roles;
CREATE POLICY user_roles_no_self_assignment ON public.user_roles
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (false);
