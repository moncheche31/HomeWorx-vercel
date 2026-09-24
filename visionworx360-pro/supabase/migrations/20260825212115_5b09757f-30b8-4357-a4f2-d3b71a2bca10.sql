-- 1. ONE BAND WRITER: the SQL side never computes a band; it only flags.
CREATE OR REPLACE FUNCTION public.sync_estimate_ballpark_after_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_snapshot jsonb;
BEGIN
  FOR v_id IN
    SELECT DISTINCT estimate_id FROM changed_lines WHERE estimate_id IS NOT NULL
  LOOP
    SELECT e.range_snapshot INTO v_snapshot
      FROM public.estimates e WHERE e.id = v_id;

    /* Only mark a band that already exists; never invent one. */
    CONTINUE WHEN v_snapshot IS NULL OR v_snapshot = '{}'::jsonb;

    /* Canonical estimate lines own the price. The JS canonical pipeline is the
       single writer of low/expected/high; SQL only requests a refresh. */
    UPDATE public.estimates
       SET range_snapshot = jsonb_set(
             range_snapshot, '{needsCanonicalRefresh}', 'true'::jsonb, true)
     WHERE id = v_id
       AND COALESCE(range_snapshot->>'needsCanonicalRefresh','') <> 'true';
  END LOOP;
  RETURN NULL;
END
$$;

-- 2. PROJECT CONSISTENCY: room and section must belong to the same project.
CREATE OR REPLACE FUNCTION public.validate_estimate_line_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e RECORD;
  v_scope_project uuid;
  v_section_project uuid;
  v_room_project uuid;
BEGIN
  SELECT organization_id, project_id INTO e FROM public.estimates WHERE id = NEW.estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found' USING ERRCODE='42501'; END IF;
  NEW.organization_id := e.organization_id;
  NEW.project_id := e.project_id;

  IF NEW.scope_item_id IS NOT NULL THEN
    SELECT project_id INTO v_scope_project FROM public.scope_items WHERE id = NEW.scope_item_id;
    IF v_scope_project IS NOT NULL AND v_scope_project IS DISTINCT FROM e.project_id THEN
      RAISE EXCEPTION 'Scope item belongs to a different project' USING ERRCODE='42501';
    END IF;
  END IF;

  IF NEW.scope_section_id IS NOT NULL THEN
    SELECT project_id INTO v_section_project FROM public.scope_sections WHERE id = NEW.scope_section_id;
    IF v_section_project IS NOT NULL AND v_section_project IS DISTINCT FROM e.project_id THEN
      RAISE EXCEPTION 'Scope section belongs to a different project' USING ERRCODE='42501';
    END IF;
  END IF;

  IF NEW.room_id IS NOT NULL THEN
    SELECT project_id INTO v_room_project FROM public.project_rooms WHERE id = NEW.room_id;
    IF v_room_project IS NOT NULL AND v_room_project IS DISTINCT FROM e.project_id THEN
      RAISE EXCEPTION 'Room belongs to a different project' USING ERRCODE='42501';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

-- 3. PHANTOM OVERRIDE + WHOLE-DOLLAR MONEY, before the cost-basis gate.
CREATE OR REPLACE FUNCTION public.normalize_estimate_line_money()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_has_money boolean;
  v_no_charge boolean := COALESCE(NEW.pricing_provenance->>'noCharge','') = 'true';
BEGIN
  NEW.material_cost      := public.money_round(NEW.material_cost);
  NEW.equipment_cost     := public.money_round(NEW.equipment_cost);
  NEW.subcontractor_cost := public.money_round(NEW.subcontractor_cost);
  NEW.other_cost         := public.money_round(NEW.other_cost);

  v_has_money := (COALESCE(NEW.labor_hours,0) > 0 AND COALESCE(NEW.labor_rate,0) > 0)
                 OR COALESCE(NEW.material_cost,0) > 0
                 OR COALESCE(NEW.equipment_cost,0) > 0
                 OR COALESCE(NEW.subcontractor_cost,0) > 0
                 OR COALESCE(NEW.other_cost,0) > 0;

  /* An "override" with no dollars and no hours is not a contractor price. */
  IF COALESCE(NEW.is_price_overridden,false) AND NOT v_has_money AND NOT v_no_charge THEN
    NEW.is_price_overridden := false;
    IF NEW.pricing_provenance IS NOT NULL THEN
      NEW.pricing_provenance := NEW.pricing_provenance
        || jsonb_build_object('phantomOverrideCleared', true);
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS eli_a_normalize_money ON public.estimate_line_items;
CREATE TRIGGER eli_a_normalize_money
BEFORE INSERT OR UPDATE ON public.estimate_line_items
FOR EACH ROW EXECUTE FUNCTION public.normalize_estimate_line_money();

-- 4. PRICING SETTINGS PERSISTENCE: an explicit method choice is locked at birth.
CREATE OR REPLACE FUNCTION public.lock_explicit_estimate_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pricing_method IS NOT NULL AND NEW.pricing_settings_locked_at IS NULL THEN
    NEW.pricing_settings_locked_at := now();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS estimates_a_lock_explicit_pricing ON public.estimates;
CREATE TRIGGER estimates_a_lock_explicit_pricing
BEFORE INSERT ON public.estimates
FOR EACH ROW EXECUTE FUNCTION public.lock_explicit_estimate_pricing();

REVOKE EXECUTE ON FUNCTION public.normalize_estimate_line_money() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.lock_explicit_estimate_pricing() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_estimate_ballpark_after_lines() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_estimate_line_item() FROM PUBLIC, anon;
