-- ============================================================
-- CANONICAL TASK-HOUR MODEL (database side)
-- Mirrors src/domains/estimating/taskHourModel.ts
-- ============================================================

-- Practical minimum task time. Trade + unit-kind + task-context aware.
CREATE OR REPLACE FUNCTION public.min_task_hours(
  _cost_basis public.task_cost_basis,
  _trade text,
  _unit public.scope_unit,
  _description text
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  d text := lower(COALESCE(_description, ''));
  u text := COALESCE(_unit::text, '');
BEGIN
  IF NOT public.is_labor_bearing_basis(COALESCE(_cost_basis, 'labor_production')) THEN
    RETURN 0;
  END IF;

  -- Task-context overrides, heaviest first.
  IF d ~ '(water heater|boiler|furnace|air handler|condenser|mini.?split)' THEN RETURN 4; END IF;
  IF d ~ '(service panel|load center|sub.?panel|panel upgrade|meter)' THEN RETURN 4; END IF;
  IF d ~ '(exterior door|entry door|patio door|slider|window unit|egress)' THEN RETURN 2; END IF;
  IF d ~ '(lvl|header|beam|post|column|girder|bearing wall)' THEN RETURN 2; END IF;
  IF d ~ '(rough.?in)' THEN RETURN 2; END IF;
  IF d ~ '(tub|bathtub|shower pan|shower base|vanity|toilet|sink)' THEN RETURN 1.5; END IF;
  IF d ~ '(circuit|home run|dedicated line)' THEN RETURN 1.5; END IF;
  IF d ~ '(interior door|pre.?hung|door slab)' THEN RETURN 1; END IF;
  IF d ~ '(waterproof|shower niche|curb)' THEN RETURN 1; END IF;
  IF d ~ '(relocat|re.?route|move )' THEN RETURN 1; END IF;
  IF d ~ '(appliance|disposal|dishwasher|range hood|exhaust fan)' THEN RETURN 1; END IF;
  IF d ~ '(gfci|afci|outlet|receptacle|switch|device|dimmer|thermostat)' THEN RETURN 0.5; END IF;
  IF d ~ '(shut.?off|supply line|angle stop|trim.?out)' THEN RETURN 0.5; END IF;
  IF d ~ '(transition|threshold|patch|touch.?up|blend)' THEN RETURN 0.5; END IF;

  -- Counted / single-item tasks vs measured surfaces and runs.
  IF u = '' OR u IN ('each','sheet','gallon','pound','lump_sum','allowance') THEN
    RETURN CASE COALESCE(_trade, '')
      WHEN 'hvac' THEN 1.5
      WHEN 'plumbing' THEN 1
      WHEN 'tile' THEN 1
      WHEN 'roofing' THEN 1
      WHEN 'exterior' THEN 1
      WHEN 'sitework_concrete' THEN 1
      WHEN 'framing' THEN 0.75
      ELSE 0.5
    END;
  END IF;

  RETURN CASE COALESCE(_trade, '')
    WHEN 'tile' THEN 1
    WHEN 'roofing' THEN 1
    WHEN 'sitework_concrete' THEN 1
    WHEN 'general_conditions' THEN 0.25
    WHEN 'unassigned' THEN 0.25
    ELSE 0.5
  END;
END
$$;

-- A contractor's own hours are theirs. Everything else is system-derived.
CREATE OR REPLACE FUNCTION public.is_contractor_owned_labor(_row public.estimate_line_items)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(_row.labor_hours_basis, '') = 'contractor'
      OR _row.labor_hours_confirmed_at IS NOT NULL
      OR COALESCE(_row.pricing_source, '') IN ('contractor', 'manual')
      OR _row.is_price_overridden;
$$;

-- Write-path enforcement: quarter-hour grid for everyone, practical minimum
-- for system-derived work only.
CREATE OR REPLACE FUNCTION public.normalize_labor_quarter_hours()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_incoming_labor_total numeric := COALESCE(NEW.labor_total, 0);
  v_new_labor_total numeric;
  v_min numeric;
BEGIN
  NEW.labor_hours := public.round_quarter_hour(COALESCE(NEW.labor_hours, 0));
  NEW.labor_hours_setup := public.round_quarter_hour(COALESCE(NEW.labor_hours_setup, 0));

  IF COALESCE(NEW.labor_hours, 0) > 0 AND NOT public.is_contractor_owned_labor(NEW) THEN
    v_min := public.min_task_hours(NEW.cost_basis, NEW.trade_key, NEW.unit_key, NEW.description);
    IF COALESCE(v_min, 0) > NEW.labor_hours THEN
      NEW.labor_hours := public.round_quarter_hour(v_min);
    END IF;
  END IF;

  v_new_labor_total := round(COALESCE(NEW.labor_hours, 0) * COALESCE(NEW.labor_rate, 0), 0);
  NEW.labor_total := v_new_labor_total;
  NEW.direct_cost := COALESCE(NEW.direct_cost, 0) + (v_new_labor_total - v_incoming_labor_total);

  RETURN NEW;
END
$$;

-- ============================================================
-- AUDIT + REPAIR of system-owned task hours
-- ============================================================
CREATE OR REPLACE FUNCTION public.repair_task_hours(_estimate_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.estimate_line_items%ROWTYPE;
  v_min numeric;
  v_raw numeric;
  v_new numeric;
  v_measured boolean;
  v_evidence boolean;
  v_repaired int := 0;
  v_flagged int := 0;
  v_preserved int := 0;
  v_zeroed int := 0;
  v_examples jsonb := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT * FROM public.estimate_line_items
     WHERE archived_at IS NULL
       AND (_estimate_id IS NULL OR estimate_id = _estimate_id)
     ORDER BY estimate_id, sort_order
  LOOP
    -- Contractor-owned: quarter-hour normalization only.
    IF public.is_contractor_owned_labor(r) THEN
      v_new := public.round_quarter_hour(r.labor_hours);
      IF v_new IS DISTINCT FROM r.labor_hours THEN
        UPDATE public.estimate_line_items
           SET labor_hours = v_new, labor_hours_previous = r.labor_hours,
               labor_hours_repaired_at = now()
         WHERE id = r.id;
        v_repaired := v_repaired + 1;
      ELSE
        v_preserved := v_preserved + 1;
      END IF;
      CONTINUE;
    END IF;

    -- Fees and other non-labor bases carry zero production labor.
    IF NOT public.is_labor_bearing_basis(COALESCE(r.cost_basis, 'labor_production')) THEN
      IF COALESCE(r.labor_hours, 0) <> 0 OR COALESCE(r.labor_hours_setup, 0) <> 0 THEN
        UPDATE public.estimate_line_items
           SET labor_hours = 0, labor_hours_setup = 0,
               labor_hours_previous = r.labor_hours,
               labor_hours_basis = 'fee_no_labor',
               labor_convention = 'none',
               labor_hours_formula = 'no production labor on this cost basis',
               labor_hours_repaired_at = now()
         WHERE id = r.id;
        v_zeroed := v_zeroed + 1;
        v_examples := v_examples || jsonb_build_object(
          'id', r.id, 'description', r.description, 'trade', r.trade_key,
          'before', r.labor_hours, 'after', 0, 'action', 'fee_zeroed');
      END IF;
      CONTINUE;
    END IF;

    v_measured := COALESCE(r.unit_key::text, '') IN
      ('square_foot','square_yard','linear_foot','board_foot','cubic_foot','cubic_yard');
    v_evidence := NOT COALESCE(r.is_quantity_placeholder, false)
      AND COALESCE(r.quantity, 0) > 0
      AND (NOT v_measured
           OR COALESCE(r.quantity_basis, '') IN ('measurement','geometry_derived','contractor_entered')
           OR r.quantity <> 1);

    -- No productivity source, or a measured task with no measured quantity:
    -- flag for review rather than invent an hour value.
    IF COALESCE(r.labor_hours_per_unit, 0) <= 0 AND COALESCE(r.labor_hours, 0) <= 0 THEN
      IF r.resolution_status <> 'unresolved' THEN
        UPDATE public.estimate_line_items
           SET resolution_status = 'unresolved',
               unresolved_reason = COALESCE(r.unresolved_reason, 'no_productivity_source'),
               labor_hours_flag = 'needs_review',
               labor_hours_repaired_at = now()
         WHERE id = r.id;
      END IF;
      v_flagged := v_flagged + 1;
      CONTINUE;
    END IF;

    IF COALESCE(r.labor_hours_per_unit, 0) > 0 AND NOT v_evidence AND v_measured THEN
      UPDATE public.estimate_line_items
         SET labor_hours = 0,
             labor_hours_previous = r.labor_hours,
             resolution_status = 'unresolved',
             unresolved_reason = 'quantity_not_established',
             labor_hours_flag = 'needs_review',
             labor_hours_formula = 'measured task without a measured quantity',
             labor_hours_repaired_at = now()
       WHERE id = r.id;
      v_flagged := v_flagged + 1;
      CONTINUE;
    END IF;

    -- Canonical derivation: setup + quantity x hours-per-unit, floored at the
    -- practical minimum, then snapped to the quarter hour.
    IF COALESCE(r.labor_hours_per_unit, 0) > 0 THEN
      v_raw := COALESCE(r.labor_hours_setup, 0) + COALESCE(r.quantity, 0) * r.labor_hours_per_unit;
    ELSE
      v_raw := COALESCE(r.labor_hours, 0);
    END IF;

    v_min := public.min_task_hours(r.cost_basis, r.trade_key, r.unit_key, r.description);
    v_new := public.round_quarter_hour(GREATEST(v_raw, COALESCE(v_min, 0)));

    IF v_new IS DISTINCT FROM r.labor_hours THEN
      UPDATE public.estimate_line_items
         SET labor_hours = v_new,
             labor_hours_previous = r.labor_hours,
             labor_hours_basis = CASE WHEN COALESCE(r.labor_hours_per_unit,0) > 0
                                      THEN 'catalog_production' ELSE 'flat_task' END,
             labor_convention = CASE WHEN COALESCE(r.labor_hours_per_unit,0) > 0
                                     THEN 'hours_per_unit' ELSE 'total_hours' END,
             labor_hours_formula = CASE
               WHEN COALESCE(v_min,0) > v_raw
                 THEN format('%s + %s x %s = %s hr, raised to %s hr practical minimum',
                             COALESCE(r.labor_hours_setup,0), COALESCE(r.quantity,0),
                             COALESCE(r.labor_hours_per_unit,0), round(v_raw,4), v_min)
               ELSE format('%s + %s x %s',
                           COALESCE(r.labor_hours_setup,0), COALESCE(r.quantity,0),
                           COALESCE(r.labor_hours_per_unit,0)) END,
             labor_hours_repaired_at = now(),
             labor_hours_flag = NULL
       WHERE id = r.id;
      v_repaired := v_repaired + 1;
      IF jsonb_array_length(v_examples) < 40 THEN
        v_examples := v_examples || jsonb_build_object(
          'id', r.id, 'description', r.description, 'trade', r.trade_key,
          'unit', r.unit_key, 'quantity', r.quantity, 'hoursPerUnit', r.labor_hours_per_unit,
          'before', r.labor_hours, 'after', v_new,
          'action', CASE WHEN COALESCE(v_min,0) > v_raw THEN 'minimum_applied' ELSE 'rederived' END);
      END IF;
    ELSE
      v_preserved := v_preserved + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'repaired', v_repaired,
    'feeZeroed', v_zeroed,
    'flagged', v_flagged,
    'preserved', v_preserved,
    'examples', v_examples);
END
$$;

REVOKE ALL ON FUNCTION public.repair_task_hours(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_task_hours(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.min_task_hours(public.task_cost_basis, text, public.scope_unit, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_contractor_owned_labor(public.estimate_line_items) TO authenticated, service_role;
