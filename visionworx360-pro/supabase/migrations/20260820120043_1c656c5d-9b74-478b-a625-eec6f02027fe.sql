-- 1. Explicit pricing-selection marker -------------------------------------
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS pricing_settings_locked_at timestamptz;

UPDATE public.estimates
   SET pricing_settings_locked_at = COALESCE(updated_at, now())
 WHERE pricing_settings_locked_at IS NULL
   AND pricing_method = 'target_gross_margin'
   AND COALESCE(target_gross_margin_pct, 0) > 0;

-- Once explicitly chosen, an estimate's pricing method/values survive every
-- automatic reprice, scope sync, tier change and reopen. Only an update that
-- deliberately re-stamps pricing_settings_locked_at may change them.
CREATE OR REPLACE FUNCTION public.preserve_explicit_estimate_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.pricing_settings_locked_at IS NOT NULL
     AND NEW.pricing_settings_locked_at IS NOT DISTINCT FROM OLD.pricing_settings_locked_at
  THEN
    NEW.pricing_method := OLD.pricing_method;
    NEW.target_gross_margin_pct := OLD.target_gross_margin_pct;
    NEW.default_overhead_pct := OLD.default_overhead_pct;
    NEW.default_profit_pct := OLD.default_profit_pct;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_preserve_explicit_pricing ON public.estimates;
CREATE TRIGGER estimates_preserve_explicit_pricing
BEFORE UPDATE ON public.estimates
FOR EACH ROW EXECUTE FUNCTION public.preserve_explicit_estimate_pricing();

-- 2. Mutually exclusive pricing methods on lines ---------------------------
CREATE OR REPLACE FUNCTION public.enforce_estimate_pricing_method(_estimate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_e public.estimates%ROWTYPE;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_e.pricing_method IS DISTINCT FROM 'target_gross_margin' THEN RETURN; END IF;

  PERFORM set_config('vw.kb_pricing', 'on', true);
  UPDATE public.estimate_line_items
     SET overhead_pct = 0, profit_pct = 0
   WHERE estimate_id = _estimate_id
     AND (COALESCE(overhead_pct, 0) <> 0 OR COALESCE(profit_pct, 0) <> 0);
  PERFORM set_config('vw.kb_pricing', 'off', true);
END;
$$;

-- 3. Scope removals always reach the estimate ------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_estimate_from_scope(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_removed int := 0;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_e.project_id);

  IF v_e.archived_at IS NOT NULL
     OR v_e.locked_at IS NOT NULL
     OR v_e.superseded_by_id IS NOT NULL
     OR v_e.status IN ('approved','sent','accepted','declined','superseded')
  THEN
    RETURN jsonb_build_object('removed', 0, 'skipped', true);
  END IF;

  -- Work that is not in the CURRENT project's active scope is not this job's
  -- work, whatever the contractor did to the line afterwards. Lines are
  -- archived (never deleted), so history and pricing stay recoverable.
  WITH stale AS (
    SELECT li.id
    FROM public.estimate_line_items li
    LEFT JOIN public.scope_items si ON si.id = li.scope_item_id
    WHERE li.estimate_id = _estimate_id
      AND li.organization_id = v_e.organization_id
      AND li.archived_at IS NULL
      AND li.scope_item_id IS NOT NULL
      AND (
        si.id IS NULL
        OR si.archived_at IS NOT NULL
        OR COALESCE(si.is_included, false) = false
        OR si.project_id <> v_e.project_id
        OR si.organization_id <> v_e.organization_id
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
END;
$$;

-- Excluding or archiving scope work removes its generated lines immediately.
CREATE OR REPLACE FUNCTION public.archive_estimate_lines_on_scope_exclusion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL)
     OR (COALESCE(NEW.is_included, true) = false AND COALESCE(OLD.is_included, true) = true)
  THEN
    UPDATE public.estimate_line_items li
       SET archived_at = now()
      FROM public.estimates e
     WHERE li.scope_item_id = NEW.id
       AND li.archived_at IS NULL
       AND e.id = li.estimate_id
       AND e.archived_at IS NULL
       AND e.locked_at IS NULL
       AND e.superseded_by_id IS NULL
       AND e.status NOT IN ('approved','sent','accepted','declined','superseded');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scope_items_archive_estimate_lines ON public.scope_items;
CREATE TRIGGER scope_items_archive_estimate_lines
AFTER UPDATE ON public.scope_items
FOR EACH ROW EXECUTE FUNCTION public.archive_estimate_lines_on_scope_exclusion();

-- 4. Sync / reprice must respect the estimate's pricing method --------------
CREATE OR REPLACE FUNCTION public.sync_estimate_from_scope(_estimate_id uuid, _pricing jsonb DEFAULT NULL::jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    sort_order, created_by, overhead_pct, profit_pct, contingency_pct)
  SELECT v_e.organization_id, v_e.project_id, _estimate_id, si.id, si.section_id, si.room_id,
    ss.name, si.title, si.category_key, si.subcategory_key, si.trade_key,
    COALESCE(si.quantity,1), si.unit_key, si.is_client_visible, si.internal_notes,
    (ss.sort_order * 1000) + si.sort_order, auth.uid(),
    0, 0, v_e.default_contingency_pct
  FROM public.scope_items si
  JOIN public.scope_sections ss ON ss.id = si.section_id
  WHERE si.project_id = v_e.project_id AND si.organization_id = v_e.organization_id
    AND si.archived_at IS NULL AND si.is_included = true
    AND NOT EXISTS (
      SELECT 1 FROM public.estimate_line_items li
      WHERE li.estimate_id = _estimate_id AND li.scope_item_id = si.id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

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
$$;

CREATE OR REPLACE FUNCTION public.apply_knowledge_base_pricing(_estimate_id uuid, _pricing jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_e public.estimates%ROWTYPE; v_res jsonb;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_e.project_id);

  IF v_e.locked_at IS NOT NULL
     OR v_e.superseded_by_id IS NOT NULL
     OR v_e.status IN ('approved','sent','accepted','declined','superseded')
  THEN
    RAISE EXCEPTION 'estimate_locked';
  END IF;

  v_res := public.kb_apply_pricing(_estimate_id, _pricing, false);
  PERFORM public.enforce_estimate_pricing_method(_estimate_id);

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_e.organization_id, v_e.project_id, _estimate_id, auth.uid(), 'repriced',
    'estimate', _estimate_id, 'Applied Knowledge Base pricing', v_res);

  RETURN v_res;
END;
$$;
