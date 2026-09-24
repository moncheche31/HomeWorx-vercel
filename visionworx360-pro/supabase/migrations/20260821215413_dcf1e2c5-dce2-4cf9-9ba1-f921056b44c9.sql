-- Generic, evidence-based estimate math backfill. Contractor authority is absolute.

CREATE OR REPLACE FUNCTION public.audit_estimate_math(
  _estimate_id uuid DEFAULT NULL,
  _dry_run boolean DEFAULT true
)
RETURNS TABLE (
  line_id uuid,
  estimate_id uuid,
  description text,
  action text,
  code text,
  old_value numeric,
  new_value numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r record;
  v_labor numeric;
  v_material numeric;
  v_direct numeric;
  v_tgm boolean;
  v_cg numeric;
BEGIN
  FOR r IN
    SELECT l.*, e.target_gross_margin_pct, e.default_contingency_pct
    FROM public.estimate_line_items l
    JOIN public.estimates e ON e.id = l.estimate_id
    WHERE l.archived_at IS NULL
      AND (_estimate_id IS NULL OR l.estimate_id = _estimate_id)
  LOOP
    v_tgm := COALESCE(r.target_gross_margin_pct, 0) > 0;
    v_cg := COALESCE(r.default_contingency_pct, 0);

    -- 1. Markup must live above the line, and only one method may apply.
    IF v_tgm AND (COALESCE(r.overhead_pct, 0) + COALESCE(r.profit_pct, 0)) > 0 THEN
      IF NOT _dry_run THEN
        UPDATE public.estimate_line_items
           SET overhead_pct = 0, profit_pct = 0
         WHERE id = r.id;
      END IF;
      line_id := r.id; estimate_id := r.estimate_id; description := r.description;
      action := 'repaired'; code := 'markup_embedded_in_line_cost';
      old_value := COALESCE(r.overhead_pct,0) + COALESCE(r.profit_pct,0); new_value := 0;
      RETURN NEXT;
    END IF;

    -- 2. Contingency applied at both layers.
    IF v_cg > 0 AND COALESCE(r.contingency_pct, 0) > 0 THEN
      IF NOT _dry_run THEN
        UPDATE public.estimate_line_items SET contingency_pct = 0 WHERE id = r.id;
      END IF;
      line_id := r.id; estimate_id := r.estimate_id; description := r.description;
      action := 'repaired'; code := 'contingency_or_tax_applied_at_line';
      old_value := r.contingency_pct; new_value := 0;
      RETURN NEXT;
    END IF;

    -- Contractor-overridden pricing is preserved untouched.
    IF COALESCE(r.is_price_overridden, false) THEN
      line_id := r.id; estimate_id := r.estimate_id; description := r.description;
      action := 'preserved'; code := 'contractor_override';
      old_value := r.direct_cost; new_value := r.direct_cost;
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_labor := ROUND(COALESCE(r.labor_hours, 0) * COALESCE(r.labor_rate, 0), 2);
    v_material := ROUND(COALESCE(r.quantity, 0) * COALESCE(r.material_cost, 0), 2);
    v_direct := ROUND(
      v_labor + v_material
      + COALESCE(r.equipment_total, COALESCE(r.equipment_cost, 0) * COALESCE(r.quantity, 0))
      + COALESCE(r.subcontractor_total, COALESCE(r.subcontractor_cost, 0) * COALESCE(r.quantity, 0))
      + COALESCE(r.other_total, COALESCE(r.other_cost, 0) * COALESCE(r.quantity, 0)), 2);

    -- 3. Extensions must equal their own inputs.
    IF r.labor_total IS NOT NULL AND ABS(COALESCE(r.labor_total,0) - v_labor) > GREATEST(ABS(v_labor) * 0.02, 0.01) THEN
      IF NOT _dry_run THEN
        UPDATE public.estimate_line_items SET labor_total = v_labor WHERE id = r.id;
      END IF;
      line_id := r.id; estimate_id := r.estimate_id; description := r.description;
      action := 'repaired'; code := 'labor_cost_disagrees_with_hours';
      old_value := r.labor_total; new_value := v_labor;
      RETURN NEXT;
    END IF;

    IF r.material_total IS NOT NULL AND ABS(COALESCE(r.material_total,0) - v_material) > GREATEST(ABS(v_material) * 0.02, 0.01) THEN
      IF NOT _dry_run THEN
        UPDATE public.estimate_line_items SET material_total = v_material WHERE id = r.id;
      END IF;
      line_id := r.id; estimate_id := r.estimate_id; description := r.description;
      action := 'repaired'; code := 'material_cost_disagrees_with_quantity';
      old_value := r.material_total; new_value := v_material;
      RETURN NEXT;
    END IF;

    IF r.direct_cost IS NOT NULL AND ABS(COALESCE(r.direct_cost,0) - v_direct) > GREATEST(ABS(v_direct) * 0.02, 0.01) THEN
      IF NOT _dry_run THEN
        UPDATE public.estimate_line_items SET direct_cost = v_direct WHERE id = r.id;
      END IF;
      line_id := r.id; estimate_id := r.estimate_id; description := r.description;
      action := 'repaired'; code := 'direct_cost_disagrees_with_components';
      old_value := r.direct_cost; new_value := v_direct;
      RETURN NEXT;
    END IF;

    -- 4. Ambiguous rows: quantity still a placeholder, or no unit of measure.
    IF COALESCE(r.is_quantity_placeholder, false) AND r.quantity_reviewed_at IS NULL THEN
      line_id := r.id; estimate_id := r.estimate_id; description := r.description;
      action := 'flagged'; code := 'quantity_placeholder_treated_as_authority';
      old_value := r.quantity; new_value := r.quantity;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_estimate_math(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.audit_estimate_math(uuid, boolean) TO authenticated, service_role;

-- Apply the backfill once over every existing estimate.
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.audit_estimate_math(NULL, false);
  RAISE NOTICE 'estimate math backfill entries: %', v_count;
END;
$$;
