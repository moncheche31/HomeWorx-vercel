-- 1) Company default pricing: 40% target gross margin -------------------------
ALTER TABLE public.organizations
  ALTER COLUMN default_pricing_method SET DEFAULT 'target_gross_margin',
  ALTER COLUMN default_target_gross_margin_pct SET DEFAULT 40;

-- 2) Trade inference in the write path ----------------------------------------
CREATE OR REPLACE FUNCTION public.infer_trade_key(_description text, _category text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH t AS (SELECT lower(COALESCE(_description,'') || ' ' || COALESCE(_category,'')) AS s)
  SELECT CASE
    -- Action verbs first: what the crew physically does decides the trade.
    WHEN (SELECT s FROM t) ~ '\m(paint|painting|prime|priming|primer|stain|varnish|lacquer)\M' THEN 'painting'
    WHEN (SELECT s FROM t) ~ '\m(drywall|sheetrock|gypsum|tape|mud|skim)\M' THEN 'drywall'
    WHEN (SELECT s FROM t) ~ '\m(lvl|glulam|header|joist|rafter|stud|beam|framing|frame|blocking|sheathing|subfloor)\M' THEN 'framing'
    WHEN (SELECT s FROM t) ~ '\m(flooring|floor covering|lvp|laminate|hardwood|tile floor|carpet|underlayment)\M' THEN 'flooring'
    WHEN (SELECT s FROM t) ~ '\m(wire|wiring|circuit|outlet|receptacle|switch|panel|electrical|lighting|luminaire)\M' THEN 'electrical'
    WHEN (SELECT s FROM t) ~ '\m(pipe|piping|plumb|plumbing|drain|supply line|fixture|vanity|toilet|shower valve)\M' THEN 'plumbing'
    WHEN (SELECT s FROM t) ~ '\m(hvac|duct|ductwork|furnace|mini.?split|condenser|air handler)\M' THEN 'hvac'
    WHEN (SELECT s FROM t) ~ '\m(insulate|insulation|batt|blown|spray foam)\M' THEN 'insulation'
    WHEN (SELECT s FROM t) ~ '\m(cabinet|countertop|casework|millwork|trim carpentry|baseboard|casing|crown)\M' THEN 'carpentry'
    WHEN (SELECT s FROM t) ~ '\m(roof|shingle|underlayment felt|flashing)\M' THEN 'roofing'
    WHEN (SELECT s FROM t) ~ '\m(demo|demolition|tear.?out|remove)\M' THEN 'demolition'
    ELSE NULL
  END;
$$;

-- 3) Structural span so beams/headers get a real length -----------------------
CREATE OR REPLACE FUNCTION public.project_geometry_basis(_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH m AS (
    SELECT COALESCE(sum(pm.length_ft * pm.width_ft), 0) AS floor_area,
           COALESCE(sum(2 * (pm.length_ft + pm.width_ft)), 0) AS perimeter,
           COALESCE(sum(2 * (pm.length_ft + pm.width_ft) * COALESCE(pm.ceiling_height_ft, 8)), 0) AS gross_wall,
           COALESCE(sum(pm.interior_partition_lf), 0) AS partition_lf,
           COALESCE(max(pm.floor_waste_pct), 10) AS waste_pct,
           -- Widest single room span: what a beam or header has to carry.
           COALESCE(max(LEAST(pm.length_ft, pm.width_ft)), 0) AS span_lf,
           COALESCE(sum((
             SELECT COALESCE(sum(COALESCE((o->>'count')::numeric,1)
                                 * COALESCE((o->>'widthFt')::numeric,0)
                                 * COALESCE((o->>'heightFt')::numeric,0)), 0)
             FROM jsonb_array_elements(pm.openings) o)), 0) AS opening_area,
           COALESCE(sum((
             SELECT COALESCE(sum(COALESCE((o->>'count')::numeric,1)
                                 * COALESCE((o->>'widthFt')::numeric,0)), 0)
             FROM jsonb_array_elements(pm.openings) o
             WHERE COALESCE((o->>'interruptsTrim')::boolean, false))), 0) AS trim_gaps
    FROM public.project_measurements pm
    WHERE pm.project_id = _project_id
  )
  SELECT jsonb_build_object(
    'floorArea', round(floor_area, 2),
    'ceilingArea', round(floor_area, 2),
    'floorAreaWithWaste', round(floor_area * (1 + waste_pct / 100.0), 2),
    'wallArea', round(GREATEST(gross_wall - opening_area, 0), 2),
    'perimeter', round(perimeter, 2),
    'trimLf', round(GREATEST(perimeter - trim_gaps, 0), 2),
    'partitionLf', round(partition_lf, 2),
    'structuralSpanLf', round(span_lf, 2),
    'wastePct', waste_pct)
  FROM m;
$$;

CREATE OR REPLACE FUNCTION public.geometry_surface_for_line(_description text, _catalog_key text, _unit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH t AS (SELECT lower(COALESCE(_description,'') || ' ' || COALESCE(_catalog_key,'')) AS s)
  SELECT CASE
    WHEN _unit = 'linear_foot' AND (SELECT s FROM t) ~ 'partition|interior wall|nonbearing|non-bearing|demo\.wall|wall\.interior' THEN 'partitionLf'
    WHEN _unit = 'linear_foot' AND (SELECT s FROM t) ~ 'baseboard|base trim|casing|crown|trim' THEN 'trimLf'
    WHEN _unit = 'linear_foot' AND (SELECT s FROM t) ~ 'lvl|beam|header|girder|ridge|glulam' THEN 'structuralSpanLf'
    WHEN _unit = 'linear_foot' THEN NULL
    WHEN _unit = 'square_foot' AND (SELECT s FROM t) ~ 'ceiling' THEN 'ceilingArea'
    WHEN _unit = 'square_foot' AND (SELECT s FROM t) ~ 'floor|subfloor|underlayment|slab|carpet|lvp|laminate' THEN 'floorAreaWithWaste'
    WHEN _unit = 'square_foot' AND (SELECT s FROM t) ~ 'wall|drywall|paint|insulat|furring|sheathing' THEN 'wallArea'
    WHEN _unit = 'square_foot' THEN 'floorArea'
    ELSE NULL
  END;
$$;

-- Structural spans are an engineered assumption, not a measured take-off.
CREATE OR REPLACE FUNCTION public.geometry_basis_kind(_surface text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT CASE WHEN _surface = 'structuralSpanLf' THEN 'assumed' ELSE 'geometry_derived' END $$;

CREATE OR REPLACE FUNCTION public.derive_geometry_quantities(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_est public.estimates%ROWTYPE;
  v_geo jsonb;
  v_measurement uuid;
  v_updated int := 0;
  v_assumed int := 0;
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
      AND li.pricing_source IS NOT NULL
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

  RETURN jsonb_build_object('updated', v_updated, 'assumed', v_assumed, 'geometry', v_geo);
END $$;

-- 4) Trade + unit correction on the authoritative write gate -------------------
CREATE OR REPLACE FUNCTION public.enforce_estimate_line_cost_basis()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_contractor boolean := COALESCE(NEW.is_price_overridden, false)
                          OR COALESCE(NEW.pricing_source,'') IN ('contractor','manual');
  v_authored boolean := COALESCE(NEW.labor_hours_basis,'') IN ('contractor_entered','contractor_confirmed')
                        OR NEW.labor_hours_confirmed_at IS NOT NULL;
  v_qty_owned boolean := NEW.quantity_reviewed_at IS NOT NULL
                         OR COALESCE(NEW.quantity_basis,'') IN ('contractor_entered','measurement','geometry_derived');
  v_low_confidence boolean := COALESCE(NEW.pricing_provenance->>'bindConfidence','') = 'low'
                              AND NEW.catalog_confirmed_at IS NULL;
  v_trade_owned boolean := COALESCE(NEW.trade_source,'') IN ('contractor','manual');
  v_inferred_trade text;
  v_basis public.task_cost_basis;
  v_qty numeric := COALESCE(NEW.quantity, 0);
  v_unmeasured boolean;
  v_setup numeric := COALESCE(NEW.labor_hours_setup, 0);
BEGIN
  v_basis := COALESCE(NEW.cost_basis,
               public.infer_cost_basis(NEW.description, NEW.category_key, NEW.unit_key::text));
  NEW.cost_basis := v_basis;
  NEW.cost_basis_source := COALESCE(NEW.cost_basis_source,
                             CASE WHEN v_contractor THEN 'contractor' ELSE 'inferred' END);

  -- Trade follows the words used, unless the contractor picked one.
  IF NOT v_trade_owned THEN
    v_inferred_trade := public.infer_trade_key(NEW.description, NEW.category_key::text);
    IF v_inferred_trade IS NOT NULL AND v_inferred_trade IS DISTINCT FROM NEW.trade_key THEN
      NEW.trade_key := v_inferred_trade;
      NEW.trade_source := COALESCE(NEW.trade_source, 'inferred');
    END IF;
  END IF;

  -- Trim work is measured by length, never by area.
  IF NOT v_contractor AND NEW.unit_key::text = 'square_foot'
     AND lower(COALESCE(NEW.description,'')) ~ '\m(trim|baseboard|casing|crown|handrail)\M' THEN
    NEW.unit_key := 'linear_foot';
    NEW.is_quantity_placeholder := true;
  END IF;

  IF NOT v_contractor AND NOT v_qty_owned
     AND public.quantity_is_size_not_count(NEW.description, v_qty, NEW.unit_key::text) THEN
    NEW.quantity_basis := 'size_not_count';
    NEW.quantity_basis_note := COALESCE(NEW.quantity_basis_note,
      'Quantity ' || trim(to_char(v_qty,'FM999999')) ||
      ' looked like a size in the description, not a count. Reset to 1 - confirm the real count.');
    NEW.quantity := 1;
    NEW.is_quantity_placeholder := true;
    v_qty := 1;
  END IF;

  IF public.is_fee_basis(v_basis) AND NOT v_contractor THEN
    IF COALESCE(NEW.material_cost,0) > 0 AND COALESCE(NEW.other_cost,0) = 0 THEN
      NEW.other_cost := NEW.material_cost;
      NEW.material_cost := 0;
    END IF;
    NEW.labor_hours := 0;
    NEW.labor_hours_per_unit := 0;
    NEW.labor_hours_setup := 0;
    NEW.labor_hours_basis := 'fee_no_labor';
    NEW.labor_convention := 'none';
    NEW.labor_hours_formula := 'fee - no labor by cost basis';
    IF NEW.unit_key IS NULL OR NEW.unit_key::text NOT IN ('each','lump_sum','allowance','other') THEN
      NEW.unit_key := public.default_unit_for_basis(v_basis);
    END IF;
    IF v_qty <= 0 THEN NEW.quantity := 1; v_qty := 1; END IF;
    NEW.is_quantity_placeholder := false;
    v_setup := 0;
  END IF;

  v_unmeasured := public.is_measured_unit(NEW.unit_key::text)
                  AND COALESCE(NEW.is_quantity_placeholder, false)
                  AND v_qty <= 1;

  IF NOT v_contractor AND public.is_labor_bearing_basis(v_basis) THEN
    IF v_unmeasured THEN
      NEW.labor_hours := 0;
      NEW.labor_convention := 'hours_per_unit';
      NEW.labor_hours_formula := 'awaiting measured quantity';
    ELSIF COALESCE(NEW.labor_hours_per_unit,0) > 0 THEN
      NEW.labor_hours := round(v_setup + v_qty * NEW.labor_hours_per_unit, 4);
      NEW.labor_convention := 'hours_per_unit';
      NEW.labor_hours_formula := CASE WHEN v_setup > 0
        THEN v_setup || ' hr setup + ' || v_qty || ' x ' || NEW.labor_hours_per_unit || ' hr/unit'
        ELSE v_qty || ' x ' || NEW.labor_hours_per_unit || ' hr/unit' END;
    ELSIF v_authored AND COALESCE(NEW.labor_hours,0) > 0 THEN
      NEW.labor_convention := 'total_hours';
      NEW.labor_hours_formula := COALESCE(NEW.labor_hours_formula, 'contractor-entered total hours');
    ELSE
      NEW.labor_hours := 0;
      NEW.labor_convention := 'unresolved';
      NEW.labor_hours_formula := 'no productivity rate';
    END IF;
  END IF;

  IF v_contractor THEN
    NEW.resolution_status := 'resolved'; NEW.unresolved_reason := NULL;
  ELSIF NEW.pricing_source IS NULL OR NEW.pricing_source = 'unmatched' THEN
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := COALESCE(NULLIF(NEW.unresolved_reason,''), 'no_catalog_match');
  ELSIF v_unmeasured THEN
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := CASE WHEN COALESCE(NEW.labor_hours_per_unit,0) > 0
                                  THEN 'quantity_required' ELSE 'quantity_unmeasured' END;
  ELSIF COALESCE(NEW.is_quantity_placeholder,false)
        AND COALESCE(NEW.quantity_basis,'') = 'size_not_count' THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'count_required';
  ELSIF v_low_confidence THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'catalog_match_unconfirmed';
  ELSIF public.is_labor_bearing_basis(v_basis)
        AND COALESCE(NEW.labor_hours,0) = 0 AND COALESCE(NEW.labor_hours_per_unit,0) = 0 THEN
    NEW.resolution_status := 'unresolved'; NEW.unresolved_reason := 'no_productivity_rate';
  ELSE
    NEW.resolution_status := 'resolved'; NEW.unresolved_reason := NULL;
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.project_geometry_basis(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.project_geometry_basis(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.derive_geometry_quantities(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.derive_geometry_quantities(uuid) TO authenticated, service_role;
