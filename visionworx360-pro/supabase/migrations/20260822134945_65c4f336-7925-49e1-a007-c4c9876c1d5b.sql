ALTER TABLE public.estimate_line_items
  DROP CONSTRAINT IF EXISTS estimate_line_items_labor_hours_basis_check;
ALTER TABLE public.estimate_line_items
  ADD CONSTRAINT estimate_line_items_labor_hours_basis_check
  CHECK (labor_hours_basis IS NULL OR labor_hours_basis = ANY (ARRAY[
    'contractor','derived_per_unit','flat_task','unknown',
    'fee_no_labor','catalog_production']));

CREATE TABLE IF NOT EXISTS public.estimate_repair_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  repaired int NOT NULL DEFAULT 0,
  unresolved int NOT NULL DEFAULT 0,
  contractor_preserved int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.estimate_repair_runs TO authenticated;
GRANT ALL ON public.estimate_repair_runs TO service_role;
ALTER TABLE public.estimate_repair_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members read repair runs" ON public.estimate_repair_runs;
CREATE POLICY "Org members read repair runs" ON public.estimate_repair_runs
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DO $$
DECLARE
  e record; v_touched int; v_unres int; v_pres int;
BEGIN
  PERFORM set_config('vw.kb_pricing', 'on', true);
  FOR e IN
    SELECT id, organization_id FROM public.estimates
     WHERE locked_at IS NULL AND superseded_by_id IS NULL
       AND status NOT IN ('approved','sent','accepted','declined','superseded')
  LOOP
    SELECT count(*) INTO v_pres FROM public.estimate_line_items
     WHERE estimate_id = e.id AND archived_at IS NULL
       AND (is_price_overridden OR COALESCE(pricing_source,'') IN ('contractor','manual'));

    WITH r AS (
      UPDATE public.estimate_line_items li
         SET cost_basis = NULL, cost_basis_source = NULL, cost_basis_repaired_at = now()
       WHERE li.estimate_id = e.id AND li.archived_at IS NULL
         AND NOT li.is_price_overridden
         AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual')
      RETURNING li.resolution_status
    )
    SELECT count(*), count(*) FILTER (WHERE resolution_status = 'unresolved')
      INTO v_touched, v_unres FROM r;

    IF v_touched > 0 OR v_pres > 0 THEN
      INSERT INTO public.estimate_repair_runs
        (estimate_id, organization_id, repaired, unresolved, contractor_preserved)
      VALUES (e.id, e.organization_id, v_touched - v_unres, v_unres, v_pres);
    END IF;
  END LOOP;
  PERFORM set_config('vw.kb_pricing', 'off', true);
END $$;
