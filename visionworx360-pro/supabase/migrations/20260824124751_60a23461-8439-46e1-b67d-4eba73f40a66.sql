-- ============================================================
-- Contractor Cost Book / rate transparency + override system
-- ============================================================

-- 1. Company cost book: extra override fields -----------------
ALTER TABLE public.org_assembly_overrides
  ADD COLUMN IF NOT EXISTS min_task_hours numeric,
  ADD COLUMN IF NOT EXISTS equipment_cost numeric,
  ADD COLUMN IF NOT EXISTS other_cost numeric,
  ADD COLUMN IF NOT EXISTS direct_unit_cost numeric,
  ADD COLUMN IF NOT EXISTS rate_note text,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS source_version text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_assembly_overrides TO authenticated;
GRANT ALL ON public.org_assembly_overrides TO service_role;

DROP POLICY IF EXISTS "org overrides updatable" ON public.org_assembly_overrides;
CREATE POLICY "org overrides updatable" ON public.org_assembly_overrides
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "org overrides deletable" ON public.org_assembly_overrides;
CREATE POLICY "org overrides deletable" ON public.org_assembly_overrides
  FOR DELETE TO authenticated
  USING (public.is_org_member(organization_id));

-- 2. Company cost book audit history --------------------------
CREATE TABLE IF NOT EXISTS public.org_assembly_override_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assembly_key text NOT NULL,
  action text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  changed_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.org_assembly_override_history TO authenticated;
GRANT ALL ON public.org_assembly_override_history TO service_role;

ALTER TABLE public.org_assembly_override_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cost book history readable" ON public.org_assembly_override_history;
CREATE POLICY "cost book history readable" ON public.org_assembly_override_history
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "cost book history insertable" ON public.org_assembly_override_history;
CREATE POLICY "cost book history insertable" ON public.org_assembly_override_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS org_override_history_idx
  ON public.org_assembly_override_history (organization_id, assembly_key, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_org_assembly_override_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.org_assembly_override_history
      (organization_id, assembly_key, action, previous_values, new_values)
    VALUES (OLD.organization_id, OLD.assembly_key, 'reset_to_baseline', to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;

  INSERT INTO public.org_assembly_override_history
    (organization_id, assembly_key, action, previous_values, new_values)
  VALUES (NEW.organization_id, NEW.assembly_key,
          CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
          to_jsonb(NEW));
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS org_override_history ON public.org_assembly_overrides;
CREATE TRIGGER org_override_history
AFTER INSERT OR UPDATE OR DELETE ON public.org_assembly_overrides
FOR EACH ROW EXECUTE FUNCTION public.log_org_assembly_override_change();

-- 3. Per-estimate (project) line overrides + basis trace ------
ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS rate_override_hours_per_unit numeric,
  ADD COLUMN IF NOT EXISTS rate_override_setup_hours numeric,
  ADD COLUMN IF NOT EXISTS rate_override_labor_rate numeric,
  ADD COLUMN IF NOT EXISTS rate_override_material_unit_cost numeric,
  ADD COLUMN IF NOT EXISTS rate_override_equipment_cost numeric,
  ADD COLUMN IF NOT EXISTS rate_override_other_cost numeric,
  ADD COLUMN IF NOT EXISTS rate_override_note text,
  ADD COLUMN IF NOT EXISTS rate_override_by uuid,
  ADD COLUMN IF NOT EXISTS rate_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS pricing_basis jsonb,
  ADD COLUMN IF NOT EXISTS cost_book_applied_at timestamptz;

-- 4. Baseline vs company comparison for the Cost Book UI ------
CREATE OR REPLACE FUNCTION public.cost_book_entry(_org uuid, _assembly_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v AS (SELECT version FROM public.catalog_library_versions WHERE is_current LIMIT 1),
  base AS (
    SELECT a.* FROM public.catalog_assemblies a JOIN v ON v.version = a.library_version
    WHERE a.assembly_key = _assembly_key
    LIMIT 1
  ),
  ov AS (
    SELECT o.* FROM public.org_assembly_overrides o
    WHERE o.organization_id = _org AND o.assembly_key = _assembly_key
      AND o.archived_at IS NULL
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'assemblyKey', _assembly_key,
    'workItem', COALESCE((SELECT work_item FROM ov), (SELECT work_item FROM base)),
    'tradeKey', (SELECT trade_key FROM base),
    'categoryKey', (SELECT category_key FROM base),
    'unitKey', COALESCE((SELECT unit_key FROM ov), (SELECT unit_key FROM base))::text,
    'costBasis', COALESCE((SELECT cost_basis FROM ov), (SELECT cost_basis FROM base))::text,
    'catalogVersion', (SELECT version FROM v),
    'sourceVersion', (SELECT source_version FROM base),
    'baseline', (SELECT jsonb_build_object(
        'productivityConvention', b.productivity_convention,
        'defaultLaborHours', b.default_labor_hours,
        'productionRate', b.production_rate,
        'hoursPerUnit', public.assembly_hours_per_unit(b.productivity_convention,
                          b.default_labor_hours, b.production_rate),
        'setupHours', b.setup_hours,
        'materialAllowance', b.material_allowance,
        'wasteFactor', b.waste_factor,
        'crewSize', b.crew_size,
        'unitKey', b.unit_key::text
      ) FROM base b),
    'company', (SELECT jsonb_strip_nulls(jsonb_build_object(
        'productivityConvention', o.productivity_convention,
        'defaultLaborHours', o.default_labor_hours,
        'productionRate', o.production_rate,
        'hoursPerUnit', public.assembly_hours_per_unit(
                          COALESCE(o.productivity_convention,
                                   (SELECT productivity_convention FROM base)),
                          o.default_labor_hours, o.production_rate),
        'setupHours', o.setup_hours,
        'materialAllowance', o.material_allowance,
        'wasteFactor', o.waste_factor,
        'crewSize', o.crew_size,
        'minTaskHours', o.min_task_hours,
        'equipmentCost', o.equipment_cost,
        'otherCost', o.other_cost,
        'directUnitCost', o.direct_unit_cost,
        'unitKey', o.unit_key::text,
        'rateNote', o.rate_note,
        'updatedAt', o.updated_at
      )) FROM ov o),
    'isCustomized', EXISTS (SELECT 1 FROM ov)
  );
$$;

-- 5. Full source trace for one estimate line ------------------
CREATE OR REPLACE FUNCTION public.line_pricing_basis(_line_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line public.estimate_line_items%ROWTYPE;
  v_entry jsonb;
BEGIN
  SELECT * INTO v_line FROM public.estimate_line_items WHERE id = _line_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_entry := CASE
    WHEN v_line.catalog_item_key IS NULL THEN NULL
    ELSE public.cost_book_entry(v_line.organization_id, v_line.catalog_item_key)
  END;

  RETURN jsonb_build_object(
    'lineId', v_line.id,
    'description', v_line.description,
    'tradeKey', v_line.trade_key,
    'categoryKey', v_line.category_key,
    'unitKey', v_line.unit_key::text,
    'quantity', v_line.quantity,
    'quantityBasis', v_line.quantity_basis,
    'quantityBasisNote', v_line.quantity_basis_note,
    'quantityBasisFormula', v_line.quantity_basis_formula,
    'quantityIsAssumedDefault', COALESCE(v_line.quantity_is_assumed_default, false),
    'costBasis', v_line.cost_basis::text,
    'resolutionStatus', v_line.resolution_status::text,
    'pricingSource', v_line.pricing_source,
    'isPriceOverridden', COALESCE(v_line.is_price_overridden, false),
    'catalogItemKey', v_line.catalog_item_key,
    'catalogEntry', v_entry,
    'effective', jsonb_build_object(
      'hoursPerUnit', v_line.labor_hours_per_unit,
      'setupHours', v_line.labor_hours_setup,
      'laborHoursRaw', COALESCE(v_line.labor_hours_setup, 0)
        + COALESCE(v_line.labor_hours_per_unit, 0) * COALESCE(v_line.quantity, 0),
      'laborHours', v_line.labor_hours,
      'laborRate', v_line.labor_rate,
      'laborFormula', v_line.labor_hours_formula,
      'materialUnitCost', v_line.material_cost,
      'equipmentCost', v_line.equipment_cost,
      'subcontractorCost', v_line.subcontractor_cost,
      'otherCost', v_line.other_cost,
      'laborTotal', v_line.labor_total,
      'materialTotal', v_line.material_total,
      'directCost', v_line.direct_cost
    ),
    'estimateOverride', jsonb_strip_nulls(jsonb_build_object(
      'hoursPerUnit', v_line.rate_override_hours_per_unit,
      'setupHours', v_line.rate_override_setup_hours,
      'laborRate', v_line.rate_override_labor_rate,
      'materialUnitCost', v_line.rate_override_material_unit_cost,
      'equipmentCost', v_line.rate_override_equipment_cost,
      'otherCost', v_line.rate_override_other_cost,
      'note', v_line.rate_override_note,
      'at', v_line.rate_override_at
    )),
    'basisTrace', v_line.pricing_basis
  );
END
$$;

-- 6. Apply per-estimate overrides on every line write --------
CREATE OR REPLACE FUNCTION public.apply_line_rate_overrides()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_qty numeric := COALESCE(NEW.quantity, 0);
  v_sources jsonb := '{}'::jsonb;
  v_touched boolean := false;
BEGIN
  IF NEW.rate_override_hours_per_unit IS NOT NULL THEN
    NEW.labor_hours_per_unit := NEW.rate_override_hours_per_unit;
    v_sources := v_sources || jsonb_build_object('hoursPerUnit', 'estimate_override');
    v_touched := true;
  END IF;
  IF NEW.rate_override_setup_hours IS NOT NULL THEN
    NEW.labor_hours_setup := NEW.rate_override_setup_hours;
    v_sources := v_sources || jsonb_build_object('setupHours', 'estimate_override');
    v_touched := true;
  END IF;
  IF NEW.rate_override_labor_rate IS NOT NULL THEN
    NEW.labor_rate := round(NEW.rate_override_labor_rate, 2);
    v_sources := v_sources || jsonb_build_object('laborRate', 'estimate_override');
    v_touched := true;
  END IF;
  IF NEW.rate_override_material_unit_cost IS NOT NULL THEN
    NEW.material_cost := round(NEW.rate_override_material_unit_cost, 2);
    v_sources := v_sources || jsonb_build_object('materialUnitCost', 'estimate_override');
    v_touched := true;
  END IF;
  IF NEW.rate_override_equipment_cost IS NOT NULL THEN
    NEW.equipment_cost := round(NEW.rate_override_equipment_cost, 2);
    v_sources := v_sources || jsonb_build_object('equipmentCost', 'estimate_override');
    v_touched := true;
  END IF;
  IF NEW.rate_override_other_cost IS NOT NULL THEN
    NEW.other_cost := round(NEW.rate_override_other_cost, 2);
    v_sources := v_sources || jsonb_build_object('otherCost', 'estimate_override');
    v_touched := true;
  END IF;

  /* Recompute authoritative labor from the effective per-unit convention.
     Fees carry zero labor; the quarter-hour trigger normalizes afterwards. */
  IF v_touched
     AND (NEW.rate_override_hours_per_unit IS NOT NULL
          OR NEW.rate_override_setup_hours IS NOT NULL)
     AND NOT public.is_fee_basis(NEW.cost_basis)
  THEN
    NEW.labor_hours := COALESCE(NEW.labor_hours_setup, 0)
      + COALESCE(NEW.labor_hours_per_unit, 0) * v_qty;
    NEW.labor_hours_formula := format('%s setup + %s x %s hr/unit (this estimate)',
      COALESCE(NEW.labor_hours_setup, 0), v_qty, COALESCE(NEW.labor_hours_per_unit, 0));
    NEW.labor_hours_basis := 'estimate_rate_override';
  END IF;

  IF v_touched THEN
    NEW.rate_override_at := COALESCE(NEW.rate_override_at, now());
    NEW.rate_override_by := COALESCE(NEW.rate_override_by, auth.uid());
  END IF;

  NEW.pricing_basis := COALESCE(NEW.pricing_basis, '{}'::jsonb)
    || jsonb_build_object(
         'sources', v_sources,
         'hasEstimateOverride', v_touched,
         'catalogItemKey', NEW.catalog_item_key,
         'pricingSource', NEW.pricing_source,
         'stampedAt', now()
       );

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS zy_line_rate_overrides ON public.estimate_line_items;
CREATE TRIGGER zy_line_rate_overrides
BEFORE INSERT OR UPDATE ON public.estimate_line_items
FOR EACH ROW EXECUTE FUNCTION public.apply_line_rate_overrides();

-- 7. Explicit, opt-in reprice from the current Cost Book ------
CREATE OR REPLACE FUNCTION public.reprice_estimate_from_cost_book(_estimate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_result jsonb;
BEGIN
  SELECT organization_id INTO v_org FROM public.estimates WHERE id = _estimate_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  IF NOT public.is_org_member(v_org) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  /* Approved, locked, archived and superseded estimates are historical
     documents: a cost book change must never reprice them. */
  IF NOT public.estimate_is_editable(_estimate_id) THEN
    RAISE EXCEPTION 'Estimate is not editable and cannot be repriced';
  END IF;

  /* Re-run the canonical KB pricing path for every system-owned line.
     Contractor manual overrides (is_price_overridden) and per-estimate rate
     overrides survive: the former is skipped by kb_apply_pricing, the latter
     is re-applied by the zy_line_rate_overrides trigger. */
  SELECT public.kb_apply_pricing(_estimate_id, NULL, false) INTO v_result;

  UPDATE public.estimate_line_items
     SET cost_book_applied_at = now()
   WHERE estimate_id = _estimate_id
     AND archived_at IS NULL
     AND COALESCE(is_price_overridden, false) = false;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object('repricedAt', now());
END
$$;
