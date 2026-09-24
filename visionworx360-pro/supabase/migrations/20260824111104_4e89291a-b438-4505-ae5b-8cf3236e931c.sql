
CREATE OR REPLACE FUNCTION public.catalog_mapping_is_semantic(p_description text, p_key text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text := lower(coalesce(p_description, ''));
  k text := lower(coalesce(p_key, ''));
  pair text[];
  subjects text[][] := ARRAY[
    ARRAY['undercabinet', 'cabinet'],
    ARRAY['shower', 'shower'],
    ARRAY['niche', 'niche'],
    ARRAY['vanity', 'vanity|lavatory'],
    ARRAY['toilet', 'toilet|water closet|wc'],
    ARRAY['bathtub', 'tub|bath'],
    ARRAY['window', 'window'],
    ARRAY['driveway', 'driveway'],
    ARRAY['fence', 'fenc'],
    ARRAY['deck', 'deck'],
    ARRAY['stair', 'stair|step'],
    ARRAY['countertop', 'counter'],
    ARRAY['closet', 'closet'],
    ARRAY['roof', 'roof'],
    ARRAY['gutter', 'gutter|downspout'],
    ARRAY['siding', 'siding|clad']
  ];
BEGIN
  IF k = '' THEN RETURN true; END IF;
  FOREACH pair SLICE 1 IN ARRAY subjects LOOP
    IF position(pair[1] IN k) > 0 AND d !~ pair[2] THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION public.quantity_is_composite_scope(
  p_description text, p_unit text, p_quantity numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(p_unit, '') IN ('each', 'lump_sum')
     AND coalesce(p_quantity, 0) <= 1
     AND lower(coalesce(p_description, '')) !~ '[0-9]'
     AND lower(coalesce(p_description, '')) ~ '[a-z]{3,}s\M[ ,]+(and[ ]+)?[a-z]{3,}'
     AND lower(coalesce(p_description, '')) ~ '(,|\mand\M)';
$$;

CREATE OR REPLACE FUNCTION public.enforce_quantity_evidence_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_contractor boolean := coalesce(NEW.is_price_overridden, false)
                          OR coalesce(NEW.pricing_source, '') IN ('contractor', 'manual');
  v_fee boolean := public.is_fee_basis(NEW.cost_basis);
  v_confirmed boolean := NEW.catalog_confirmed_at IS NOT NULL;
  v_old_key text := NEW.catalog_item_key;
  v_allowed text[] := ARRAY['contractor_entered','measurement','geometry_derived',
                            'scope_stated_count','fee_scope','ballpark_allowance'];
BEGIN
  IF v_old_key IS NOT NULL AND NOT v_confirmed
     AND NOT public.catalog_mapping_is_semantic(NEW.description, v_old_key) THEN
    NEW.catalog_item_key := NULL;
    NEW.pricing_source := 'unmatched';
    NEW.pricing_provenance := coalesce(NEW.pricing_provenance, '{}'::jsonb)
      || jsonb_build_object('rejectedCatalogKey', v_old_key,
                            'rejectedReason', 'semantic_mismatch',
                            'rejectedAt', now());
    NEW.labor_hours_per_unit := 0;
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := 'no_catalog_match';
    NEW.quantity_basis := 'needs_evidence';
    NEW.quantity_basis_note :=
      'The catalog item matched to this task did not describe this work. The match was removed - needs review.';
  END IF;

  IF NOT v_fee
     AND public.quantity_is_composite_scope(NEW.description, NEW.unit_key::text, NEW.quantity) THEN
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := coalesce(nullif(NEW.unresolved_reason, ''), 'ambiguous_multi_scope');
    NEW.quantity_basis := 'needs_evidence';
    NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
      'This line bundles several components into one unit. Break it into counted components or price it as a labelled allowance.');
  END IF;

  IF NEW.resolution_status::text = 'unresolved' THEN
    IF coalesce(NEW.labor_hours, 0) <> 0 OR coalesce(NEW.material_cost, 0) <> 0
       OR coalesce(NEW.equipment_cost, 0) <> 0 OR coalesce(NEW.subcontractor_cost, 0) <> 0
       OR coalesce(NEW.other_cost, 0) <> 0 THEN
      NEW.pricing_provenance := coalesce(NEW.pricing_provenance, '{}'::jsonb)
        || jsonb_build_object('clearedOnUnresolved', jsonb_build_object(
             'laborHours', NEW.labor_hours,
             'materialCost', NEW.material_cost,
             'equipmentCost', NEW.equipment_cost,
             'subcontractorCost', NEW.subcontractor_cost,
             'otherCost', NEW.other_cost,
             'formula', NEW.labor_hours_formula,
             'at', now()));
    END IF;
    NEW.labor_hours := 0;
    NEW.material_cost := 0;
    NEW.equipment_cost := 0;
    NEW.subcontractor_cost := 0;
    NEW.other_cost := 0;
    NEW.labor_hours_formula := 'awaiting quantity - not priced';
    NEW.quantity_basis := coalesce(nullif(NEW.quantity_basis, ''), 'needs_evidence');
  ELSE
    IF coalesce(NEW.quantity_basis, '') <> ALL (v_allowed) THEN
      IF v_fee THEN
        NEW.quantity_basis := 'fee_scope';
        NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
          'Fee or permit line: one occurrence, no measured quantity.');
      ELSIF v_contractor THEN
        NEW.quantity_basis := 'contractor_entered';
        NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
          'Quantity entered or accepted by the contractor.');
      ELSIF lower(coalesce(NEW.description, '')) ~ '\m[0-9]+\M'
            AND coalesce(NEW.unit_key::text, '') = 'each' THEN
        NEW.quantity_basis := 'scope_stated_count';
        NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
          'Count stated in the scope wording.');
      ELSE
        NEW.quantity_basis := 'ballpark_allowance';
        NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
          'Assumed quantity - ballpark allowance. Confirm on site before the detailed estimate.');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS zzzz_quantity_evidence_integrity ON public.estimate_line_items;
CREATE TRIGGER zzzz_quantity_evidence_integrity
BEFORE INSERT OR UPDATE ON public.estimate_line_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_quantity_evidence_integrity();

CREATE OR REPLACE FUNCTION public.repair_line_evidence_integrity(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project uuid;
  v_partition numeric;
  v_ceiling_unconfirmed boolean := false;
  v_ceiling numeric;
  v_framed int := 0;
  v_assumed int := 0;
  v_touched int := 0;
BEGIN
  SELECT project_id INTO v_project FROM public.estimates WHERE id = _estimate_id;
  IF v_project IS NULL THEN RETURN jsonb_build_object('error', 'estimate_not_found'); END IF;

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
             || trim(to_char(coalesce(v_ceiling, 0), 'FM999990.9')) || ' ft. Confirm on site.'
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

GRANT EXECUTE ON FUNCTION public.repair_line_evidence_integrity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_mapping_is_semantic(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quantity_is_composite_scope(text, text, numeric) TO authenticated, service_role;
