CREATE OR REPLACE FUNCTION public.enforce_quantity_evidence_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contractor boolean := coalesce(NEW.is_price_overridden, false)
                          OR coalesce(NEW.pricing_source, '') IN ('contractor', 'manual');
  v_fee boolean := public.is_fee_basis(NEW.cost_basis);
  v_confirmed boolean := NEW.catalog_confirmed_at IS NOT NULL;
  v_old_key text := NEW.catalog_item_key;
  v_allowed text[] := ARRAY['contractor_entered','measurement','geometry_derived',
                            'scope_stated_count','fee_scope','ballpark_allowance'];
  v_fee_amount numeric := coalesce(NEW.material_cost, 0) + coalesce(NEW.other_cost, 0)
                        + coalesce(NEW.subcontractor_cost, 0) + coalesce(NEW.equipment_cost, 0);
BEGIN
  IF v_old_key IS NOT NULL AND NOT v_confirmed
     AND NOT public.catalog_mapping_is_semantic(NEW.description, v_old_key) THEN
    NEW.catalog_item_key := NULL;
    NEW.pricing_source := 'unmatched';
    NEW.pricing_provenance := coalesce(NEW.pricing_provenance, '{}'::jsonb)
      || jsonb_build_object('rejectedCatalogKey', v_old_key,
                            'rejectedReason', 'semantic_mismatch',
                            'rejectedAt', now());
    NEW.labor_hours_per_unit := 0;
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := 'no_catalog_match';
    NEW.quantity_basis := 'needs_evidence';
    NEW.quantity_basis_note :=
      'The catalog item matched to this task did not describe this work. The match was removed - needs review.';
  END IF;

  IF NOT v_fee
     AND public.quantity_is_composite_scope(NEW.description, NEW.unit_key::text, NEW.quantity) THEN
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := coalesce(nullif(NEW.unresolved_reason, ''), 'ambiguous_multi_scope');
    NEW.quantity_basis := 'needs_evidence';
    NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
      'This line bundles several components into one unit. Break it into counted components or price it as a labelled allowance.');
  END IF;

  /*
    A permit or fee is its own evidence: the amount IS the scope. It carries no
    measured quantity and no labour, so the generic evidence gate must not
    empty it out - a permit with a real fee stays priced and resolved.
  */
  IF v_fee AND v_fee_amount > 0 THEN
    NEW.resolution_status := 'resolved';
    NEW.unresolved_reason := NULL;
    NEW.labor_hours := 0;
    NEW.quantity_basis := 'fee_scope';
    NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
      'Fee or permit line: the fee amount is the scope, no measured quantity.');
    RETURN NEW;
  END IF;

  IF NEW.resolution_status::text = 'unresolved' THEN
    IF coalesce(NEW.labor_hours, 0) <> 0 OR coalesce(NEW.material_cost, 0) <> 0
       OR coalesce(NEW.equipment_cost, 0) <> 0 OR coalesce(NEW.subcontractor_cost, 0) <> 0
       OR coalesce(NEW.other_cost, 0) <> 0 THEN
      NEW.pricing_provenance := coalesce(NEW.pricing_provenance, '{}'::jsonb)
        || jsonb_build_object('clearedOnUnresolved', jsonb_build_object(
             'laborHours', NEW.labor_hours,
             'materialCost', NEW.material_cost,
             'equipmentCost', NEW.equipment_cost,
             'subcontractorCost', NEW.subcontractor_cost,
             'otherCost', NEW.other_cost,
             'formula', NEW.labor_hours_formula,
             'at', now()));
    END IF;
    NEW.labor_hours := 0;
    NEW.material_cost := 0;
    NEW.equipment_cost := 0;
    NEW.subcontractor_cost := 0;
    NEW.other_cost := 0;
    NEW.labor_hours_formula := 'awaiting quantity - not priced';
    /* An unresolved line keeps whatever real evidence it already has: losing a
       contractor-stated or measured basis here destroyed the quantity evidence
       permanently, so the task could never resolve again once priced. */
    IF coalesce(NEW.quantity_basis, '') <> ALL (v_allowed) THEN
      NEW.quantity_basis := 'needs_evidence';
    END IF;
  ELSE
    IF coalesce(NEW.quantity_basis, '') <> ALL (v_allowed) THEN
      IF v_fee THEN
        NEW.quantity_basis := 'fee_scope';
        NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
          'Fee or permit line: one occurrence, no measured quantity.');
      ELSIF v_contractor THEN
        NEW.quantity_basis := 'contractor_entered';
        NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
          'Quantity entered or accepted by the contractor.');
      ELSIF lower(coalesce(NEW.description, '')) ~ '\m[0-9]+\M'
            AND coalesce(NEW.unit_key::text, '') = 'each' THEN
        NEW.quantity_basis := 'scope_stated_count';
        NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
          'Count stated in the scope wording.');
      ELSE
        NEW.quantity_basis := 'ballpark_allowance';
        NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
          'Assumed quantity - ballpark allowance. Confirm on site before the detailed estimate.');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.resync_estimate_scope_quantities(_estimate_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_updated int := 0;
BEGIN
  /* Scope evidence is the source of truth for system-owned lines. When the
     contractor states a quantity in scope (six linear feet of wall, two
     columns), the estimate line must follow it instead of keeping an older
     assumed value. Contractor-overridden lines are never touched. */
  WITH src AS (
    SELECT li.id, si.quantity AS qty, si.unit_key AS unit,
           si.quantity_basis AS basis, si.quantity_basis_note AS note
    FROM public.estimate_line_items li
    JOIN public.scope_items si ON si.id = li.scope_item_id
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL AND si.archived_at IS NULL
      AND li.is_price_overridden = false
      AND coalesce(li.pricing_source, '') NOT IN ('contractor', 'manual')
      AND li.quantity_reviewed_at IS NULL
      AND coalesce(si.quantity, 0) > 0
      AND coalesce(si.quantity_basis, '') IN ('contractor_entered','measurement','geometry_derived')
      AND (li.quantity IS DISTINCT FROM si.quantity
           OR li.unit_key IS DISTINCT FROM si.unit_key
           OR coalesce(li.quantity_basis, '') IS DISTINCT FROM coalesce(si.quantity_basis, ''))
  ), upd AS (
    UPDATE public.estimate_line_items li SET
      quantity = src.qty,
      unit_key = src.unit,
      quantity_basis = src.basis,
      quantity_basis_note = coalesce(src.note, 'Quantity stated by the contractor in scope.'),
      is_quantity_placeholder = false,
      pricing_provenance = coalesce(li.pricing_provenance, '{}'::jsonb)
        || jsonb_build_object('quantity', jsonb_build_object(
             'source', src.basis, 'value', src.qty, 'unit', src.unit,
             'from', 'scope_item', 'syncedAt', now()))
    FROM src WHERE li.id = src.id
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;
  RETURN v_updated;
END
$function$;

CREATE OR REPLACE FUNCTION public.sync_estimate_from_scope(_estimate_id uuid, _pricing jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_e public.estimates%ROWTYPE; v_count int := 0; v_priced jsonb;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_e.project_id);
  IF v_e.locked_at IS NOT NULL OR v_e.superseded_by_id IS NOT NULL
     OR v_e.status IN ('approved','sent','accepted','declined','superseded')
  THEN RAISE EXCEPTION 'estimate_locked'; END IF;

  INSERT INTO public.estimate_line_items (organization_id, project_id, estimate_id,
    scope_item_id, scope_section_id, room_id, group_label, description, category_key,
    subcategory_key, trade_key, quantity, unit_key, is_client_visible, internal_notes,
    sort_order, created_by, overhead_pct, profit_pct, contingency_pct,
    quantity_basis, quantity_basis_note)
  SELECT v_e.organization_id, v_e.project_id, _estimate_id, si.id, si.section_id, si.room_id,
    ss.name, si.title, si.category_key, si.subcategory_key, si.trade_key,
    COALESCE(si.quantity,1), si.unit_key, si.is_client_visible, si.internal_notes,
    (ss.sort_order * 1000) + si.sort_order, auth.uid(),
    0, 0, v_e.default_contingency_pct, si.quantity_basis, si.quantity_basis_note
  FROM public.scope_items si
  JOIN public.scope_sections ss ON ss.id = si.section_id
  WHERE si.project_id = v_e.project_id AND si.organization_id = v_e.organization_id
    AND si.archived_at IS NULL AND si.is_included = true
    AND NOT EXISTS (
      SELECT 1 FROM public.estimate_line_items li
      WHERE li.estimate_id = _estimate_id AND li.scope_item_id = si.id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.resync_estimate_scope_quantities(_estimate_id);

  IF v_count > 0 THEN
    v_priced := public.kb_apply_pricing(_estimate_id, _pricing, true);

    -- Overhead + profit percentages belong to the legacy method only. A
    -- target-gross-margin estimate must never stack both.
    IF v_e.pricing_method IS DISTINCT FROM 'target_gross_margin' THEN
      PERFORM set_config('vw.kb_pricing', 'on', true);
      UPDATE public.estimate_line_items
         SET overhead_pct = v_e.default_overhead_pct, profit_pct = v_e.default_profit_pct
       WHERE estimate_id = _estimate_id AND overhead_pct = 0 AND profit_pct = 0;
      PERFORM set_config('vw.kb_pricing', 'off', true);
    END IF;
    PERFORM public.enforce_estimate_pricing_method(_estimate_id);

    INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
      actor_user_id, event_type, entity_type, entity_id, summary, metadata)
    VALUES (v_e.organization_id, v_e.project_id, _estimate_id, auth.uid(), 'synced',
      'estimate', _estimate_id, 'Imported new scope items',
      jsonb_build_object('lines', v_count) || COALESCE(v_priced, '{}'::jsonb));
  END IF;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.repair_estimate_pricing(_estimate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_geo jsonb; v_geo2 jsonb; v_priced jsonb; v_band jsonb; v_bind jsonb; v_evi jsonb;
  v_pinned int;
  v_before jsonb; v_after jsonb;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;

  SELECT jsonb_build_object(
      'lines', count(*),
      'laborHours', round(COALESCE(sum(labor_hours),0), 2),
      'unresolved', count(*) FILTER (WHERE resolution_status = 'unresolved'))
    INTO v_before
  FROM public.estimate_line_items
  WHERE estimate_id = _estimate_id AND archived_at IS NULL;

  PERFORM public.resync_estimate_scope_quantities(_estimate_id);
  v_bind := public.bind_unpriced_estimate_lines(_estimate_id);
  -- Evidence gate first: strip quantities that no longer belong to the task.
  v_evi := public.repair_quantity_evidence(_estimate_id);
  v_geo := public.derive_geometry_quantities(_estimate_id);
  v_priced := public.kb_apply_pricing(_estimate_id, NULL, false);
  v_geo2 := public.derive_geometry_quantities(_estimate_id);
  IF COALESCE((v_geo2->>'updated')::int, 0) > 0 THEN
    v_priced := public.kb_apply_pricing(_estimate_id, NULL, false);
  END IF;
  v_pinned := public.apply_pinned_catalog_productivity(_estimate_id);
  PERFORM public.repair_quantity_evidence(_estimate_id);

  UPDATE public.estimate_line_items
     SET cost_basis_repaired_at = now()
   WHERE estimate_id = _estimate_id
     AND archived_at IS NULL
     AND is_price_overridden = false
     AND COALESCE(pricing_source,'') NOT IN ('contractor','manual');

  v_band := public.rebuild_estimate_ballpark(_estimate_id);

  SELECT jsonb_build_object(
      'lines', count(*),
      'laborHours', round(COALESCE(sum(labor_hours),0), 2),
      'unresolved', count(*) FILTER (WHERE resolution_status = 'unresolved'))
    INTO v_after
  FROM public.estimate_line_items
  WHERE estimate_id = _estimate_id AND archived_at IS NULL;

  RETURN jsonb_build_object('before', v_before, 'after', v_after,
    'bound', v_bind, 'evidence', v_evi, 'geometry', v_geo, 'priced', v_priced,
    'pinned', v_pinned, 'ballpark', v_band);
END
$function$;
