-- Idempotency guard: one live revision number per lineage (estimates only).
CREATE UNIQUE INDEX IF NOT EXISTS estimates_lineage_revision_unique_idx
  ON public.estimates (COALESCE(lineage_root_id, id), revision_number)
  WHERE archived_at IS NULL AND document_kind = 'estimate';

CREATE OR REPLACE FUNCTION public.create_estimate_revision(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_src public.estimates%ROWTYPE;
  v_root uuid;
  v_rev integer;
  v_version integer;
  v_new uuid;
  v_lines integer := 0;
BEGIN
  SELECT * INTO v_src FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found' USING ERRCODE = 'P0002'; END IF;

  -- Access is derived server-side from the caller's active organization.
  PERFORM public.assert_project_in_active_org(v_src.project_id);

  -- Serialize concurrent requests for the same source estimate.
  PERFORM pg_advisory_xact_lock(hashtextextended(_estimate_id::text, 0));

  SELECT * INTO v_src FROM public.estimates WHERE id = _estimate_id;

  -- Already revised: return the existing revision instead of creating another.
  IF v_src.superseded_by_id IS NOT NULL THEN
    RETURN jsonb_build_object('estimate_id', v_src.superseded_by_id, 'created', false);
  END IF;

  IF v_src.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'estimate_archived' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(v_src.document_kind, 'estimate') <> 'estimate' THEN
    RAISE EXCEPTION 'estimate_not_revisable' USING ERRCODE = '42501';
  END IF;

  v_root := COALESCE(v_src.lineage_root_id, v_src.id);

  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_rev
    FROM public.estimates
   WHERE COALESCE(lineage_root_id, id) = v_root
     AND COALESCE(document_kind, 'estimate') = 'estimate';

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM public.estimates WHERE project_id = v_src.project_id;

  INSERT INTO public.estimates (
    organization_id, project_id, version, parent_estimate_id, title, notes, status,
    currency, tax_rate, default_overhead_pct, default_profit_pct, default_contingency_pct,
    default_labor_rate, cost_catalog_ref, range_assumptions, range_snapshot,
    document_kind, lineage_root_id, revision_number, option_label,
    superseded_by_id, sent_at, accepted_at, declined_at, locked_at,
    approved_by, approved_at, created_by)
  VALUES (
    v_src.organization_id, v_src.project_id, v_version, v_src.id, v_src.title, v_src.notes, 'draft',
    v_src.currency, v_src.tax_rate, v_src.default_overhead_pct, v_src.default_profit_pct,
    v_src.default_contingency_pct, v_src.default_labor_rate, v_src.cost_catalog_ref,
    v_src.range_assumptions, v_src.range_snapshot,
    'estimate', v_root, v_rev, v_src.option_label,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, auth.uid())
  RETURNING id INTO v_new;

  INSERT INTO public.estimate_line_items (
    organization_id, project_id, estimate_id, scope_item_id, scope_section_id, room_id,
    group_label, description, category_key, subcategory_key, trade_key, quantity, unit_key,
    labor_hours, labor_rate, material_cost, equipment_cost, subcontractor_cost, other_cost,
    overhead_pct, profit_pct, contingency_pct, is_taxable, is_client_visible, internal_notes,
    catalog_item_key, sort_order, created_by)
  SELECT organization_id, project_id, v_new, scope_item_id, scope_section_id, room_id,
    group_label, description, category_key, subcategory_key, trade_key, quantity, unit_key,
    labor_hours, labor_rate, material_cost, equipment_cost, subcontractor_cost, other_cost,
    overhead_pct, profit_pct, contingency_pct, is_taxable, is_client_visible, internal_notes,
    catalog_item_key, sort_order, auth.uid()
  FROM public.estimate_line_items
  WHERE estimate_id = v_src.id AND archived_at IS NULL;
  GET DIAGNOSTICS v_lines = ROW_COUNT;

  -- Source becomes an immutable historical snapshot. Line items untouched.
  UPDATE public.estimates
     SET lineage_root_id = v_root,
         status = 'superseded',
         superseded_by_id = v_new,
         locked_at = COALESCE(locked_at, now()),
         updated_at = now()
   WHERE id = v_src.id;

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES
    (v_src.organization_id, v_src.project_id, v_new, auth.uid(), 'revision_created',
     'estimate', v_new, 'Revised version created',
     jsonb_build_object('from_estimate', v_src.id, 'revision_number', v_rev, 'lines', v_lines)),
    (v_src.organization_id, v_src.project_id, v_src.id, auth.uid(), 'superseded',
     'estimate', v_src.id, 'Superseded by a newer revision',
     jsonb_build_object('superseded_by', v_new, 'revision_number', v_rev));

  RETURN jsonb_build_object('estimate_id', v_new, 'created', true, 'revision_number', v_rev,
                            'lines_copied', v_lines);
END
$function$;

REVOKE ALL ON FUNCTION public.create_estimate_revision(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_estimate_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_estimate_revision(uuid) TO service_role;
