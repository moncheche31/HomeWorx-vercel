-- ============================================================
-- 1. Cost-basis vocabulary
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.task_cost_basis AS ENUM (
    'labor_production','labor_lump_sum','labor_time_and_material',
    'material_unit','material_lump_sum','equipment','subcontract',
    'permit_fee','other_direct_cost','allowance','composite_task');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.line_resolution_status AS ENUM ('resolved','unresolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. Columns
-- ============================================================
ALTER TABLE public.catalog_assemblies       ADD COLUMN IF NOT EXISTS cost_basis public.task_cost_basis;
ALTER TABLE public.org_assemblies           ADD COLUMN IF NOT EXISTS cost_basis public.task_cost_basis;
ALTER TABLE public.org_assembly_overrides   ADD COLUMN IF NOT EXISTS cost_basis public.task_cost_basis;

ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS cost_basis public.task_cost_basis,
  ADD COLUMN IF NOT EXISTS cost_basis_source text,
  ADD COLUMN IF NOT EXISTS labor_convention text,
  ADD COLUMN IF NOT EXISTS resolution_status public.line_resolution_status NOT NULL DEFAULT 'resolved',
  ADD COLUMN IF NOT EXISTS unresolved_reason text,
  ADD COLUMN IF NOT EXISTS cost_basis_repaired_at timestamptz;

CREATE INDEX IF NOT EXISTS estimate_line_items_resolution_idx
  ON public.estimate_line_items (estimate_id, resolution_status)
  WHERE archived_at IS NULL;

-- ============================================================
-- 3. Shared classification helpers (mirror of src/domains/estimating/costBasis.ts)
-- ============================================================
CREATE OR REPLACE FUNCTION public.infer_cost_basis(
  _description text, _category text DEFAULT NULL, _unit text DEFAULT NULL)
RETURNS public.task_cost_basis
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE t text := lower(coalesce(_description,'') || ' ' || coalesce(_category,''));
BEGIN
  IF t ~ '(permit|permitting|inspection fee|plan review|plan check|impact fee|municipal fee|city fee|county fee|utility fee|connection fee|tap fee|engineering fee|architect fee|filing fee|license fee|hoa fee)'
    THEN RETURN 'permit_fee'; END IF;
  IF t ~ '(subcontract|sub-contract|by others|sub quote|vendor quote)' THEN RETURN 'subcontract'; END IF;
  IF t ~ '(equipment rental|rental|scissor lift|boom lift|scaffold rental|excavator|skid steer)'
    THEN RETURN 'equipment'; END IF;
  IF t ~ '(dumpster|disposal fee|landfill|haul off|haul-off|haul away|delivery charge|delivery fee|freight|portable toilet|temporary power|storage unit)'
    THEN RETURN 'other_direct_cost'; END IF;
  IF t ~ '(time and material|t&m|hourly rate|per hour labor)' THEN RETURN 'labor_time_and_material'; END IF;
  IF t ~ '(material only|materials only|supply only|furnish only|material supply|product only)'
    THEN RETURN CASE WHEN _unit IN ('each','lump_sum','allowance','other')
                     THEN 'material_lump_sum'::public.task_cost_basis
                     ELSE 'material_unit'::public.task_cost_basis END; END IF;
  IF t ~ '(allowance|budget placeholder|tbd allowance)' THEN RETURN 'allowance'; END IF;
  IF t ~ '(service call|trip charge|mobilization|punch list|final cleaning|site cleanup)'
    THEN RETURN 'labor_lump_sum'; END IF;
  RETURN 'labor_production';
END $$;

/* Bases that MUST carry labor hours when the work is in scope. */
CREATE OR REPLACE FUNCTION public.is_labor_bearing_basis(_b public.task_cost_basis)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _b IN ('labor_production','labor_lump_sum','labor_time_and_material','composite_task');
$$;

/* Bases whose money is a fee / direct cost, never material and never labor. */
CREATE OR REPLACE FUNCTION public.is_fee_basis(_b public.task_cost_basis)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _b IN ('permit_fee','other_direct_cost');
$$;

/* Units whose quantity must be physically measured — a bare 1 is not evidence. */
CREATE OR REPLACE FUNCTION public.is_measured_unit(_u text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _u IN ('square_foot','square_yard','square','linear_foot','board_foot',
                'cubic_foot','cubic_yard','gallon','pound','sheet');
$$;

CREATE OR REPLACE FUNCTION public.default_unit_for_basis(_b public.task_cost_basis)
RETURNS public.scope_unit LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _b
    WHEN 'labor_time_and_material' THEN 'hour'
    WHEN 'equipment' THEN 'day'
    ELSE 'each' END::public.scope_unit;
$$;

-- ============================================================
-- 4. THE authoritative line gate.
--    Runs on every insert/update from every generator, legacy or new, so no
--    write path can disagree about fees, fake quantities or silent zero labor.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_estimate_line_cost_basis()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_contractor boolean := COALESCE(NEW.is_price_overridden, false)
                          OR COALESCE(NEW.pricing_source,'') IN ('contractor','manual');
  v_basis public.task_cost_basis;
BEGIN
  -- Classify once. A stored basis (contractor or prior run) is respected.
  v_basis := COALESCE(NEW.cost_basis,
               public.infer_cost_basis(NEW.description, NEW.category_key, NEW.unit_key::text));
  NEW.cost_basis := v_basis;
  NEW.cost_basis_source := COALESCE(NEW.cost_basis_source,
                             CASE WHEN v_contractor THEN 'contractor' ELSE 'inferred' END);

  -- Rule 1: a fee is never labor, and its money is never "material".
  IF public.is_fee_basis(v_basis) AND NOT v_contractor THEN
    IF COALESCE(NEW.material_cost,0) > 0 AND COALESCE(NEW.other_cost,0) = 0 THEN
      NEW.other_cost := NEW.material_cost;
      NEW.material_cost := 0;
    END IF;
    NEW.labor_hours := 0;
    NEW.labor_hours_per_unit := 0;
    NEW.labor_hours_basis := 'fee_no_labor';
    NEW.labor_hours_formula := 'fee — no labor by cost basis';
    IF NEW.unit_key IS NULL OR NOT (NEW.unit_key::text IN ('each','lump_sum','allowance','other')) THEN
      NEW.unit_key := public.default_unit_for_basis(v_basis);
    END IF;
    -- A single permit is a real count of one, not an unmeasured placeholder.
    IF COALESCE(NEW.quantity,0) <= 0 THEN NEW.quantity := 1; END IF;
    NEW.is_quantity_placeholder := false;
  END IF;

  -- Rule 2 + 3: decide whether this line can be defensibly priced.
  IF v_contractor THEN
    NEW.resolution_status := 'resolved';
    NEW.unresolved_reason := NULL;
  ELSIF COALESCE(NEW.pricing_source,'') = 'unmatched' OR NEW.pricing_source IS NULL THEN
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := COALESCE(NULLIF(NEW.unresolved_reason,''), 'no_catalog_match');
  ELSIF public.is_measured_unit(NEW.unit_key::text)
        AND COALESCE(NEW.is_quantity_placeholder,false)
        AND COALESCE(NEW.quantity,0) <= 1 THEN
    -- A measured task with an unmeasured quantity has no trustworthy total.
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := 'quantity_unmeasured';
  ELSIF public.is_labor_bearing_basis(v_basis)
        AND COALESCE(NEW.labor_hours,0) = 0
        AND COALESCE(NEW.labor_hours_per_unit,0) = 0 THEN
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := 'no_productivity_rate';
  ELSE
    NEW.resolution_status := 'resolved';
    NEW.unresolved_reason := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS estimate_line_cost_basis_gate ON public.estimate_line_items;
CREATE TRIGGER estimate_line_cost_basis_gate
  BEFORE INSERT OR UPDATE ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_estimate_line_cost_basis();

-- ============================================================
-- 5. Catalog repair: fees stop being modelled as labor + material.
-- ============================================================
UPDATE public.catalog_assemblies
   SET cost_basis = public.infer_cost_basis(work_item, category_key, unit_key::text)
 WHERE cost_basis IS NULL;

UPDATE public.catalog_assemblies
   SET default_labor_hours = 0,
       production_rate = NULL,
       crew_size = 0,
       waste_factor = 0
 WHERE public.is_fee_basis(cost_basis);

UPDATE public.org_assemblies
   SET cost_basis = public.infer_cost_basis(work_item, category_key, unit_key::text)
 WHERE cost_basis IS NULL;

UPDATE public.org_assemblies
   SET default_labor_hours = 0, production_rate = NULL, crew_size = 0, waste_factor = 0
 WHERE public.is_fee_basis(cost_basis);

-- kb_resolved_assemblies must now carry the basis through to the generator.
DROP FUNCTION IF EXISTS public.kb_resolved_assemblies(uuid);
CREATE FUNCTION public.kb_resolved_assemblies(_org uuid)
RETURNS TABLE(assembly_key text, origin text, trade_key text, category_key text,
  subcategory_key text, work_item text, default_scope_description text, unit_key scope_unit,
  production_rate numeric, default_labor_hours numeric, crew_size numeric,
  material_allowance numeric, waste_factor numeric, suggested_markup_pct numeric,
  default_overhead_pct numeric, suggested_profit_pct numeric, keywords text[],
  synonyms text[], is_sample_data boolean, cost_basis public.task_cost_basis)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH v AS (SELECT version FROM public.catalog_library_versions WHERE is_current LIMIT 1)
  SELECT a.assembly_key, 'library'::text,
         a.trade_key, a.category_key, a.subcategory_key,
         COALESCE(o.work_item, a.work_item),
         COALESCE(o.default_scope_description, a.default_scope_description),
         COALESCE(o.unit_key, a.unit_key),
         COALESCE(o.production_rate, a.production_rate),
         COALESCE(o.default_labor_hours, a.default_labor_hours),
         COALESCE(o.crew_size, a.crew_size),
         COALESCE(o.material_allowance, a.material_allowance),
         COALESCE(o.waste_factor, a.waste_factor),
         COALESCE(o.suggested_markup_pct, a.suggested_markup_pct),
         COALESCE(o.default_overhead_pct, a.default_overhead_pct),
         COALESCE(o.suggested_profit_pct, a.suggested_profit_pct),
         COALESCE(o.keywords, a.keywords), a.synonyms, a.is_sample_data,
         COALESCE(o.cost_basis, a.cost_basis,
                  public.infer_cost_basis(COALESCE(o.work_item, a.work_item),
                                          a.category_key, COALESCE(o.unit_key,a.unit_key)::text))
  FROM public.catalog_assemblies a
  JOIN v ON v.version = a.library_version
  LEFT JOIN public.org_assembly_overrides o
    ON o.assembly_key = a.assembly_key AND o.organization_id = _org
  WHERE a.is_active
    AND COALESCE(o.is_disabled, false) = false
    AND o.archived_at IS NULL
  UNION ALL
  SELECT c.assembly_key, 'organization'::text,
         c.trade_key, c.category_key, c.subcategory_key,
         c.work_item, c.default_scope_description, c.unit_key,
         c.production_rate, c.default_labor_hours, c.crew_size,
         c.material_allowance, c.waste_factor,
         c.suggested_markup_pct, c.default_overhead_pct, c.suggested_profit_pct,
         c.keywords, c.synonyms, false,
         COALESCE(c.cost_basis, public.infer_cost_basis(c.work_item, c.category_key, c.unit_key::text))
  FROM public.org_assemblies c
  WHERE c.organization_id = _org
    AND c.is_disabled = false AND c.archived_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.kb_resolved_assemblies(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.infer_cost_basis(text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_labor_bearing_basis(public.task_cost_basis) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_fee_basis(public.task_cost_basis) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_measured_unit(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.default_unit_for_basis(public.task_cost_basis) TO authenticated, service_role;
