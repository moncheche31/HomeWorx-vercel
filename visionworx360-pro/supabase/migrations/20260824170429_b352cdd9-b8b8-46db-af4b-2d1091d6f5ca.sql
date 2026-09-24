CREATE OR REPLACE FUNCTION public.infer_trade_key(_description text, _category text DEFAULT NULL)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  WITH t AS (SELECT lower(COALESCE(_description,'') || ' ' || COALESCE(_category,'')) AS s)
  SELECT CASE
    WHEN (SELECT s FROM t) ~ '\m(paint|painting|prime|priming|primer|stain|varnish|lacquer)\M' THEN 'painting'
    WHEN (SELECT s FROM t) ~ '\m(drywall|sheetrock|gypsum|tape|mud|skim)\M' THEN 'drywall'
    WHEN (SELECT s FROM t) ~ '\m(lvl|glulam|header|joist|rafter|stud|beam|framing|frame|blocking|sheathing|subfloor)\M' THEN 'framing'
    WHEN (SELECT s FROM t) ~ '\m(flooring|floor covering|lvp|laminate|hardwood|tile floor|carpet|underlayment)\M' THEN 'flooring'
    WHEN (SELECT s FROM t) ~ '\m(wire|wiring|circuit|outlet|receptacle|switch|panel|electrical|lighting|luminaire)\M' THEN 'electrical'
    WHEN (SELECT s FROM t) ~ '\m(pipe|piping|plumb|plumbing|drain|supply line|fixture|vanity|toilet|shower valve)\M' THEN 'plumbing'
    WHEN (SELECT s FROM t) ~ '\m(hvac|duct|ductwork|furnace|mini.?split|condenser|air handler)\M' THEN 'hvac'
    WHEN (SELECT s FROM t) ~ '\m(insulate|insulation|batt|blown|spray foam)\M' THEN 'insulation'
    WHEN (SELECT s FROM t) ~ '\m(cabinet|countertop|casework|millwork|bookcase|bookshelf|shelving|built.?in|trim carpentry|baseboard|casing|crown)\M' THEN 'finish_carpentry'
    WHEN (SELECT s FROM t) ~ '\m(roof|shingle|underlayment felt|flashing)\M' THEN 'roofing'
    WHEN (SELECT s FROM t) ~ '\m(demo|demolition|tear.?out|remove|removal)\M' THEN 'demolition'
    ELSE NULL
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.generic_unit_family(_unit text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT CASE lower(COALESCE(_unit,''))
    WHEN 'linear_foot' THEN 'linear'
    WHEN 'board_foot' THEN 'linear'
    WHEN 'square_foot' THEN 'area'
    WHEN 'sheet' THEN 'area'
    WHEN 'cubic_foot' THEN 'volume'
    WHEN 'cubic_yard' THEN 'volume'
    WHEN 'gallon' THEN 'volume'
    ELSE 'count' END;
$fn$;

CREATE OR REPLACE FUNCTION public.generic_trade_fallback_rate(_trade text, _unit text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  WITH f AS (SELECT public.generic_unit_family(_unit) AS fam),
  r(trade, fam, hrs, mat) AS (VALUES
    ('general_conditions','linear',0.05,1.0),('general_conditions','area',0.01,0.5),('general_conditions','volume',0.05,2.0),('general_conditions','count',1.0,25.0),
    ('demolition','linear',0.35,3.0),('demolition','area',0.05,1.0),('demolition','volume',0.2,2.0),('demolition','count',2.0,40.0),
    ('sitework_concrete','linear',0.5,18.0),('sitework_concrete','area',0.1,7.0),('sitework_concrete','volume',1.5,180.0),('sitework_concrete','count',3.0,120.0),
    ('framing','linear',0.5,22.0),('framing','area',0.06,4.0),('framing','volume',0.3,12.0),('framing','count',3.0,150.0),
    ('roofing','linear',0.2,9.0),('roofing','area',0.045,4.5),('roofing','volume',0.2,6.0),('roofing','count',2.0,90.0),
    ('exterior','linear',0.25,12.0),('exterior','area',0.05,6.0),('exterior','volume',0.2,8.0),('exterior','count',3.0,250.0),
    ('plumbing','linear',0.25,9.0),('plumbing','area',0.05,3.0),('plumbing','volume',0.2,5.0),('plumbing','count',2.5,180.0),
    ('electrical','linear',0.08,3.0),('electrical','area',0.03,1.5),('electrical','volume',0.1,2.0),('electrical','count',1.0,45.0),
    ('hvac','linear',0.15,10.0),('hvac','area',0.03,4.0),('hvac','volume',0.1,5.0),('hvac','count',2.5,220.0),
    ('insulation','linear',0.05,2.0),('insulation','area',0.02,1.5),('insulation','volume',0.05,2.0),('insulation','count',1.0,40.0),
    ('drywall','linear',0.12,2.5),('drywall','area',0.035,1.6),('drywall','volume',0.1,2.0),('drywall','count',1.5,45.0),
    ('finish_carpentry','linear',0.6,45.0),('finish_carpentry','area',0.12,14.0),('finish_carpentry','volume',0.3,20.0),('finish_carpentry','count',4.0,300.0),
    ('flooring','linear',0.1,5.0),('flooring','area',0.04,5.0),('flooring','volume',0.1,6.0),('flooring','count',1.5,60.0),
    ('tile','linear',0.2,8.0),('tile','area',0.12,9.0),('tile','volume',0.2,10.0),('tile','count',2.0,90.0),
    ('painting','linear',0.04,0.9),('painting','area',0.015,0.6),('painting','volume',0.05,1.0),('painting','count',1.0,30.0),
    ('specialty','linear',0.25,15.0),('specialty','area',0.06,8.0),('specialty','volume',0.2,10.0),('specialty','count',2.0,150.0)
  )
  SELECT jsonb_build_object('tradeKey', r.trade, 'unitFamily', r.fam,
                            'laborHoursPerUnit', r.hrs, 'materialCostPerUnit', r.mat)
  FROM r, f WHERE r.trade = lower(COALESCE(_trade,'')) AND r.fam = f.fam;
$fn$;

CREATE OR REPLACE FUNCTION public.price_unmatched_lines(_estimate_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rate numeric := 65;
  r RECORD; v_trade text; v_rule jsonb; v_amount numeric; v_priced int := 0; v_skipped int := 0;
BEGIN
  SELECT COALESCE(NULLIF(default_labor_rate,0), 65) INTO v_rate
  FROM public.estimates WHERE id = _estimate_id;

  FOR r IN
    SELECT * FROM public.estimate_line_items
    WHERE estimate_id = _estimate_id AND archived_at IS NULL
      AND resolution_status = 'unresolved'
      AND NOT COALESCE(is_price_overridden, false)
      AND COALESCE(pricing_source,'') NOT IN ('contractor','manual')
      AND NOT public.is_fee_basis(cost_basis)
  LOOP
    v_trade := CASE WHEN COALESCE(r.trade_key,'unassigned') <> 'unassigned' THEN r.trade_key
                    ELSE public.infer_trade_key(r.description, r.category_key) END;
    v_rule := public.generic_trade_fallback_rate(v_trade, r.unit_key::text);
    IF v_rule IS NULL OR COALESCE(r.quantity,0) <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_amount := public.money_round(
      public.round_quarter_hour((v_rule->>'laborHoursPerUnit')::numeric) * v_rate
      + (v_rule->>'materialCostPerUnit')::numeric);
    IF v_amount <= 0 THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    UPDATE public.estimate_line_items SET
      trade_key = COALESCE(NULLIF(trade_key,'unassigned'), v_trade),
      trade_source = COALESCE(trade_source, 'inferred'),
      cost_basis = 'allowance',
      cost_basis_source = 'generic_trade_fallback',
      labor_hours = 0, labor_hours_per_unit = 0, labor_hours_setup = 0,
      labor_convention = 'none',
      labor_hours_basis = 'allowance_no_separate_labor',
      labor_hours_formula = 'allowance includes labour and material',
      material_cost = 0, equipment_cost = 0, subcontractor_cost = 0,
      other_cost = v_amount,
      is_quantity_placeholder = false,
      quantity_basis = 'ballpark_allowance',
      quantity_basis_note = 'No catalog assembly covers this task yet. Priced from a generic '
        || v_trade || ' allowance rate - review before the detailed estimate.',
      pricing_source = 'generic_fallback',
      pricing_provenance = COALESCE(pricing_provenance,'{}'::jsonb) || jsonb_build_object(
        'genericTradeFallback', v_rule || jsonb_build_object(
          'laborRate', v_rate, 'allowancePerUnit', v_amount, 'appliedAt', now())),
      resolution_status = 'resolved', unresolved_reason = NULL,
      priced_at = now(), updated_at = now()
    WHERE id = r.id;
    v_priced := v_priced + 1;
  END LOOP;

  RETURN jsonb_build_object('priced', v_priced, 'stillUnpriced', v_skipped);
END $fn$;

REVOKE ALL ON FUNCTION public.price_unmatched_lines(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.price_unmatched_lines(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generic_trade_fallback_rate(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generic_unit_family(text) TO authenticated, service_role;
