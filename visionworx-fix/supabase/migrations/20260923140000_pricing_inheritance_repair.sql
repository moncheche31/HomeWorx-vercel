-- ============================================================================
-- VisionWorx360 Pro — Controlled Recovery Step 1C
-- Pricing-inheritance repair (revision / version / copy / org defaults / lock
-- order / provenance).
--
-- Proven by: visionworx-regression Step 1B suite (21 failing tests at 989b399).
-- Scope: ONLY estimate pricing inheritance. No data repair: existing estimates
-- and audit rows are not touched. No policy change: every value an estimate
-- ends up with comes from (a) the caller's explicit choice, (b) the source
-- estimate, or (c) the organization — exactly as ADR-061 already specifies.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Column defaults on estimates.
--
-- A column DEFAULT is applied BEFORE any BEFORE INSERT trigger runs, so with
-- `pricing_method DEFAULT 'overhead_profit'`, `default_overhead_pct DEFAULT 10`,
-- `default_labor_rate DEFAULT 65` ... the inheritance trigger could never tell
-- "caller omitted this" from "caller chose this". Removing the defaults makes
-- an omitted value arrive as NULL (= inherit). NOT NULL is kept: Postgres
-- checks it AFTER the BEFORE triggers, which now always supply a value.
-- ----------------------------------------------------------------------------
ALTER TABLE public.estimates
  ALTER COLUMN pricing_method          DROP DEFAULT,
  ALTER COLUMN target_gross_margin_pct DROP DEFAULT,
  ALTER COLUMN default_overhead_pct    DROP DEFAULT,
  ALTER COLUMN default_profit_pct      DROP DEFAULT,
  ALTER COLUMN default_labor_rate      DROP DEFAULT;


-- ----------------------------------------------------------------------------
-- 2. The ONE organization-default inheritance mechanism.
--
--   NULL  -> inherit from the estimate's organization
--   value -> kept exactly as given (an explicit 0 is a choice, not "unset")
--
-- Fallbacks below are used only if the organization row itself is missing a
-- value; they are the former column defaults, so no new policy is introduced.
-- Inactive-method fields are still normalized by estimates_pricing_20_mutex.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_org_pricing_method_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  org_method text;
  org_target numeric;
  org_oh numeric;
  org_profit numeric;
  org_rate numeric;
BEGIN
  SELECT default_pricing_method, default_target_gross_margin_pct,
         default_overhead_pct, default_profit_pct, default_labor_rate
    INTO org_method, org_target, org_oh, org_profit, org_rate
    FROM public.organizations WHERE id = NEW.organization_id;

  IF NEW.pricing_method IS NULL THEN
    NEW.pricing_method := COALESCE(NULLIF(btrim(org_method), ''), 'overhead_profit');
  END IF;
  IF NEW.target_gross_margin_pct IS NULL THEN
    NEW.target_gross_margin_pct := COALESCE(org_target, 0);
  END IF;
  IF NEW.default_overhead_pct IS NULL THEN
    NEW.default_overhead_pct := COALESCE(org_oh, 10);
  END IF;
  IF NEW.default_profit_pct IS NULL THEN
    NEW.default_profit_pct := COALESCE(org_profit, 10);
  END IF;
  IF NEW.default_labor_rate IS NULL THEN
    NEW.default_labor_rate := COALESCE(org_rate, 65);
  END IF;

  RETURN NEW;
END;
$function$;


-- ----------------------------------------------------------------------------
-- 3. Explicit, documented BEFORE INSERT order on estimates.
--
-- Postgres fires same-event triggers in name order. The lock stamp previously
-- sorted FIRST ("estimates_a_..."), before any default or normalization. The
-- three pricing triggers are renamed so the order is part of the name:
--
--   estimates_pricing_10_org_defaults   fill NULLs from the organization
--   estimates_pricing_20_mutex          zero the inactive method's inputs
--   estimates_pricing_30_lock_snapshot  stamp pricing_settings_locked_at on
--                                       the FINAL snapshot
--
-- estimates_preserve_explicit_pricing (BEFORE UPDATE) still sorts before
-- estimates_pricing_20_mutex, exactly as before.
-- The Step 1C test D5 asserts this order from pg_trigger.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS estimates_a_lock_explicit_pricing ON public.estimates;
DROP TRIGGER IF EXISTS estimates_apply_org_pricing_defaults ON public.estimates;
DROP TRIGGER IF EXISTS estimates_pricing_mutex ON public.estimates;

CREATE TRIGGER estimates_pricing_10_org_defaults
  BEFORE INSERT ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.apply_org_pricing_method_defaults();

CREATE TRIGGER estimates_pricing_20_mutex
  BEFORE INSERT OR UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_estimate_pricing_mutex();

CREATE TRIGGER estimates_pricing_30_lock_snapshot
  BEFORE INSERT ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.lock_explicit_estimate_pricing();


-- ----------------------------------------------------------------------------
-- 4. Provenance helpers (internal; not callable by clients).
-- ----------------------------------------------------------------------------

/* Values actually stored on an estimate, with the inactive method's inputs
   listed as not applicable rather than presented as settings. */
CREATE OR REPLACE FUNCTION public.estimate_pricing_applied_snapshot(_e public.estimates)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'applied', jsonb_build_object(
      'pricing_method', _e.pricing_method,
      'target_gross_margin_pct', _e.target_gross_margin_pct,
      'default_overhead_pct', _e.default_overhead_pct,
      'default_profit_pct', _e.default_profit_pct,
      'default_contingency_pct', _e.default_contingency_pct,
      'default_labor_rate', _e.default_labor_rate,
      'tax_rate', _e.tax_rate),
    'not_applicable', CASE WHEN _e.pricing_method = 'target_gross_margin'
      THEN jsonb_build_array('default_overhead_pct', 'default_profit_pct')
      ELSE jsonb_build_array('target_gross_margin_pct') END,
    /* The estimate labor rate prices hand-added lines and lines with no
       catalog/book rate; book-priced lines carry their own craft rate. */
    'labor_rate_role', 'estimate_default_for_manual_and_unrated_lines');
$function$;

/* What the organization is configured with, verbatim. */
CREATE OR REPLACE FUNCTION public.organization_pricing_configured(_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'pricing_method', o.default_pricing_method,
    'target_gross_margin_pct', o.default_target_gross_margin_pct,
    'default_overhead_pct', o.default_overhead_pct,
    'default_profit_pct', o.default_profit_pct,
    'default_labor_rate', o.default_labor_rate,
    'tax_rate', o.tax_rate)
  FROM public.organizations o WHERE o.id = _org;
$function$;

REVOKE ALL ON FUNCTION public.estimate_pricing_applied_snapshot(public.estimates) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.organization_pricing_configured(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estimate_pricing_applied_snapshot(public.estimates) TO service_role;
GRANT EXECUTE ON FUNCTION public.organization_pricing_configured(uuid) TO service_role;


-- ----------------------------------------------------------------------------
-- 5. create_estimate_from_scope — value resolution UNCHANGED (A1/B1 already
--    pass); only the audit provenance changes. The old record put the
--    normalized, applied values (e.g. 0/0 under a margin target) under
--    source='organization_defaults' as if they were the company's settings.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_estimate_from_scope(_project_id uuid, _title text DEFAULT ''::text, _pricing jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_version int;
  v_estimate uuid;
  v_currency text;
  v_count int := 0;
  v_priced jsonb;
  v_o public.organizations%ROWTYPE;
  v_e public.estimates%ROWTYPE;
  v_method text;
  v_target numeric;
  v_oh numeric;
  v_profit numeric;
  v_rate numeric;
  v_tax numeric;
BEGIN
  SELECT COALESCE(MAX(version),0)+1 INTO v_version FROM public.estimates WHERE project_id = _project_id;
  SELECT * INTO v_o FROM public.organizations WHERE id = v_org;

  v_currency := COALESCE(v_o.currency, 'USD');
  v_tax := COALESCE(v_o.tax_rate, 0);
  v_rate := COALESCE(NULLIF(v_o.default_labor_rate, 0), 65);
  v_method := COALESCE(NULLIF(btrim(v_o.default_pricing_method), ''), 'overhead_profit');
  IF v_method NOT IN ('overhead_profit','target_gross_margin') THEN
    v_method := 'overhead_profit';
  END IF;

  /* Mutually exclusive by construction: only the active method's inputs survive. */
  IF v_method = 'target_gross_margin' THEN
    v_target := COALESCE(v_o.default_target_gross_margin_pct, 0);
    IF v_target < 0 OR v_target >= 100 THEN v_target := 0; END IF;
    v_oh := 0; v_profit := 0;
  ELSE
    v_target := 0;
    v_oh := COALESCE(v_o.default_overhead_pct, 10);
    v_profit := COALESCE(v_o.default_profit_pct, 10);
  END IF;

  INSERT INTO public.estimates (organization_id, project_id, version, title, status,
    currency, tax_rate, created_by, pricing_method, target_gross_margin_pct,
    default_overhead_pct, default_profit_pct, default_labor_rate)
  VALUES (v_org, _project_id, v_version,
    COALESCE(NULLIF(btrim(_title),''), 'Estimate v' || v_version), 'draft',
    v_currency, v_tax, auth.uid(), v_method, v_target, v_oh, v_profit, v_rate)
  RETURNING id INTO v_estimate;

  INSERT INTO public.estimate_line_items (organization_id, project_id, estimate_id,
    scope_item_id, scope_section_id, room_id, group_label, description,
    category_key, subcategory_key, trade_key, quantity, unit_key,
    is_client_visible, internal_notes, sort_order, created_by,
    overhead_pct, profit_pct, contingency_pct,
    origin_type, origin_ref, origin_at,
    quantity_basis, quantity_basis_note, quantity_basis_formula, quantity_source_measurement_id)
  SELECT v_org, _project_id, v_estimate, si.id, si.section_id, si.room_id,
    ss.name, si.title, si.category_key, si.subcategory_key, si.trade_key,
    COALESCE(si.quantity, 1), si.unit_key, si.is_client_visible, si.internal_notes,
    (ss.sort_order * 1000) + si.sort_order, auth.uid(), 0, 0, 0,
    'scope_sync', si.id, now(),
    si.quantity_basis, si.quantity_basis_note, si.quantity_basis_formula,
    si.quantity_source_measurement_id
  FROM public.scope_items si
  JOIN public.scope_sections ss ON ss.id = si.section_id
  WHERE si.project_id = _project_id AND si.organization_id = v_org
    AND si.archived_at IS NULL AND si.is_included = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  v_priced := public.kb_apply_pricing(v_estimate, _pricing, true);

  /* Lines with no Knowledge Base match inherit the estimate's own snapshot,
     never a hard-coded 10/10, and stay at zero under target-margin pricing. */
  PERFORM set_config('vw.kb_pricing', 'on', true);
  UPDATE public.estimate_line_items
     SET overhead_pct = v_oh, profit_pct = v_profit
   WHERE estimate_id = v_estimate AND overhead_pct = 0 AND profit_pct = 0;
  PERFORM set_config('vw.kb_pricing', 'off', true);

  SELECT * INTO v_e FROM public.estimates WHERE id = v_estimate;

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, _project_id, v_estimate, auth.uid(), 'created', 'estimate', v_estimate,
    'Estimate generated from scope',
    jsonb_build_object('lines', v_count, 'version', v_version,
      'pricing_inherited',
        jsonb_build_object(
          'source', 'organization_defaults',
          'organization_id', v_org,
          'organization_configured', public.organization_pricing_configured(v_org))
        || public.estimate_pricing_applied_snapshot(v_e))
    || COALESCE(v_priced, '{}'::jsonb));

  RETURN v_estimate;
END $function$;


-- ----------------------------------------------------------------------------
-- 6. Shared line copy for revision + version.
--
-- The old copy carried money and quantity but NOT the fields the line gates
-- use to decide a line is legitimately priced (pricing_source,
-- is_price_overridden, quantity_basis, quantity_reviewed_at, cost_basis, ...).
-- On insert, enforce_estimate_line_cost_basis / the quantity-evidence gate
-- then saw an unexplained price, zeroed it and marked every line unresolved,
-- so a revision priced at $0.
--
-- PERSISTED (describe the line and why its price is what it is):
--   scope/room/section refs, description, classification, quantity, unit,
--   every cost input, overhead/profit/contingency, taxable/visible flags,
--   notes, catalog key + mapping + confirmation, pricing_source/provenance/
--   priced_at/is_price_overridden, quantity evidence (placeholder flags,
--   basis, note, formula, measurement, reviewed_by/at), labor model (basis,
--   per-unit, setup, formula, convention, confirmed_by/at, flag, repair
--   history), cost_basis(+source, repaired_at), resolution_status +
--   unresolved_reason, trade_source, contractor rate overrides, pricing_basis,
--   cost_book_applied_at, origin (why the line exists), assembly linkage.
-- NOT PERSISTED (belong to the new document / its creation):
--   id (new), estimate_id (the new estimate), created_by / created_at /
--   updated_at (the actor and time of THIS derivation), archived_at (only
--   active lines are copied), generated *_total / direct_cost (recomputed).
-- parent_line_id is REMAPPED to the new parent line, never pointed back into
-- the source estimate.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.copy_estimate_lines_for_derivation(_source_estimate_id uuid, _new_estimate_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lines integer := 0;
BEGIN
  WITH src AS (
    SELECT li.*, gen_random_uuid() AS new_id
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _source_estimate_id AND li.archived_at IS NULL
  )
  INSERT INTO public.estimate_line_items (
    id, organization_id, project_id, estimate_id, scope_item_id, scope_section_id, room_id,
    group_label, description, category_key, subcategory_key, trade_key, quantity, unit_key,
    labor_hours, labor_rate, material_cost, equipment_cost, subcontractor_cost, other_cost,
    overhead_pct, profit_pct, contingency_pct, is_taxable, is_client_visible, internal_notes,
    catalog_item_key, sort_order, created_by,
    pricing_source, pricing_provenance, priced_at, is_price_overridden,
    catalog_mapping_source, catalog_confirmed_by, catalog_confirmed_at,
    is_quantity_placeholder, quantity_reviewed_by, quantity_reviewed_at,
    origin_type, origin_ref, origin_at,
    quantity_basis, quantity_basis_note, quantity_basis_formula, quantity_source_measurement_id,
    labor_hours_basis, labor_hours_per_unit, labor_hours_setup, labor_hours_formula,
    labor_hours_confirmed_at, labor_hours_confirmed_by, labor_hours_flag,
    labor_hours_repaired_at, labor_hours_previous,
    cost_basis, cost_basis_source, labor_convention, resolution_status, unresolved_reason,
    cost_basis_repaired_at, trade_source, quantity_is_assumed_default,
    rate_override_hours_per_unit, rate_override_setup_hours, rate_override_labor_rate,
    rate_override_material_unit_cost, rate_override_equipment_cost, rate_override_other_cost,
    rate_override_note, rate_override_by, rate_override_at,
    pricing_basis, cost_book_applied_at,
    assembly_expansion_id, assembly_expansion_status, parent_line_id, assembly_component_id,
    assembly_geometry, assembly_component_quantities)
  SELECT
    s.new_id, s.organization_id, s.project_id, _new_estimate_id, s.scope_item_id, s.scope_section_id, s.room_id,
    s.group_label, s.description, s.category_key, s.subcategory_key, s.trade_key, s.quantity, s.unit_key,
    s.labor_hours, s.labor_rate, s.material_cost, s.equipment_cost, s.subcontractor_cost, s.other_cost,
    s.overhead_pct, s.profit_pct, s.contingency_pct, s.is_taxable, s.is_client_visible, s.internal_notes,
    s.catalog_item_key, s.sort_order, auth.uid(),
    s.pricing_source, s.pricing_provenance, s.priced_at, s.is_price_overridden,
    s.catalog_mapping_source, s.catalog_confirmed_by, s.catalog_confirmed_at,
    s.is_quantity_placeholder, s.quantity_reviewed_by, s.quantity_reviewed_at,
    s.origin_type, s.origin_ref, s.origin_at,
    s.quantity_basis, s.quantity_basis_note, s.quantity_basis_formula, s.quantity_source_measurement_id,
    s.labor_hours_basis, s.labor_hours_per_unit, s.labor_hours_setup, s.labor_hours_formula,
    s.labor_hours_confirmed_at, s.labor_hours_confirmed_by, s.labor_hours_flag,
    s.labor_hours_repaired_at, s.labor_hours_previous,
    s.cost_basis, s.cost_basis_source, s.labor_convention, s.resolution_status, s.unresolved_reason,
    s.cost_basis_repaired_at, s.trade_source, s.quantity_is_assumed_default,
    s.rate_override_hours_per_unit, s.rate_override_setup_hours, s.rate_override_labor_rate,
    s.rate_override_material_unit_cost, s.rate_override_equipment_cost, s.rate_override_other_cost,
    s.rate_override_note, s.rate_override_by, s.rate_override_at,
    s.pricing_basis, s.cost_book_applied_at,
    s.assembly_expansion_id, s.assembly_expansion_status,
    (SELECT p.new_id FROM src p WHERE p.id = s.parent_line_id),
    s.assembly_component_id, s.assembly_geometry, s.assembly_component_quantities
  FROM src s;
  GET DIAGNOSTICS v_lines = ROW_COUNT;
  RETURN v_lines;
END $function$;

REVOKE ALL ON FUNCTION public.copy_estimate_lines_for_derivation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copy_estimate_lines_for_derivation(uuid, uuid) TO service_role;


-- ----------------------------------------------------------------------------
-- 7. create_estimate_revision.
--
-- Header: the source's pricing snapshot is carried, not re-derived from the
-- organization's CURRENT settings. PERSISTED: pricing_method,
-- target_gross_margin_pct, overhead/profit/contingency, labor rate, tax,
-- currency (already), pricing_mode (labor-only etc.), labor_settings,
-- pricing location basis, pricing_engine_version/pricing_repriced_at (the
-- copied lines were priced by that engine — dropping the stamp would force a
-- "stale engine" reprice of identical lines on first open), and the pricing
-- confirmation state (source/confirmed_at/confirmation_required/reason) of
-- that same snapshot.
-- NOT PERSISTED (revision-specific, unchanged from before): id, version,
-- revision_number, lineage, status, sent/accepted/declined/locked/approval
-- stamps, superseded_by, scope-sync fingerprint, reconciliation snapshot,
-- copy lineage, created_*; pricing_settings_locked_at is stamped by
-- estimates_pricing_30_lock_snapshot on the final values.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_estimate_revision(_estimate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_src public.estimates%ROWTYPE;
  v_new_row public.estimates%ROWTYPE;
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
    approved_by, approved_at, created_by,
    pricing_method, target_gross_margin_pct, pricing_mode, labor_settings,
    pricing_engine_version, pricing_repriced_at,
    pricing_location, pricing_location_source, pricing_location_override, pricing_location_factors,
    pricing_source, pricing_confirmed_at, pricing_confirmation_required, pricing_confirmation_reason)
  VALUES (
    v_src.organization_id, v_src.project_id, v_version, v_src.id, v_src.title, v_src.notes, 'draft',
    v_src.currency, v_src.tax_rate, v_src.default_overhead_pct, v_src.default_profit_pct,
    v_src.default_contingency_pct, v_src.default_labor_rate, v_src.cost_catalog_ref,
    v_src.range_assumptions, v_src.range_snapshot,
    'estimate', v_root, v_rev, v_src.option_label,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, auth.uid(),
    v_src.pricing_method, v_src.target_gross_margin_pct, v_src.pricing_mode, v_src.labor_settings,
    v_src.pricing_engine_version, v_src.pricing_repriced_at,
    v_src.pricing_location, v_src.pricing_location_source, v_src.pricing_location_override, v_src.pricing_location_factors,
    v_src.pricing_source, v_src.pricing_confirmed_at, v_src.pricing_confirmation_required, v_src.pricing_confirmation_reason)
  RETURNING id INTO v_new;

  v_lines := public.copy_estimate_lines_for_derivation(v_src.id, v_new);

  -- Source becomes an immutable historical snapshot. Line items untouched.
  UPDATE public.estimates
     SET lineage_root_id = v_root,
         status = 'superseded',
         superseded_by_id = v_new,
         locked_at = COALESCE(locked_at, now()),
         updated_at = now()
   WHERE id = v_src.id;

  SELECT * INTO v_new_row FROM public.estimates WHERE id = v_new;

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES
    (v_src.organization_id, v_src.project_id, v_new, auth.uid(), 'revision_created',
     'estimate', v_new, 'Revised version created',
     jsonb_build_object('from_estimate', v_src.id, 'revision_number', v_rev, 'lines', v_lines,
       'pricing_inherited',
         jsonb_build_object('source', 'source_estimate', 'source_estimate_id', v_src.id)
         || public.estimate_pricing_applied_snapshot(v_new_row))),
    (v_src.organization_id, v_src.project_id, v_src.id, auth.uid(), 'superseded',
     'estimate', v_src.id, 'Superseded by a newer revision',
     jsonb_build_object('superseded_by', v_new, 'revision_number', v_rev));

  RETURN jsonb_build_object('estimate_id', v_new, 'created', true, 'revision_number', v_rev,
                            'lines_copied', v_lines);
END
$function$;


-- ----------------------------------------------------------------------------
-- 8. create_estimate_version — same header snapshot and line copy as a
--    revision (versions have no lineage/supersession, unchanged).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_estimate_version(_estimate_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_src public.estimates%ROWTYPE;
  v_new_row public.estimates%ROWTYPE;
  v_new uuid;
  v_version int;
  v_lines int := 0;
BEGIN
  SELECT * INTO v_src FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_src.project_id);

  SELECT COALESCE(MAX(version),0)+1 INTO v_version FROM public.estimates WHERE project_id = v_src.project_id;

  INSERT INTO public.estimates (organization_id, project_id, version, parent_estimate_id,
    title, notes, status, currency, tax_rate, default_overhead_pct, default_profit_pct,
    default_contingency_pct, default_labor_rate, cost_catalog_ref, created_by,
    pricing_method, target_gross_margin_pct, pricing_mode, labor_settings,
    pricing_engine_version, pricing_repriced_at,
    pricing_location, pricing_location_source, pricing_location_override, pricing_location_factors,
    pricing_source, pricing_confirmed_at, pricing_confirmation_required, pricing_confirmation_reason)
  VALUES (v_src.organization_id, v_src.project_id, v_version, v_src.id,
    'Estimate v' || v_version, v_src.notes, 'draft', v_src.currency, v_src.tax_rate,
    v_src.default_overhead_pct, v_src.default_profit_pct, v_src.default_contingency_pct,
    v_src.default_labor_rate, v_src.cost_catalog_ref, auth.uid(),
    v_src.pricing_method, v_src.target_gross_margin_pct, v_src.pricing_mode, v_src.labor_settings,
    v_src.pricing_engine_version, v_src.pricing_repriced_at,
    v_src.pricing_location, v_src.pricing_location_source, v_src.pricing_location_override, v_src.pricing_location_factors,
    v_src.pricing_source, v_src.pricing_confirmed_at, v_src.pricing_confirmation_required, v_src.pricing_confirmation_reason)
  RETURNING id INTO v_new;

  v_lines := public.copy_estimate_lines_for_derivation(_estimate_id, v_new);

  SELECT * INTO v_new_row FROM public.estimates WHERE id = v_new;

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_src.organization_id, v_src.project_id, v_new, auth.uid(), 'version_created',
    'estimate', v_new, 'New estimate version created',
    jsonb_build_object('from_estimate', _estimate_id, 'version', v_version, 'lines', v_lines,
      'pricing_inherited',
        jsonb_build_object('source', 'source_estimate', 'source_estimate_id', v_src.id)
        || public.estimate_pricing_applied_snapshot(v_new_row)));

  RETURN v_new;
END $function$;


-- ----------------------------------------------------------------------------
-- 9. copy_estimate_to_project.
--
--   copyMarkup = true  -> the source's pricing method, target and
--                         overhead/profit/contingency are carried.
--   copyMarkup = false -> method/target/overhead/profit are passed as NULL so
--                         the DESTINATION organization's defaults are applied
--                         by estimates_pricing_10_org_defaults (no hard-coded
--                         10/10); copied lines take the new estimate's own
--                         overhead/profit (0/0 under a margin target).
-- Line copy, scope copy and every other behavior are unchanged.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.copy_estimate_to_project(_source_estimate_id uuid, _target_project_id uuid, _options jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_target_project_id);
  v_src public.estimates%ROWTYPE;
  v_new_row public.estimates%ROWTYPE;
  v_src_project text;
  v_existing uuid;
  v_new uuid;
  v_version int;
  v_lines int := 0;
  v_sections int := 0;
  v_label text;
  v_copy_scope boolean := COALESCE((_options->>'copyScope')::boolean, false);
  v_copy_lines boolean := COALESCE((_options->>'copyLines')::boolean, true);
  v_copy_qty boolean := COALESCE((_options->>'copyQuantities')::boolean, true);
  v_copy_pricing boolean := COALESCE((_options->>'copyPricing')::boolean, true);
  v_copy_markup boolean := COALESCE((_options->>'copyMarkup')::boolean, true);
  v_copy_notes boolean := COALESCE((_options->>'copyAssumptions')::boolean, true);
  v_engine int := COALESCE((_options->>'pricingEngineVersion')::int, 0);
  v_sec record;
  v_new_section uuid;
BEGIN
  SELECT * INTO v_src FROM public.estimates WHERE id = _source_estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source estimate not found'; END IF;
  IF v_src.organization_id <> v_org THEN RAISE EXCEPTION 'Source estimate not in active organization'; END IF;
  IF v_src.project_id = _target_project_id THEN RAISE EXCEPTION 'Cannot copy an estimate into its own project'; END IF;

  -- Idempotent: repeated confirmation returns the estimate already created.
  SELECT id INTO v_existing FROM public.estimates
   WHERE project_id = _target_project_id
     AND copied_from_estimate_id = _source_estimate_id
     AND archived_at IS NULL
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('estimate_id', v_existing, 'created', false, 'lines', 0, 'sections', 0);
  END IF;

  SELECT name INTO v_src_project FROM public.projects WHERE id = v_src.project_id;
  v_label := COALESCE(v_src_project, 'previous project') || ' — ' ||
             to_char(COALESCE(v_src.updated_at, v_src.created_at), 'YYYY-MM-DD');

  SELECT COALESCE(MAX(version),0)+1 INTO v_version FROM public.estimates WHERE project_id = _target_project_id;

  -- Header copy is deliberately selective: pricing configuration only. No
  -- customer identity, dates, approvals, signatures, payments or history.
  INSERT INTO public.estimates (organization_id, project_id, version, title, status,
    currency, tax_rate, pricing_method, target_gross_margin_pct,
    default_overhead_pct, default_profit_pct, default_contingency_pct,
    default_labor_rate, cost_catalog_ref, intake_mode, pricing_mode, labor_settings,
    notes, created_by, pricing_engine_version, pricing_copy_mode,
    copied_from_estimate_id, copied_from_project_id, copied_from_label, copied_source_dated_at)
  VALUES (v_org, _target_project_id, v_version,
    'Estimate v' || v_version, 'draft',
    v_src.currency, v_src.tax_rate,
    CASE WHEN v_copy_markup THEN v_src.pricing_method ELSE NULL END,
    CASE WHEN v_copy_markup THEN v_src.target_gross_margin_pct ELSE NULL END,
    CASE WHEN v_copy_markup THEN v_src.default_overhead_pct ELSE NULL END,
    CASE WHEN v_copy_markup THEN v_src.default_profit_pct ELSE NULL END,
    CASE WHEN v_copy_markup THEN v_src.default_contingency_pct ELSE 0 END,
    v_src.default_labor_rate, v_src.cost_catalog_ref, 'detailed',
    v_src.pricing_mode, v_src.labor_settings,
    CASE WHEN v_copy_notes THEN v_src.notes ELSE NULL END,
    auth.uid(), v_engine, 'copied',
    v_src.id, v_src.project_id, v_label,
    COALESCE(v_src.updated_at, v_src.created_at))
  RETURNING id INTO v_new;

  SELECT * INTO v_new_row FROM public.estimates WHERE id = v_new;

  IF v_copy_scope THEN
    FOR v_sec IN
      SELECT * FROM public.scope_sections
       WHERE project_id = v_src.project_id AND organization_id = v_org AND archived_at IS NULL
       ORDER BY sort_order
    LOOP
      INSERT INTO public.scope_sections (organization_id, project_id, name, description,
        section_key, trade_key, sort_order, created_by)
      VALUES (v_org, _target_project_id, v_sec.name, v_sec.description,
        v_sec.section_key, v_sec.trade_key, v_sec.sort_order, auth.uid())
      RETURNING id INTO v_new_section;
      v_sections := v_sections + 1;

      INSERT INTO public.scope_items (organization_id, project_id, section_id, title,
        description, action_key, category_key, subcategory_key, trade_key, quantity, unit_key,
        material_selection, finish_selection, assumptions, exclusions, labor_notes,
        internal_notes, is_client_visible, is_included, priority, sort_order, scope_item_key,
        created_by)
      SELECT v_org, _target_project_id, v_new_section, si.title,
        si.description, si.action_key, si.category_key, si.subcategory_key, si.trade_key,
        CASE WHEN v_copy_qty THEN si.quantity ELSE NULL END, si.unit_key,
        si.material_selection, si.finish_selection,
        CASE WHEN v_copy_notes THEN si.assumptions ELSE NULL END,
        CASE WHEN v_copy_notes THEN si.exclusions ELSE NULL END,
        CASE WHEN v_copy_notes THEN si.labor_notes ELSE NULL END,
        CASE WHEN v_copy_notes THEN si.internal_notes ELSE NULL END,
        si.is_client_visible, si.is_included, si.priority, si.sort_order, si.scope_item_key,
        auth.uid()
      FROM public.scope_items si
      WHERE si.section_id = v_sec.id AND si.organization_id = v_org AND si.archived_at IS NULL;
    END LOOP;
  END IF;

  IF v_copy_lines THEN
    -- scope_item_id / scope_section_id / room_id are intentionally NULL: those
    -- rows belong to the source project and must never be referenced here.
    INSERT INTO public.estimate_line_items (organization_id, project_id, estimate_id,
      group_label, description, category_key, subcategory_key, trade_key, quantity, unit_key,
      labor_hours, labor_rate, material_cost, equipment_cost, subcontractor_cost, other_cost,
      overhead_pct, profit_pct, contingency_pct, is_taxable, is_client_visible, internal_notes,
      catalog_item_key, catalog_mapping_source, sort_order, created_by,
      pricing_source, is_price_overridden, pricing_provenance)
    SELECT v_org, _target_project_id, v_new,
      li.group_label, li.description, li.category_key, li.subcategory_key, li.trade_key,
      CASE WHEN v_copy_qty THEN li.quantity ELSE 1 END, li.unit_key,
      CASE WHEN v_copy_pricing THEN li.labor_hours ELSE 0 END,
      CASE WHEN v_copy_pricing THEN li.labor_rate ELSE 0 END,
      CASE WHEN v_copy_pricing THEN li.material_cost ELSE 0 END,
      CASE WHEN v_copy_pricing THEN li.equipment_cost ELSE 0 END,
      CASE WHEN v_copy_pricing THEN li.subcontractor_cost ELSE 0 END,
      CASE WHEN v_copy_pricing THEN li.other_cost ELSE 0 END,
      CASE WHEN v_copy_markup THEN li.overhead_pct ELSE v_new_row.default_overhead_pct END,
      CASE WHEN v_copy_markup THEN li.profit_pct ELSE v_new_row.default_profit_pct END,
      CASE WHEN v_copy_markup THEN li.contingency_pct ELSE 0 END,
      li.is_taxable, li.is_client_visible,
      CASE WHEN v_copy_notes THEN li.internal_notes ELSE NULL END,
      li.catalog_item_key, li.catalog_mapping_source, li.sort_order, auth.uid(),
      CASE WHEN v_copy_pricing THEN 'copied' ELSE NULL END,
      v_copy_pricing,
      CASE WHEN v_copy_pricing
        THEN jsonb_build_object('copiedFromEstimateId', v_src.id,
                                'copiedFromLineId', li.id,
                                'copiedFromLabel', v_label)
        ELSE '{}'::jsonb END
    FROM public.estimate_line_items li
    WHERE li.estimate_id = _source_estimate_id AND li.archived_at IS NULL;
    GET DIAGNOSTICS v_lines = ROW_COUNT;
  END IF;

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, _target_project_id, v_new, auth.uid(), 'created', 'estimate', v_new,
    'Copied from ' || v_label,
    jsonb_build_object('source_estimate_id', v_src.id, 'source_project_id', v_src.project_id,
                       'lines', v_lines, 'sections', v_sections, 'options', _options,
                       'pricing_inherited',
                         CASE WHEN v_copy_markup
                           THEN jsonb_build_object('source', 'source_estimate',
                                                   'source_estimate_id', v_src.id)
                           ELSE jsonb_build_object('source', 'organization_defaults',
                                                   'organization_id', v_org,
                                                   'organization_configured',
                                                     public.organization_pricing_configured(v_org))
                         END
                         || public.estimate_pricing_applied_snapshot(v_new_row)));

  RETURN jsonb_build_object('estimate_id', v_new, 'created', true,
                            'lines', v_lines, 'sections', v_sections);
END $function$;
