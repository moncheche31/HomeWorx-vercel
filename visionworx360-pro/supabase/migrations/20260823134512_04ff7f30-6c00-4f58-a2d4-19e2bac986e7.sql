-- Evidence-first quantity engine: semantic scope gate + universal repair.

CREATE OR REPLACE FUNCTION public.quantity_scope_kind(_description text, _catalog_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH t AS (SELECT lower(COALESCE(_description,'') || ' ' || COALESCE(_catalog_key,'')) AS s)
  SELECT CASE
    WHEN (SELECT s FROM t) ~ 'repair|patch|patching|blend|touch[- ]?up|touchup|spot |small area|as[- ]needed|where damaged|damaged area|make[- ]good'
      THEN 'localized'
    WHEN (SELECT s FROM t) ~ 'shower|tub surround|tub/shower|backsplash|niche|wainscot|shower pan|curb|steam room|sauna'
      THEN 'confined_area'
    ELSE 'whole_surface'
  END;
$function$;

-- No generic fallback: a line with no semantically matching surface returns
-- NULL, which means "ask the contractor", never "use the floor area".
CREATE OR REPLACE FUNCTION public.geometry_surface_for_line(_description text, _catalog_key text, _unit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH t AS (SELECT lower(COALESCE(_description,'') || ' ' || COALESCE(_catalog_key,'')) AS s)
  SELECT CASE
    WHEN public.quantity_scope_kind(_description, _catalog_key) <> 'whole_surface' THEN NULL
    WHEN _unit = 'linear_foot' AND (SELECT s FROM t) ~ 'partition|interior wall|nonbearing|non-bearing|demo\.wall|wall\.interior' THEN 'partitionLf'
    WHEN _unit = 'linear_foot' AND (SELECT s FROM t) ~ 'baseboard|base trim|casing|crown|trim' THEN 'trimLf'
    WHEN _unit = 'linear_foot' AND (SELECT s FROM t) ~ 'lvl|beam|header|girder|ridge|glulam' THEN 'structuralSpanLf'
    WHEN _unit = 'linear_foot' THEN NULL
    WHEN _unit = 'square_foot' AND (SELECT s FROM t) ~ 'ceiling' THEN 'ceilingArea'
    WHEN _unit = 'square_foot' AND (SELECT s FROM t) ~ 'floor|subfloor|underlayment|slab|carpet|lvp|laminate|hardwood'
      THEN CASE WHEN (SELECT s FROM t) ~ 'prep|level|underlayment|subfloor|slab' THEN 'floorArea' ELSE 'floorAreaWithWaste' END
    WHEN _unit = 'square_foot' AND (SELECT s FROM t) ~ 'wall|drywall|paint|insulat|furring|sheathing' THEN 'wallArea'
    ELSE NULL
  END;
$function$;

-- Repair: drop system-derived quantities that no longer pass the semantic gate.
-- Contractor authority (reviewed, overridden, contractor/manual pricing) is
-- never touched.
CREATE OR REPLACE FUNCTION public.repair_quantity_evidence(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reset int := 0;
  v_flagged int := 0;
BEGIN
  WITH cand AS (
    SELECT li.id,
           public.geometry_surface_for_line(li.description, li.catalog_item_key, li.unit_key::text) AS surface,
           public.quantity_scope_kind(li.description, li.catalog_item_key) AS scope
    FROM public.estimate_line_items li
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.is_price_overridden = false
      AND li.quantity_reviewed_at IS NULL
      AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual')
      AND public.is_measured_unit(li.unit_key::text)
      AND COALESCE(li.quantity_basis,'') IN ('geometry_derived','assumed')
  ),
  reset AS (
    UPDATE public.estimate_line_items li SET
      quantity = 1,
      is_quantity_placeholder = true,
      quantity_basis = 'needs_evidence',
      quantity_basis_note = CASE c.scope
        WHEN 'localized' THEN 'A repair or patch covers only part of a surface. Measure the affected area.'
        WHEN 'confined_area' THEN 'This area has its own dimensions. Measure it instead of using the room size.'
        ELSE 'No saved measurement matches this task yet.' END,
      quantity_basis_formula = NULL,
      quantity_source_measurement_id = NULL,
      labor_hours = 0,
      resolution_status = 'unresolved',
      unresolved_reason = 'quantity_unmeasured'
    FROM cand c
    WHERE li.id = c.id AND c.surface IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_reset FROM reset;

  -- Anything still carrying a measured unit with a bare placeholder quantity is
  -- surfaced for review rather than priced as if it were known.
  WITH flagged AS (
    UPDATE public.estimate_line_items li SET
      resolution_status = 'unresolved',
      unresolved_reason = COALESCE(NULLIF(li.unresolved_reason,''), 'quantity_unmeasured'),
      labor_hours = 0
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.is_price_overridden = false
      AND li.quantity_reviewed_at IS NULL
      AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual')
      AND public.is_measured_unit(li.unit_key::text)
      AND COALESCE(li.is_quantity_placeholder, false)
      AND COALESCE(li.quantity, 0) <= 1
      AND li.resolution_status <> 'unresolved'
    RETURNING 1
  )
  SELECT count(*) INTO v_flagged FROM flagged;

  RETURN jsonb_build_object('reset', v_reset, 'flagged', v_flagged);
END
$function$;

-- Also flag, rather than guess, inside the derivation pass.
CREATE OR REPLACE FUNCTION public.derive_geometry_quantities(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_est public.estimates%ROWTYPE;
  v_geo jsonb;
  v_measurement uuid;
  v_updated int := 0;
  v_assumed int := 0;
  v_unresolved int := 0;
BEGIN
  SELECT * INTO v_est FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found' USING ERRCODE = '42501'; END IF;
  v_geo := public.project_geometry_basis(v_est.project_id);
  SELECT pm.id INTO v_measurement FROM public.project_measurements pm
   WHERE pm.project_id = v_est.project_id LIMIT 1;

  WITH candidate AS (
    SELECT li.id,
           public.geometry_surface_for_line(li.description, li.catalog_item_key, li.unit_key::text) AS surface
    FROM public.estimate_line_items li
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.is_price_overridden = false
      AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual','unmatched')
      AND li.quantity_reviewed_at IS NULL
      AND public.is_measured_unit(li.unit_key::text)
      AND COALESCE(li.is_quantity_placeholder, false)
      AND COALESCE(li.quantity, 0) <= 1
  ),
  applied AS (
    UPDATE public.estimate_line_items li SET
      quantity = round((v_geo->>c.surface)::numeric, 2),
      is_quantity_placeholder = false,
      quantity_basis = public.geometry_basis_kind(c.surface),
      quantity_source_measurement_id = v_measurement,
      quantity_basis_note = CASE
        WHEN c.surface = 'structuralSpanLf'
          THEN 'Assumed from the widest measured room span (' || (v_geo->>c.surface) || ' ft). Confirm the engineered length.'
        ELSE 'Derived from saved project measurements (' || c.surface || ')' END,
      quantity_basis_formula = jsonb_build_object('surface', c.surface, 'geometry', v_geo),
      pricing_provenance = COALESCE(li.pricing_provenance,'{}'::jsonb)
        || jsonb_build_object('quantity', jsonb_build_object(
             'source', public.geometry_basis_kind(c.surface), 'surface', c.surface,
             'value',(v_geo->>c.surface)::numeric,'derivedAt', now()))
    FROM candidate c
    WHERE li.id = c.id
      AND c.surface IS NOT NULL
      AND COALESCE((v_geo->>c.surface)::numeric, 0) > 0
    RETURNING li.quantity_basis)
  SELECT count(*), count(*) FILTER (WHERE quantity_basis = 'assumed')
    INTO v_updated, v_assumed FROM applied;

  -- No semantically valid surface: say so instead of borrowing one.
  WITH candidate AS (
    SELECT li.id,
           public.geometry_surface_for_line(li.description, li.catalog_item_key, li.unit_key::text) AS surface,
           public.quantity_scope_kind(li.description, li.catalog_item_key) AS scope
    FROM public.estimate_line_items li
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.is_price_overridden = false
      AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual')
      AND li.quantity_reviewed_at IS NULL
      AND public.is_measured_unit(li.unit_key::text)
      AND COALESCE(li.is_quantity_placeholder, false)
      AND COALESCE(li.quantity, 0) <= 1
  ),
  gated AS (
    UPDATE public.estimate_line_items li SET
      quantity_basis = 'needs_evidence',
      quantity_basis_note = CASE c.scope
        WHEN 'localized' THEN 'A repair or patch covers only part of a surface. Measure the affected area.'
        WHEN 'confined_area' THEN 'This area has its own dimensions. Measure it instead of using the room size.'
        ELSE 'No saved measurement matches this task yet.' END,
      labor_hours = 0,
      resolution_status = 'unresolved',
      unresolved_reason = 'quantity_unmeasured'
    FROM candidate c
    WHERE li.id = c.id AND c.surface IS NULL
    RETURNING 1)
  SELECT count(*) INTO v_unresolved FROM gated;

  RETURN jsonb_build_object('updated', v_updated, 'assumed', v_assumed,
                            'unresolved', v_unresolved, 'geometry', v_geo);
END
$function$;
