CREATE OR REPLACE FUNCTION public.resync_estimate_scope_quantities(_estimate_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_updated int := 0; v_allow int := 0;
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

  /* Allowance-eligible work (custom casework, built-ins) legitimately carries an
     assumed quantity in ballpark scope. Adopt it as a labelled allowance so the
     task prices, instead of dropping to an unpriced placeholder of one. */
  WITH src2 AS (
    SELECT li.id, si.quantity AS qty, si.unit_key AS unit
    FROM public.estimate_line_items li
    JOIN public.scope_items si ON si.id = li.scope_item_id
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL AND si.archived_at IS NULL
      AND li.is_price_overridden = false
      AND coalesce(li.pricing_source, '') NOT IN ('contractor', 'manual')
      AND li.quantity_reviewed_at IS NULL
      AND coalesce(si.quantity, 0) > 0
      AND coalesce(si.quantity_basis, '') IN ('assumed','ballpark_allowance')
      AND public.assembly_allowance_eligible(li.catalog_item_key)
      AND (coalesce(li.is_quantity_placeholder, false)
           OR li.quantity IS DISTINCT FROM si.quantity)
  ), upd2 AS (
    UPDATE public.estimate_line_items li SET
      quantity = src2.qty,
      unit_key = src2.unit,
      quantity_basis = 'ballpark_allowance',
      quantity_basis_note =
        'Assumed quantity - ballpark allowance. Confirm the measurement on site before the detailed estimate.',
      is_quantity_placeholder = false,
      quantity_is_assumed_default = true,
      pricing_provenance = coalesce(li.pricing_provenance, '{}'::jsonb)
        || jsonb_build_object('quantity', jsonb_build_object(
             'source', 'ballpark_allowance', 'value', src2.qty, 'unit', src2.unit,
             'from', 'scope_item', 'syncedAt', now()))
    FROM src2 WHERE li.id = src2.id
    RETURNING 1
  )
  SELECT count(*) INTO v_allow FROM upd2;

  RETURN v_updated + v_allow;
END
$function$;
