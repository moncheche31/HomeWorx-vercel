DO $do$
DECLARE
  r record;
  keep text[] := ARRAY[
    'apply_assembly_template','apply_ballpark_task_pricing','apply_composite_assembly','apply_geometry_quantities',
    'apply_knowledge_base_pricing','apply_scope_template','audit_client_deletion','audit_project_deletion',
    'bulk_update_scope_inclusion','confirm_estimate_line_catalog','copy_estimate_to_project','cost_book_entry',
    'create_estimate_from_scope','create_estimate_revision','create_estimate_version','create_organization_for_current_user',
    'current_active_organization_id','delete_client_permanently','delete_project_permanently','delete_scope_item',
    'discard_estimate_ballpark_draft','duplicate_assembly','duplicate_scope_item','estimate_is_editable',
    'insert_template_item','insert_template_section','line_pricing_basis','move_scope_item','move_scope_item_to_position',
    'reconcile_estimate_from_scope','record_assembly_usage','rederive_measurement_quantities','release_copied_estimate_pricing',
    'reorder_project_rooms','reorder_scope_items','reorder_scope_sections','repair_estimate_pricing','repair_labor_hours',
    'reprice_estimate_from_cost_book','review_estimate_line_quantity','save_estimate_ballpark','save_estimate_ballpark_session',
    'search_assemblies','set_estimate_line_manual_pricing','set_estimate_status','sync_estimate_from_scope'
  ];
  referenced boolean;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    IF r.proname = ANY(keep) THEN CONTINUE; END IF;

    -- keep anything referenced by an RLS policy, a view, or another function body
    SELECT EXISTS (
      SELECT 1 FROM pg_policies pol
      WHERE coalesce(pol.qual,'') || ' ' || coalesce(pol.with_check,'') LIKE '%' || r.proname || '%'
    ) OR EXISTS (
      SELECT 1 FROM pg_views v WHERE v.schemaname = 'public' AND v.definition LIKE '%' || r.proname || '%'
    ) OR EXISTS (
      SELECT 1 FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public' AND p2.oid <> r.oid AND p2.prosrc LIKE '%' || r.proname || '%'
    ) INTO referenced;

    IF referenced THEN CONTINUE; END IF;

    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', r.proname, r.args);
  END LOOP;
END
$do$;
