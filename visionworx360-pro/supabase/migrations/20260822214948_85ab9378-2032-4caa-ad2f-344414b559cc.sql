CREATE OR REPLACE FUNCTION public.bind_unpriced_estimate_lines(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_rate numeric;
  v_bound int := 0;
  v_priced int := 0;
  v_flagged int := 0;
  v_preserved int := 0;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate_not_found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_e.organization_id) THEN
    RAISE EXCEPTION 'not_authorised' USING ERRCODE = '42501';
  END IF;
  v_rate := COALESCE(NULLIF(v_e.default_labor_rate,0), 65);

  SELECT count(*) INTO v_preserved FROM public.estimate_line_items
   WHERE estimate_id = _estimate_id AND archived_at IS NULL
     AND (is_price_overridden OR COALESCE(pricing_source,'') IN ('contractor','manual'));

  PERFORM set_config('vw.kb_pricing', 'on', true);

  WITH lib AS (SELECT * FROM public.kb_resolved_assemblies(v_e.organization_id)),
  target AS (
    SELECT li.*
    FROM public.estimate_line_items li
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.is_price_overridden = false
      AND COALESCE(li.pricing_source,'') NOT IN ('contractor','manual')
      AND NOT public.is_fee_basis(COALESCE(li.cost_basis,'labor_production'::public.task_cost_basis))
      AND COALESCE(li.labor_hours_per_unit,0) = 0
      AND (li.resolution_status = 'unresolved' OR COALESCE(li.pricing_source,'') = 'unmatched')
  ),
  best AS (
    SELECT t.id AS line_id, m.*
    FROM target t
    LEFT JOIN LATERAL (
      SELECT a.assembly_key, a.work_item, a.unit_key, a.trade_key, a.category_key,
             a.subcategory_key, a.cost_basis, a.default_overhead_pct, a.suggested_profit_pct,
             a.productivity_convention,
             public.assembly_hours_per_unit(a.productivity_convention,
               a.default_labor_hours, a.production_rate) AS hours_per_unit,
             COALESCE(a.setup_hours,0) AS setup_hours,
             round(COALESCE(a.material_allowance,0) * (1 + COALESCE(a.waste_factor,0)), 2) AS material_cost,
             public.kb_overlap(t.description, a.work_item) AS overlap,
             (public.kb_overlap(t.description, a.work_item)
              + CASE WHEN t.trade_key IS NOT NULL AND a.trade_key = t.trade_key THEN 0.15 ELSE 0 END
              + CASE WHEN t.unit_key IS NOT NULL AND a.unit_key = t.unit_key THEN 0.10 ELSE 0 END
              + CASE WHEN a.origin = 'organization' THEN 0.05 ELSE 0 END) AS score
      FROM lib a
      WHERE (t.unit_key IS NULL OR a.unit_key IS NULL OR a.unit_key = t.unit_key)
      ORDER BY score DESC, a.assembly_key ASC
      LIMIT 1
    ) m ON true
  ),
  bound AS (
    UPDATE public.estimate_line_items li SET
      unit_key = COALESCE(li.unit_key, b.unit_key),
      trade_key = COALESCE(li.trade_key, b.trade_key),
      category_key = COALESCE(li.category_key, b.category_key),
      subcategory_key = COALESCE(li.subcategory_key, b.subcategory_key),
      cost_basis = COALESCE(li.cost_basis, b.cost_basis),
      labor_hours_per_unit = b.hours_per_unit,
      labor_hours_setup = b.setup_hours,
      labor_hours_basis = 'catalog_production',
      labor_convention = 'hours_per_unit',
      labor_rate = CASE WHEN COALESCE(li.labor_rate,0) = 0 THEN v_rate ELSE li.labor_rate END,
      material_cost = CASE WHEN COALESCE(li.material_cost,0) = 0
                           THEN b.material_cost ELSE li.material_cost END,
      overhead_pct = CASE WHEN COALESCE(li.overhead_pct,0) = 0
                          THEN COALESCE(b.default_overhead_pct,0) ELSE li.overhead_pct END,
      profit_pct = CASE WHEN COALESCE(li.profit_pct,0) = 0
                        THEN COALESCE(b.suggested_profit_pct,0) ELSE li.profit_pct END,
      catalog_item_key = COALESCE(li.catalog_item_key, b.assembly_key),
      catalog_mapping_source = COALESCE(li.catalog_mapping_source, 'auto_low_confidence'),
      pricing_source = 'knowledge_base',
      priced_at = now(),
      pricing_provenance = li.pricing_provenance || jsonb_build_object(
        'boundAssemblyKey', b.assembly_key,
        'boundWorkItem', b.work_item,
        'boundBy', 'bind_unpriced_estimate_lines',
        'boundScore', round(b.score, 3),
        'boundOverlap', round(b.overlap, 3),
        'productivityConvention', b.productivity_convention,
        'laborHoursPerUnit', b.hours_per_unit,
        'setupHours', b.setup_hours,
        'boundAt', now())
    FROM best b
    WHERE li.id = b.line_id
      AND b.assembly_key IS NOT NULL
      AND b.hours_per_unit IS NOT NULL
      AND b.hours_per_unit > 0
      AND b.score >= 0.45
    RETURNING li.resolution_status
  )
  SELECT count(*), count(*) FILTER (WHERE resolution_status = 'resolved'),
         count(*) FILTER (WHERE resolution_status = 'unresolved')
    INTO v_bound, v_priced, v_flagged FROM bound;

  PERFORM set_config('vw.kb_pricing', 'off', true);

  RETURN jsonb_build_object(
    'bound', v_bound, 'priced', v_priced, 'flagged', v_flagged,
    'contractorPreserved', v_preserved);
END
$$;

REVOKE ALL ON FUNCTION public.bind_unpriced_estimate_lines(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bind_unpriced_estimate_lines(uuid) TO authenticated, service_role;
