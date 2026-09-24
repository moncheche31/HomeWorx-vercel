-- Labor rate with an explicit, already-resolved factor (no second location lookup).
CREATE OR REPLACE FUNCTION public.nce_labor_rate_factored(_craft_code text, _trade_key text, _labor_factor numeric)
RETURNS numeric LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_craft text; v_base numeric;
BEGIN
  SELECT craft INTO v_craft FROM public.nce_craft_codes
   WHERE code = upper(btrim(COALESCE(_craft_code, '')));
  IF v_craft IS NULL THEN v_craft := public.nce_craft_for_trade(_trade_key); END IF;

  SELECT total_hourly_cost INTO v_base
    FROM public.labor_wage_rates_nce2026 WHERE craft = v_craft LIMIT 1;
  IF v_base IS NULL THEN
    SELECT total_hourly_cost INTO v_base
      FROM public.labor_wage_rates_nce2026 WHERE craft = 'Carpenter' LIMIT 1;
  END IF;
  IF v_base IS NULL THEN RETURN NULL; END IF;

  RETURN round(v_base * COALESCE(NULLIF(_labor_factor, 0), 1), 2);
END $$;

REVOKE EXECUTE ON FUNCTION public.nce_labor_rate_factored(text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nce_labor_rate_factored(text, text, numeric) TO authenticated, service_role;

-- Labor pass: resolve the job site once, use its labor_pct only.
CREATE OR REPLACE FUNCTION public.apply_book_labor_rates(_estimate_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_est public.estimates%ROWTYPE;
  v_loc record;
  v_factor numeric;
  r record;
  v_craft_code text;
  v_craft text;
  v_rate numeric;
  v_updated integer := 0;
BEGIN
  SELECT * INTO v_est FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;

  SELECT * INTO v_loc FROM public.nce_estimate_location(_estimate_id);
  v_factor := 1 + COALESCE(v_loc.labor_pct, 0) / 100.0;

  UPDATE public.estimates e
     SET pricing_location = v_loc.location,
         pricing_location_source = v_loc.match_source,
         pricing_location_factors = jsonb_build_object(
           'materialPct', v_loc.material_pct,
           'laborPct', v_loc.labor_pct,
           'equipmentPct', v_loc.equipment_pct,
           'laborMultiplier', v_factor,
           'materialMultiplier', 1 + COALESCE(v_loc.material_pct, 0) / 100.0,
           'equipmentMultiplier', 1 + COALESCE(v_loc.equipment_pct, 0) / 100.0,
           'resolvedAt', now())
   WHERE e.id = _estimate_id;

  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.quantity, li.labor_hours_per_unit, li.labor_rate,
           li.trade_key, li.catalog_item_key,
           COALESCE(li.pricing_provenance->'bookPricing'->>'craftCode',
                    li.pricing_provenance->'bookSource'->>'craftCode') AS book_craft
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _estimate_id
       AND li.archived_at IS NULL
       AND li.rate_override_at IS NULL
       AND COALESCE(li.is_price_overridden, false) = false
       AND COALESCE(li.labor_hours, 0) > 0
  LOOP
    v_craft_code := NULLIF(btrim(COALESCE(r.book_craft, '')), '');

    IF v_craft_code IS NULL THEN
      SELECT ca.craft_code INTO v_craft_code
        FROM public.catalog_assemblies ca
       WHERE ca.assembly_key = r.catalog_item_key LIMIT 1;
    END IF;

    SELECT c.craft INTO v_craft FROM public.nce_craft_codes c
     WHERE c.code = upper(btrim(COALESCE(v_craft_code, '')));
    IF v_craft IS NULL THEN v_craft := public.nce_craft_for_trade(r.trade_key); END IF;

    v_rate := public.nce_labor_rate_factored(v_craft_code, r.trade_key, v_factor);
    CONTINUE WHEN v_rate IS NULL OR v_rate = r.labor_rate;

    UPDATE public.estimate_line_items li
       SET labor_rate = v_rate,
           labor_hours_formula = format(
             '%s x %s hr/unit at $%s/hr (NCE 2026 %s, %s labor factor %s)',
             r.quantity, COALESCE(r.labor_hours_per_unit, 0), v_rate, v_craft,
             v_loc.location, v_factor),
           pricing_provenance = COALESCE(li.pricing_provenance, '{}'::jsonb)
             || jsonb_build_object('laborRateBasis', jsonb_build_object(
                  'source', 'nce_2026_craft_wage',
                  'craftCode', v_craft_code,
                  'craft', v_craft,
                  'location', v_loc.location,
                  'locationSource', v_loc.match_source,
                  'areaFactor', v_factor,
                  'hourlyRate', v_rate,
                  'appliedAt', now())),
           priced_at = now()
     WHERE li.id = r.id;
    v_updated := v_updated + 1;
  END LOOP;

  PERFORM set_config('vw.kb_pricing', 'off', true);
  RETURN v_updated;
END $$;

-- Book line pricing: material_pct only, from the single resolution.
CREATE OR REPLACE FUNCTION public.apply_book_line_pricing(_estimate_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  r record; b record; v_scale numeric; v_craft text; v_hours numeric;
  v_mat numeric; v_hpu numeric; v_updated integer := 0;
  v_loc record; v_mat_factor numeric;
BEGIN
  SELECT * INTO v_loc FROM public.nce_estimate_location(_estimate_id);
  v_mat_factor := 1 + COALESCE(v_loc.material_pct, 0) / 100.0;

  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.quantity, li.unit_key::text AS unit_key, li.cost_basis,
           li.material_cost, li.labor_hours_per_unit,
           (li.pricing_provenance->'bookSource'->>'refId')::int AS ref_id
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _estimate_id
       AND li.archived_at IS NULL
       AND li.rate_override_at IS NULL
       AND COALESCE(li.is_price_overridden, false) = false
       AND li.cost_basis NOT IN ('permit_fee', 'allowance', 'other_direct_cost')
       AND li.pricing_provenance->'bookSource'->>'source' = 'cost_reference_nce2026'
  LOOP
    CONTINUE WHEN r.ref_id IS NULL;
    SELECT * INTO b FROM public.cost_reference_nce2026 WHERE id = r.ref_id;
    CONTINUE WHEN b IS NULL;

    v_scale := public.nce_unit_scale(b.unit, r.unit_key);
    CONTINUE WHEN v_scale IS NULL;

    SELECT p.craft_code, p.hours INTO v_craft, v_hours
      FROM public.nce_craft_hours_parts(b.craft_hours) p;

    v_mat := round(COALESCE(b.material, 0) * v_scale * v_mat_factor, 4);
    v_hpu := round(COALESCE(v_hours, 0) * v_scale, 6);
    CONTINUE WHEN v_mat <= 0 AND v_hpu <= 0;

    IF v_mat <= 0 THEN v_mat := COALESCE(r.material_cost, 0); END IF;
    IF v_hpu <= 0 THEN v_hpu := COALESCE(r.labor_hours_per_unit, 0); END IF;

    UPDATE public.estimate_line_items li
       SET material_cost = v_mat,
           labor_hours_per_unit = v_hpu,
           labor_hours = round(COALESCE(r.quantity, 0) * v_hpu, 4),
           labor_hours_basis = CASE WHEN v_hpu > 0 THEN 'catalog_production'
                                    ELSE li.labor_hours_basis END,
           labor_convention = CASE WHEN v_hpu > 0 THEN 'hours_per_unit'
                                   ELSE li.labor_convention END,
           cost_basis_source = 'nce_2026_book',
           pricing_source = 'nce_2026_book',
           resolution_status = 'resolved'::public.line_resolution_status,
           unresolved_reason = NULL,
           pricing_provenance = COALESCE(li.pricing_provenance, '{}'::jsonb)
             || jsonb_build_object('bookPricing', jsonb_build_object(
                  'referenceId', b.id, 'description', b.description,
                  'section', b.section, 'bookUnit', b.unit,
                  'unitScale', v_scale, 'bookMaterial', b.material,
                  'bookCraftHours', b.craft_hours, 'craftCode', v_craft,
                  'materialPerUnit', v_mat, 'hoursPerUnit', v_hpu,
                  'location', v_loc.location,
                  'locationSource', v_loc.match_source,
                  'materialFactor', v_mat_factor,
                  'appliedAt', now())),
           priced_at = now()
     WHERE li.id = r.id;
    v_updated := v_updated + 1;
  END LOOP;

  PERFORM set_config('vw.kb_pricing', 'off', true);
  RETURN v_updated;
END $$;

-- Equipment costs get the job site's equipment_pct, idempotently.
CREATE OR REPLACE FUNCTION public.apply_location_equipment_factor(_estimate_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_loc record; v_factor numeric; r record; v_prior numeric; v_base numeric;
  v_new numeric; v_updated integer := 0;
BEGIN
  SELECT * INTO v_loc FROM public.nce_estimate_location(_estimate_id);
  v_factor := 1 + COALESCE(v_loc.equipment_pct, 0) / 100.0;

  PERFORM set_config('vw.kb_pricing', 'on', true);

  FOR r IN
    SELECT li.id, li.equipment_cost,
           (li.pricing_provenance->'equipmentLocation'->>'factor')::numeric AS prior_factor
      FROM public.estimate_line_items li
     WHERE li.estimate_id = _estimate_id
       AND li.archived_at IS NULL
       AND li.rate_override_at IS NULL
       AND COALESCE(li.is_price_overridden, false) = false
       AND COALESCE(li.equipment_cost, 0) > 0
  LOOP
    v_prior := COALESCE(NULLIF(r.prior_factor, 0), 1);
    v_base := r.equipment_cost / v_prior;
    v_new := round(v_base * v_factor, 4);
    CONTINUE WHEN v_new = r.equipment_cost;

    UPDATE public.estimate_line_items li
       SET equipment_cost = v_new,
           pricing_provenance = COALESCE(li.pricing_provenance, '{}'::jsonb)
             || jsonb_build_object('equipmentLocation', jsonb_build_object(
                  'location', v_loc.location,
                  'locationSource', v_loc.match_source,
                  'factor', v_factor,
                  'baseCost', round(v_base, 4),
                  'appliedAt', now()))
     WHERE li.id = r.id;
    v_updated := v_updated + 1;
  END LOOP;

  PERFORM set_config('vw.kb_pricing', 'off', true);
  RETURN v_updated;
END $$;

REVOKE EXECUTE ON FUNCTION public.apply_location_equipment_factor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_location_equipment_factor(uuid) TO authenticated, service_role;
