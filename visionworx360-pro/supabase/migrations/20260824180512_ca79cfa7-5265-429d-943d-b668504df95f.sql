CREATE OR REPLACE FUNCTION public.repair_quantity_evidence(_estimate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reset int := 0;
  v_flagged int := 0;
  v_allowance int := 0;
BEGIN
  -- System-derived quantities only: 'contractor_entered' / 'measurement' bases
  -- are the contractor's own numbers and are never touched.
  DROP TABLE IF EXISTS _rqe_cand;
  CREATE TEMP TABLE _rqe_cand ON COMMIT DROP AS
  SELECT li.id,
         public.geometry_surface_for_line(li.description, li.catalog_item_key, li.unit_key::text) AS surface,
         public.quantity_scope_kind(li.description, li.catalog_item_key) AS scope,
         public.assembly_allowance_eligible(li.catalog_item_key) AS allowance,
         coalesce(li.quantity, 0) AS qty
  FROM public.estimate_line_items li
  WHERE li.estimate_id = _estimate_id
    AND li.archived_at IS NULL
    AND public.is_measured_unit(li.unit_key::text)
    AND COALESCE(li.quantity_basis,'') IN ('geometry_derived','assumed');

  /*
    An assumed quantity on allowance-eligible work (custom casework, built-ins)
    is legitimate ballpark scope: the contractor needs a labelled allowance with
    a real number, not a silent zero. Keep the quantity, label it plainly, and
    let it price. Everything else still has to be measured first.
  */
  WITH allowance AS (
    UPDATE public.estimate_line_items li SET
      is_quantity_placeholder = false,
      quantity_is_assumed_default = true,
      quantity_basis = 'ballpark_allowance',
      quantity_basis_note =
        'Assumed quantity - ballpark allowance. Confirm the measurement on site before the detailed estimate.',
      quantity_basis_formula = jsonb_build_object(
        'basis', 'ballpark_allowance', 'quantity', li.quantity,
        'assembly', li.catalog_item_key, 'at', now())
    FROM _rqe_cand c
    WHERE li.id = c.id AND c.allowance AND c.qty > 0
    RETURNING 1
  )
  SELECT count(*) INTO v_allowance FROM allowance;

  WITH reset AS (
    UPDATE public.estimate_line_items li SET
      quantity = 1,
      is_quantity_placeholder = true,
      quantity_basis = 'needs_evidence',
      quantity_basis_note = CASE c.scope
        WHEN 'localized' THEN 'A repair or patch covers only part of a surface. Measure the affected area.'
        WHEN 'confined_area' THEN 'This area has its own dimensions. Measure it instead of using the room size.'
        ELSE 'No saved measurement matches this task yet.' END,
      quantity_basis_formula = jsonb_build_object('reset', 'needs_evidence', 'scope', c.scope, 'at', now()),
      quantity_source_measurement_id = NULL,
      quantity_reviewed_at = NULL,
      quantity_reviewed_by = NULL,
      labor_hours = 0,
      resolution_status = 'unresolved',
      unresolved_reason = 'quantity_unmeasured'
    FROM _rqe_cand c
    WHERE li.id = c.id AND c.surface IS NULL
      AND NOT (c.allowance AND c.qty > 0)
    RETURNING 1
  )
  SELECT count(*) INTO v_reset FROM reset;

  WITH flagged AS (
    UPDATE public.estimate_line_items li SET
      resolution_status = 'unresolved',
      unresolved_reason = COALESCE(NULLIF(li.unresolved_reason,''), 'quantity_unmeasured'),
      labor_hours = 0
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND public.is_measured_unit(li.unit_key::text)
      AND COALESCE(li.is_quantity_placeholder, false)
      AND COALESCE(li.quantity, 0) <= 1
      AND li.quantity_reviewed_at IS NULL
      AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual')
      AND li.resolution_status <> 'unresolved'
    RETURNING 1
  )
  SELECT count(*) INTO v_flagged FROM flagged;

  DROP TABLE IF EXISTS _rqe_cand;

  RETURN jsonb_build_object('reset', v_reset, 'flagged', v_flagged,
    'allowance', v_allowance);
END
$function$;
