-- Org-scoped guard: a signed-in caller may only repair their own estimates.
CREATE OR REPLACE FUNCTION public.repair_task_hours(_estimate_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.estimate_line_items%ROWTYPE;
  v_org uuid;
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
  IF auth.uid() IS NOT NULL THEN
    IF _estimate_id IS NULL THEN
      RAISE EXCEPTION 'estimate_id_required';
    END IF;
    SELECT organization_id INTO v_org FROM public.estimates WHERE id = _estimate_id;
    IF v_org IS NULL OR NOT public.is_org_member(v_org) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  FOR r IN
    SELECT * FROM public.estimate_line_items
     WHERE archived_at IS NULL
       AND (_estimate_id IS NULL OR estimate_id = _estimate_id)
     ORDER BY estimate_id, sort_order
  LOOP
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

REVOKE ALL ON FUNCTION public.repair_task_hours(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_task_hours(uuid) TO authenticated, service_role;
