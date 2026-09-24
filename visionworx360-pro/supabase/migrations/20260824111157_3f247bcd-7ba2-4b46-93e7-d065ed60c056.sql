
ALTER TABLE public.estimate_line_items DROP CONSTRAINT IF EXISTS eli_quantity_basis_chk;
ALTER TABLE public.estimate_line_items ADD CONSTRAINT eli_quantity_basis_chk
  CHECK (quantity_basis IS NULL OR quantity_basis = ANY (ARRAY[
    'measurement','geometry_derived','contractor_entered','assumed','catalog_default',
    'size_not_count','specific_measurement','needs_evidence',
    'ballpark_allowance','scope_stated_count','fee_scope']));

CREATE OR REPLACE FUNCTION public.repair_line_evidence_integrity(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project uuid;
  v_org uuid;
  v_partition numeric;
  v_ceiling_unconfirmed boolean := false;
  v_ceiling numeric;
  v_framed int := 0;
  v_assumed int := 0;
  v_touched int := 0;
BEGIN
  SELECT project_id, organization_id INTO v_project, v_org
    FROM public.estimates WHERE id = _estimate_id;
  IF v_project IS NULL THEN RETURN jsonb_build_object('error', 'estimate_not_found'); END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_org) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT coalesce(sum(interior_partition_lf), 0),
         bool_or(coalesce(unconfirmed_fields, '{}') @> ARRAY['ceiling_height_ft']),
         max(ceiling_height_ft)
    INTO v_partition, v_ceiling_unconfirmed, v_ceiling
    FROM public.project_measurements WHERE project_id = v_project;

  IF coalesce(v_partition, 0) > 0 THEN
    UPDATE public.estimate_line_items l
       SET quantity = v_partition,
           is_quantity_placeholder = false,
           quantity_basis = 'geometry_derived',
           quantity_basis_note = 'Interior partition run saved for this project: '
             || trim(to_char(v_partition, 'FM999990.99')) || ' LF.',
           quantity_basis_formula = jsonb_build_object('source', 'project_measurements.interior_partition_lf',
                                                       'value', v_partition)
     WHERE l.estimate_id = _estimate_id
       AND l.archived_at IS NULL
       AND l.unit_key::text = 'linear_foot'
       AND lower(coalesce(l.description, '')) ~ '\mframe\M.*\mwall'
       AND NOT coalesce(l.is_price_overridden, false)
       AND coalesce(l.pricing_source, '') NOT IN ('contractor', 'manual')
       AND coalesce(l.quantity_basis, '') <> 'measurement'
       AND l.quantity IS DISTINCT FROM v_partition;
    GET DIAGNOSTICS v_framed = ROW_COUNT;
  END IF;

  IF v_ceiling_unconfirmed THEN
    UPDATE public.estimate_line_items l
       SET quantity_basis = 'ballpark_allowance',
           quantity_basis_note = 'Depends on an unconfirmed ceiling height of '
             || trim(to_char(coalesce(v_ceiling, 0), 'FM999990D9')) || ' ft. Confirm on site.'
     WHERE l.estimate_id = _estimate_id
       AND l.archived_at IS NULL
       AND l.unit_key::text = 'square_foot'
       AND l.resolution_status::text = 'resolved'
       AND lower(coalesce(l.description, '')) ~ '(wall|ceiling)'
       AND coalesce(l.quantity_basis, '') NOT IN ('measurement', 'ballpark_allowance');
    GET DIAGNOSTICS v_assumed = ROW_COUNT;
  END IF;

  UPDATE public.estimate_line_items
     SET updated_at = now()
   WHERE estimate_id = _estimate_id AND archived_at IS NULL;
  GET DIAGNOSTICS v_touched = ROW_COUNT;

  RETURN jsonb_build_object('framingRebound', v_framed,
                            'ceilingAssumptions', v_assumed,
                            'linesRechecked', v_touched);
END
$$;

REVOKE EXECUTE ON FUNCTION public.repair_line_evidence_integrity(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.repair_line_evidence_integrity(uuid) TO authenticated, service_role;
