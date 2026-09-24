-- Labor-hour provenance: a per-unit production rate is NOT a total.
ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS labor_hours_basis text,
  ADD COLUMN IF NOT EXISTS labor_hours_per_unit numeric,
  ADD COLUMN IF NOT EXISTS labor_hours_setup numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_hours_formula text,
  ADD COLUMN IF NOT EXISTS labor_hours_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS labor_hours_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS labor_hours_flag text,
  ADD COLUMN IF NOT EXISTS labor_hours_repaired_at timestamptz,
  ADD COLUMN IF NOT EXISTS labor_hours_previous numeric;

ALTER TABLE public.estimate_line_items
  DROP CONSTRAINT IF EXISTS estimate_line_items_labor_hours_basis_check;
ALTER TABLE public.estimate_line_items
  ADD CONSTRAINT estimate_line_items_labor_hours_basis_check
  CHECK (labor_hours_basis IS NULL OR labor_hours_basis IN
    ('contractor', 'derived_per_unit', 'flat_task', 'unknown'));

-- Contractor-side reconciliation record: preliminary level, direct costs,
-- delta drivers, pricing snapshot, final selling price.
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS reconciliation_snapshot jsonb;

COMMENT ON COLUMN public.estimate_line_items.labor_hours IS
  'TOTAL labor hours for the task. Never a per-unit production rate.';
COMMENT ON COLUMN public.estimate_line_items.labor_hours_per_unit IS
  'Per-unit production rate. total = labor_hours_setup + quantity * labor_hours_per_unit.';

/*
 * Generic, evidence-driven labor-hour repair across ALL estimates.
 *
 * Repairs a line ONLY when its own pricing provenance proves the stored total
 * is really the per-unit rate: an expected total was computed, the stored
 * value matches the implied rate, the quantity is greater than one, and the
 * correct value is materially larger. Contractor-entered or contractor-
 * confirmed hours are never touched. Anything merely suspicious is flagged.
 */
CREATE OR REPLACE FUNCTION public.repair_labor_hours(
  _estimate_id uuid DEFAULT NULL,
  _dry_run boolean DEFAULT false
)
RETURNS TABLE (
  line_id uuid,
  estimate_id uuid,
  description text,
  quantity numeric,
  old_hours numeric,
  new_hours numeric,
  hours_per_unit numeric,
  action text,
  reason text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT
      li.id,
      li.estimate_id AS est_id,
      li.description AS descr,
      COALESCE(li.quantity, 0) AS qty,
      COALESCE(li.labor_hours, 0) AS stored,
      NULLIF((li.pricing_provenance->>'computedLaborHours')::numeric, 0) AS computed,
      li.unit_key::text AS unit,
      (li.pricing_source = 'contractor'
        OR li.labor_hours_confirmed_at IS NOT NULL
        OR li.labor_hours_basis = 'contractor'
        OR COALESCE(li.is_price_overridden, false)) AS contractor_owned
    FROM public.estimate_line_items li
    JOIN public.estimates e ON e.id = li.estimate_id
    WHERE li.archived_at IS NULL
      AND e.archived_at IS NULL
      AND (_estimate_id IS NULL OR li.estimate_id = _estimate_id)
  ),
  judged AS (
    SELECT
      c.*,
      CASE WHEN c.qty > 0 AND c.computed IS NOT NULL
           THEN round(c.computed / c.qty, 6) END AS per_unit,
      CASE
        WHEN c.contractor_owned THEN 'preserved'
        WHEN c.computed IS NULL THEN
          CASE WHEN c.qty >= 10 AND c.stored > 0 AND c.stored < c.qty * 0.002
               THEN 'flagged' ELSE 'ok' END
        WHEN c.qty > 1
             AND c.stored > 0
             AND c.computed >= c.stored * 1.25
             AND abs(c.stored - (c.computed / c.qty)) <= greatest((c.computed / c.qty) * 0.02, 1e-9)
          THEN 'repaired'
        WHEN c.qty > 1
             AND c.stored > 0
             AND c.computed >= c.stored * 1.25
          THEN 'flagged'
        ELSE 'ok'
      END AS verdict
    FROM candidate c
  ),
  applied AS (
    UPDATE public.estimate_line_items li
    SET labor_hours = round(j.computed, 4),
        labor_hours_previous = j.stored,
        labor_hours_per_unit = j.per_unit,
        labor_hours_basis = 'derived_per_unit',
        labor_hours_formula = j.qty::text || ' × ' || j.per_unit::text || ' hr/unit',
        labor_hours_repaired_at = now(),
        labor_hours_flag = NULL,
        updated_at = now()
    FROM judged j
    WHERE li.id = j.id AND j.verdict = 'repaired' AND NOT _dry_run
    RETURNING li.id
  ),
  marked AS (
    UPDATE public.estimate_line_items li
    SET labor_hours_flag = 'labor_hours_suspicious',
        updated_at = now()
    FROM judged j
    WHERE li.id = j.id AND j.verdict = 'flagged' AND NOT _dry_run
      AND li.labor_hours_flag IS DISTINCT FROM 'labor_hours_suspicious'
    RETURNING li.id
  ),
  stamped AS (
    UPDATE public.estimate_line_items li
    SET labor_hours_basis = 'contractor'
    FROM judged j
    WHERE li.id = j.id AND j.verdict = 'preserved' AND NOT _dry_run
      AND li.labor_hours_basis IS DISTINCT FROM 'contractor'
    RETURNING li.id
  )
  SELECT
    j.id,
    j.est_id,
    j.descr,
    j.qty,
    j.stored,
    CASE WHEN j.verdict = 'repaired' THEN round(j.computed, 4) ELSE j.stored END,
    j.per_unit,
    j.verdict,
    CASE j.verdict
      WHEN 'repaired' THEN 'Stored total equalled the per-unit rate; quantity was never applied.'
      WHEN 'flagged' THEN 'Hours disagree with the pricing evidence but the correct value is not proven.'
      WHEN 'preserved' THEN 'Contractor-owned hours are never recalculated.'
      ELSE 'Consistent with quantity and pricing evidence.'
    END
  FROM judged j
  WHERE j.verdict <> 'ok'
     OR (SELECT count(*) FROM applied) < 0
     OR (SELECT count(*) FROM marked) < 0
     OR (SELECT count(*) FROM stamped) < 0;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_labor_hours(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_labor_hours(uuid, boolean) TO authenticated, service_role;
