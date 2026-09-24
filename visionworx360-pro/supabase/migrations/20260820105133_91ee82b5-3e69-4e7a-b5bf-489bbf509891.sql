CREATE OR REPLACE FUNCTION public.reconcile_estimate_from_scope(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_removed int := 0;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_e.project_id);

  -- Issued, locked, superseded or archived documents are historical records.
  IF v_e.archived_at IS NOT NULL
     OR v_e.locked_at IS NOT NULL
     OR v_e.superseded_by_id IS NOT NULL
     OR v_e.status IN ('approved','sent','accepted','declined','superseded')
  THEN
    RETURN jsonb_build_object('removed', 0, 'skipped', true);
  END IF;

  -- A line whose scope item left the scope is no longer this job's work.
  -- Contractor intent (manual price, confirmed catalog match, reviewed
  -- quantity) is never discarded automatically.
  WITH stale AS (
    SELECT li.id
    FROM public.estimate_line_items li
    LEFT JOIN public.scope_items si ON si.id = li.scope_item_id
    WHERE li.estimate_id = _estimate_id
      AND li.organization_id = v_e.organization_id
      AND li.archived_at IS NULL
      AND li.scope_item_id IS NOT NULL
      AND COALESCE(li.is_price_overridden, false) = false
      AND li.catalog_confirmed_by IS NULL
      AND li.quantity_reviewed_at IS NULL
      AND (
        si.id IS NULL
        OR si.archived_at IS NOT NULL
        OR COALESCE(si.is_included, false) = false
      )
  )
  UPDATE public.estimate_line_items li
     SET archived_at = now()
    FROM stale
   WHERE li.id = stale.id;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  IF v_removed > 0 THEN
    INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
      actor_user_id, event_type, entity_type, entity_id, summary, metadata)
    VALUES (v_e.organization_id, v_e.project_id, _estimate_id, auth.uid(),
      'updated', 'estimate', _estimate_id,
      'Removed estimate lines for work no longer in the scope',
      jsonb_build_object('removed', v_removed));
  END IF;

  RETURN jsonb_build_object('removed', v_removed, 'skipped', false);
END $function$;

REVOKE ALL ON FUNCTION public.reconcile_estimate_from_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_estimate_from_scope(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_estimate_from_scope(uuid) TO service_role;
