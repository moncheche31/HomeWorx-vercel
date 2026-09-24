-- ============================================================
-- Pricing coverage & deterministic intent mapping
-- ============================================================

-- 1) Catalog gap closure: work items contractors ask for that v1 could not price.
INSERT INTO public.catalog_assemblies (
  library_version, assembly_key, trade_key, category_key, subcategory_key, work_item,
  default_scope_description, client_description, unit_key, measurement_method,
  production_rate, default_labor_hours, crew_size, skill_level, material_allowance,
  waste_factor, equipment_requirements, suggested_markup_pct, default_overhead_pct,
  suggested_profit_pct, estimated_duration_hours, typical_dependencies, internal_notes,
  safety_notes, code_reference, inspection_notes, keywords, synonyms,
  is_sample_data, is_active, sort_order
)
SELECT 1, v.key, v.trade, v.cat, v.sub, v.name,
  v.name || '. Includes layout, materials handling, installation per manufacturer instructions, and cleanup of work area. Sample production assumption — verify against field conditions.',
  v.name, v.unit::public.scope_unit, v.meas,
  CASE WHEN v.hours > 0 THEN round(1 / v.hours, 2) ELSE NULL END, v.hours,
  COALESCE((SELECT max(a.crew_size) FROM public.catalog_assemblies a WHERE a.library_version = 1 AND a.trade_key = v.trade), 2),
  COALESCE((SELECT max(a.skill_level) FROM public.catalog_assemblies a WHERE a.library_version = 1 AND a.trade_key = v.trade), 'general_labor'),
  v.mat,
  COALESCE((SELECT max(a.waste_factor) FROM public.catalog_assemblies a WHERE a.library_version = 1 AND a.trade_key = v.trade), 0.05),
  COALESCE((SELECT max(a.equipment_requirements) FROM public.catalog_assemblies a WHERE a.library_version = 1 AND a.trade_key = v.trade), 'Varies by scope'),
  15, 10, 10, v.hours, '{}'::text[],
  'Sample assumption from VisionWorx360 Library v1. Adjust to your crew and market.',
  COALESCE((SELECT max(a.safety_notes) FROM public.catalog_assemblies a WHERE a.library_version = 1 AND a.trade_key = v.trade), 'Site-specific hazard review required'),
  'TBD — verify against locally adopted code edition',
  'TBD — confirm required inspections with local jurisdiction',
  v.keywords, v.keywords[1:4], true, true,
  1000 + row_number() OVER (ORDER BY v.key)
FROM (VALUES
  ('permits.building.fee','specialty','permits','compliance','Building permit fee allowance','each','Count of permits',1.5,650,ARRAY['building permit','permit','jurisdiction','fee']),
  ('permits.electrical.fee','specialty','permits','compliance','Electrical permit fee allowance','each','Count of permits',0.75,185,ARRAY['electrical permit','permit','fee']),
  ('permits.plumbing.fee','specialty','permits','compliance','Plumbing permit fee allowance','each','Count of permits',0.75,185,ARRAY['plumbing permit','permit','fee']),
  ('permits.mechanical.fee','specialty','permits','compliance','Mechanical permit fee allowance','each','Count of permits',0.75,165,ARRAY['mechanical permit','hvac permit','permit']),
  ('permits.inspection.schedule','specialty','permits','compliance','Schedule and attend inspections','each','Count of inspections',1.5,0,ARRAY['inspection','schedule','permit','sign off']),
  ('framing.window.reframe','framing','framing','rough_carpentry_coverage','Relocate and reframe window opening','each','Count of openings',6,185,ARRAY['reframe','relocate window','move window','opening']),
  ('framing.opening.infill','framing','framing','rough_carpentry_coverage','Close in and frame over existing opening','each','Count of openings',5,145,ARRAY['close in','infill','opening','door']),
  ('framing.post.structural','framing','framing','rough_carpentry_coverage','Install structural post and bearing','each','Count of posts',2.5,125,ARRAY['post','column','bearing','structural']),
  ('demo.door.remove','demolition','demo','interior_coverage','Remove existing door and frame','each','Count of doors',0.9,0.05,ARRAY['remove door','demo','door','frame']),
  ('demo.appliance.disconnect','demolition','demo','interior_coverage','Disconnect and remove appliances','each','Count of appliances',0.8,0.05,ARRAY['appliance','disconnect','remove','demo']),
  ('drywall.repair.area','drywall','drywall','repair','Repair and re-finish damaged drywall area','square_foot','Repaired wall/ceiling area',0.05,0.95,ARRAY['drywall repair','repair','patch','refinish']),
  ('insulation.batt.floor','insulation','insulation','thermal_coverage','Install batt insulation — floor','square_foot','Floor area',0.015,1.05,ARRAY['insulation','floor','batt','underfloor']),
  ('electrical.device.relocate','electrical','electrical','modifications','Relocate existing device or circuit','each','Count of devices',1.4,28,ARRAY['relocate','electrical relocation','move outlet','circuit']),
  ('hvac.relocate.equipment','hvac','hvac','modifications','Relocate HVAC register, duct or equipment','each','Count of relocations',3.5,145,ARRAY['hvac relocation','relocate','duct','register']),
  ('painting.blend.touchup','painting','painting','repair_finishes','Blend and touch up existing paint','each','Count of areas',1.5,22,ARRAY['paint blending','touch up','blend','paint']),
  ('plumbing.rough.adjust','plumbing','plumbing','modifications','Adjust existing rough plumbing','each','Count of adjustments',2.2,65,ARRAY['rough in','adjust','relocate','plumbing']),
  ('flooring.patch.area','flooring','flooring','repair','Patch and infill existing flooring','each','Count of patch areas',2.5,85,ARRAY['floor patching','patch','infill','flooring']),
  ('bath.shower.waterproof.system','specialty','bath','shower_systems','Waterproof shower enclosure system','each','Count of showers',6,285,ARRAY['shower waterproofing','waterproof','membrane','pan']),
  ('bath.shower.niche','specialty','bath','shower_systems','Build and tile shower niche','each','Count of niches',2.5,95,ARRAY['niche','shower niche','recess']),
  ('bath.shower.glass.frameless','specialty','bath','shower_systems','Install frameless glass shower enclosure','each','Count of enclosures',4,1450,ARRAY['frameless','glass shower','enclosure']),
  ('trim.base.removereinstall','trim','trim','finish_carpentry_coverage','Remove and reinstall existing baseboard','linear_foot','LF of base',0.06,0.35,ARRAY['baseboard','remove and reinstall','r and r','trim'])
) AS v(key, trade, cat, sub, name, unit, meas, hours, mat, keywords)
ON CONFLICT (library_version, assembly_key) DO NOTHING;

-- 2) Deterministic phrase → work item map (single source of truth mirrored in
--    src/domains/estimating/pricing/intentMap.ts).
CREATE TABLE IF NOT EXISTS public.catalog_intent_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  library_version integer NOT NULL REFERENCES public.catalog_library_versions(version),
  alias_norm text NOT NULL,
  match_kind text NOT NULL CHECK (match_kind IN ('exact','contains')),
  assembly_key text,
  quantity_factor numeric NOT NULL DEFAULT 1 CHECK (quantity_factor > 0),
  role text,
  priority integer NOT NULL DEFAULT 100,
  review_reason text CHECK (review_reason IN (
    'ambiguous_material_selection','ambiguous_multi_scope','missing_measured_quantity')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_intent_aliases_target_ck
    CHECK ((assembly_key IS NOT NULL) <> (review_reason IS NOT NULL))
);

GRANT SELECT ON public.catalog_intent_aliases TO authenticated;
GRANT ALL ON public.catalog_intent_aliases TO service_role;
ALTER TABLE public.catalog_intent_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Intent aliases are readable by signed-in users" ON public.catalog_intent_aliases;
CREATE POLICY "Intent aliases are readable by signed-in users"
  ON public.catalog_intent_aliases FOR SELECT TO authenticated USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_intent_aliases_unique
  ON public.catalog_intent_aliases (library_version, alias_norm, COALESCE(assembly_key, ''));
CREATE INDEX IF NOT EXISTS catalog_intent_aliases_lookup
  ON public.catalog_intent_aliases (library_version, alias_norm);

DROP TRIGGER IF EXISTS set_catalog_intent_aliases_updated_at ON public.catalog_intent_aliases;
CREATE TRIGGER set_catalog_intent_aliases_updated_at
  BEFORE UPDATE ON public.catalog_intent_aliases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.catalog_intent_aliases
  (library_version, alias_norm, match_kind, assembly_key, quantity_factor, role, priority, review_reason, note) VALUES
  (1, 'building permit', 'contains', 'permits.building.fee', 1, 'permit fee', 100, NULL, NULL),
  (1, 'electrical permit and inspection', 'contains', 'permits.electrical.fee', 1, 'permit fee', 100, NULL, NULL),
  (1, 'electrical permit and inspection', 'contains', 'permits.inspection.schedule', 1, 'inspection coordination', 100, NULL, NULL),
  (1, 'electrical permit', 'contains', 'permits.electrical.fee', 1, 'permit fee', 100, NULL, NULL),
  (1, 'plumbing permit', 'contains', 'permits.plumbing.fee', 1, 'permit fee', 100, NULL, NULL),
  (1, 'mechanical permit', 'contains', 'permits.mechanical.fee', 1, 'permit fee', 100, NULL, NULL),
  (1, 'permit and inspection', 'contains', 'permits.inspection.schedule', 1, 'inspection coordination', 90, NULL, NULL),
  (1, 'frame walls to code', 'contains', 'framing.wall.interior', 1, 'wall framing', 100, NULL, NULL),
  (1, 'frame interior walls', 'contains', 'framing.wall.interior', 1, 'wall framing', 100, NULL, NULL),
  (1, 'frame new walls', 'contains', 'framing.wall.interior', 1, 'wall framing', 100, NULL, NULL),
  (1, 'move and reframe', 'contains', 'framing.window.reframe', 1, 'window relocation', 100, NULL, NULL),
  (1, 'remove and reframe', 'contains', 'framing.window.reframe', 1, 'opening reframe', 100, NULL, NULL),
  (1, 'relocate window', 'contains', 'framing.window.reframe', 1, 'window relocation', 100, NULL, NULL),
  (1, 'close in existing', 'contains', 'framing.opening.infill', 1, 'opening infill', 100, NULL, NULL),
  (1, 'close in opening', 'contains', 'framing.opening.infill', 1, 'opening infill', 100, NULL, NULL),
  (1, 'infill opening', 'contains', 'framing.opening.infill', 1, 'opening infill', 100, NULL, NULL),
  (1, 'cut out and frame opening', 'contains', 'framing.header.opening', 1, 'rough opening', 100, NULL, NULL),
  (1, 'frame opening', 'contains', 'framing.header.opening', 1, 'rough opening', 90, NULL, NULL),
  (1, 'lvl beam and posts', 'contains', NULL, 1, NULL, 100, 'missing_measured_quantity', 'Needs beam length and post count before it can be priced.'),
  (1, 'lvl beam', 'contains', 'framing.beam.lvl', 1, 'structural beam', 90, NULL, NULL),
  (1, 'structural post', 'contains', 'framing.post.structural', 1, 'bearing post', 100, NULL, NULL),
  (1, 'remove existing garage partition wall', 'contains', 'demo.wall.nonbearing', 1, 'wall demo', 100, NULL, NULL),
  (1, 'remove existing partition wall', 'contains', 'demo.wall.nonbearing', 1, 'wall demo', 100, NULL, NULL),
  (1, 'remove existing back entry door', 'contains', 'demo.door.remove', 1, 'door removal', 100, NULL, NULL),
  (1, 'remove existing door', 'contains', 'demo.door.remove', 1, 'door removal', 90, NULL, NULL),
  (1, 'remove existing cabinets and countertops', 'contains', 'demo.cabinets.kitchen', 1, 'cabinet and top demo', 100, NULL, NULL),
  (1, 'remove existing cabinets', 'contains', 'demo.cabinets.kitchen', 1, 'cabinet demo', 90, NULL, NULL),
  (1, 'disconnect and remove appliances', 'contains', 'demo.appliance.disconnect', 1, 'appliance removal', 100, NULL, NULL),
  (1, 'remove flooring', 'contains', NULL, 1, NULL, 100, 'ambiguous_material_selection', 'Carpet, tile and hardwood remove at very different rates — choose the existing floor type.'),
  (1, 'insulate walls ceiling floor walls', 'contains', 'insulation.batt.wall', 1, 'wall insulation', 100, NULL, NULL),
  (1, 'insulate walls ceiling floor ceiling', 'contains', 'insulation.batt.ceiling', 1, 'ceiling insulation', 100, NULL, NULL),
  (1, 'insulate walls ceiling floor floor', 'contains', 'insulation.batt.floor', 1, 'floor insulation', 100, NULL, NULL),
  (1, 'insulate walls', 'contains', 'insulation.batt.wall', 1, 'wall insulation', 80, NULL, NULL),
  (1, 'insulate ceiling', 'contains', 'insulation.batt.ceiling', 1, 'ceiling insulation', 80, NULL, NULL),
  (1, 'insulate floor', 'contains', 'insulation.batt.floor', 1, 'floor insulation', 80, NULL, NULL),
  (1, 'drywall repair', 'contains', 'drywall.repair.area', 1, 'drywall repair', 100, NULL, NULL),
  (1, 'repair drywall', 'contains', 'drywall.repair.area', 1, 'drywall repair', 100, NULL, NULL),
  (1, 'prime and paint walls and ceilings', 'contains', 'painting.prime.walls', 1, 'primer', 100, NULL, NULL),
  (1, 'prime and paint walls and ceilings', 'contains', 'painting.walls.twocoat', 1, 'wall finish coats', 100, NULL, NULL),
  (1, 'prime and paint walls and ceilings', 'contains', 'painting.ceiling', 1, 'ceiling finish', 100, NULL, NULL),
  (1, 'prime and paint walls', 'contains', 'painting.prime.walls', 1, 'primer', 90, NULL, NULL),
  (1, 'prime and paint walls', 'contains', 'painting.walls.twocoat', 1, 'wall finish coats', 90, NULL, NULL),
  (1, 'prime and paint trim', 'contains', 'painting.trim.base', 1, 'trim paint', 100, NULL, NULL),
  (1, 'paint blending', 'contains', 'painting.blend.touchup', 1, 'paint blending', 100, NULL, NULL),
  (1, 'touch up paint', 'contains', 'painting.blend.touchup', 1, 'paint touch-up', 100, NULL, NULL),
  (1, 'subfloor prep and leveling', 'contains', 'flooring.level.selfleveling', 1, 'floor prep', 100, NULL, NULL),
  (1, 'floor patching', 'contains', 'flooring.patch.area', 1, 'floor patching', 100, NULL, NULL),
  (1, 'transitions and thresholds', 'contains', 'flooring.transition.strip', 1, 'transitions', 100, NULL, NULL),
  (1, 'install finished flooring', 'contains', NULL, 1, NULL, 100, 'ambiguous_material_selection', 'Pick the flooring material (LVP, tile, hardwood or carpet) to price this line.'),
  (1, 'install new kitchen flooring', 'contains', NULL, 1, NULL, 100, 'ambiguous_material_selection', 'Pick the flooring material to price this line.'),
  (1, 'baseboard removal and reinstall', 'contains', 'trim.base.removereinstall', 1, 'baseboard R&R', 100, NULL, NULL),
  (1, 'install replace baseboards', 'contains', 'trim.base.install', 1, 'baseboard', 100, NULL, NULL),
  (1, 'install baseboards', 'contains', 'trim.base.install', 1, 'baseboard', 80, NULL, NULL),
  (1, 'install interior doors and trim', 'contains', 'doors.interior.prehung', 1, 'door', 100, NULL, NULL),
  (1, 'install interior doors and trim', 'contains', 'trim.casing.door', 1, 'casing', 100, NULL, NULL),
  (1, 'install base and wall cabinets', 'contains', 'cabinets.base.install', 1, 'base cabinets', 100, NULL, NULL),
  (1, 'install base and wall cabinets', 'contains', 'cabinets.wall.install', 1, 'wall cabinets', 100, NULL, NULL),
  (1, 'vanity 60', 'contains', 'cabinets.vanity.install', 1, 'vanity', 100, NULL, NULL),
  (1, 'vanities', 'exact', 'cabinets.vanity.install', 1, 'vanity', 100, NULL, NULL),
  (1, 'vanity', 'exact', 'cabinets.vanity.install', 1, 'vanity', 100, NULL, NULL),
  (1, 'template and install countertops', 'contains', NULL, 1, NULL, 100, 'ambiguous_material_selection', 'Pick the countertop material (quartz, granite, laminate or butcher block).'),
  (1, 'install rough plumbing for bathroom fixtures', 'contains', 'plumbing.rough.fixture', 1, 'fixture rough-in', 100, NULL, NULL),
  (1, 'rough plumbing for sink relocation', 'contains', 'plumbing.rough.fixture', 1, 'fixture rough-in', 100, NULL, NULL),
  (1, 'rough plumbing', 'contains', 'plumbing.rough.fixture', 1, 'fixture rough-in', 80, NULL, NULL),
  (1, 'plumbing rough in adjustments', 'contains', 'plumbing.rough.adjust', 1, 'rough-in adjustment', 100, NULL, NULL),
  (1, 'install new shutoffs and supply lines', 'contains', 'plumbing.shutoff.valve', 1, 'shutoffs', 100, NULL, NULL),
  (1, 'comfort height toilet', 'contains', 'access.comfort.toilet', 1, 'toilet', 100, NULL, NULL),
  (1, 'shower waterproofing', 'contains', 'bath.shower.waterproof.system', 1, 'shower waterproofing', 100, NULL, NULL),
  (1, 'shower niche', 'contains', 'bath.shower.niche', 1, 'niche', 100, NULL, NULL),
  (1, 'frameless glass shower', 'contains', 'bath.shower.glass.frameless', 1, 'glass enclosure', 100, NULL, NULL),
  (1, 'gfci afci protection', 'contains', 'electrical.gfci.protect', 1, 'GFCI/AFCI', 100, NULL, NULL),
  (1, 'gfci', 'contains', 'electrical.gfci.protect', 1, 'GFCI/AFCI', 70, NULL, NULL),
  (1, 'add dedicated appliance circuits', 'contains', 'electrical.circuit.dedicated', 1, 'dedicated circuit', 100, NULL, NULL),
  (1, 'dedicated circuit', 'contains', 'electrical.circuit.dedicated', 1, 'dedicated circuit', 80, NULL, NULL),
  (1, 'electrical relocation', 'contains', 'electrical.device.relocate', 1, 'device relocation', 100, NULL, NULL),
  (1, 'new circuits outlets lighting', 'contains', NULL, 1, NULL, 100, 'ambiguous_multi_scope', 'Split into circuits, receptacles and fixtures with counts so each can be priced.'),
  (1, 'hvac relocation', 'contains', 'hvac.relocate.equipment', 1, 'HVAC relocation', 100, NULL, NULL)
ON CONFLICT (library_version, alias_norm, COALESCE(assembly_key, '')) DO NOTHING;

-- 3) Pricing bridge v2: intent aliases first, composites supported, integrity gates kept.
CREATE OR REPLACE FUNCTION public.kb_apply_pricing(_estimate_id uuid, _pricing jsonb DEFAULT NULL::jsonb, _only_new boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_default_rate numeric;
  v_mat_factor numeric := COALESCE((_pricing->>'materialFactor')::numeric, 1);
  v_eq_factor numeric := COALESCE((_pricing->>'equipmentFactor')::numeric, 1);
  v_prov jsonb := COALESCE(_pricing->'provenance', '{}'::jsonb);
  v_min_score int := 60;
  v_lib int;
  v_priced int := 0;
  v_unmatched int := 0;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  v_default_rate := COALESCE((_pricing->>'defaultLaborRate')::numeric,
                             NULLIF(v_e.default_labor_rate, 0), 65);
  SELECT version INTO v_lib FROM public.catalog_library_versions WHERE is_current LIMIT 1;

  PERFORM set_config('vw.kb_pricing', 'on', true);

  WITH lib AS (
    SELECT * FROM public.kb_resolved_assemblies(v_e.organization_id)
  ),
  target AS (
    SELECT li.*,
           public.kb_norm(li.description) AS norm_description,
           -- A catalog key the bridge itself wrote on a previous run is a
           -- guess, not a confirmation: it must not score as an exact match.
           CASE WHEN li.catalog_mapping_source = 'contractor'
                THEN li.catalog_item_key
                WHEN li.pricing_source = 'knowledge_base'
                     AND li.is_price_overridden = false
                THEN NULL ELSE li.catalog_item_key END AS trusted_catalog_key
    FROM public.estimate_line_items li
    WHERE li.estimate_id = _estimate_id
      AND li.archived_at IS NULL
      AND li.is_price_overridden = false
      AND (NOT _only_new OR li.pricing_source IS NULL)
  ),
  -- ---------- deterministic intent layer ----------
  alias_hits AS (
    SELECT t.id AS line_id, ia.alias_norm, ia.review_reason, ia.note,
           CASE WHEN t.norm_description = ia.alias_norm THEN 90 ELSE 80 END AS score,
           row_number() OVER (
             PARTITION BY t.id
             ORDER BY CASE WHEN t.norm_description = ia.alias_norm THEN 90 ELSE 80 END DESC,
                      ia.priority DESC, length(ia.alias_norm) DESC, ia.alias_norm ASC) AS rn
    FROM target t
    JOIN (
      SELECT DISTINCT library_version, alias_norm, match_kind, priority, review_reason, note
      FROM public.catalog_intent_aliases
    ) ia
      ON ia.library_version = v_lib
     AND (t.norm_description = ia.alias_norm
          OR (ia.match_kind = 'contains'
              AND position(ia.alias_norm IN t.norm_description) > 0))
    WHERE t.trusted_catalog_key IS NULL
  ),
  intent AS (SELECT * FROM alias_hits WHERE rn = 1),
  intent_components AS (
    SELECT i.line_id, i.score, i.alias_norm,
           t.quantity, t.unit_key AS line_unit,
           ca.assembly_key, ca.quantity_factor, ca.role,
           r.work_item, r.origin, r.unit_key, r.trade_key, r.category_key, r.subcategory_key,
           r.default_overhead_pct, r.suggested_profit_pct, r.is_sample_data,
           COALESCE(r.default_labor_hours,
             CASE WHEN COALESCE(r.production_rate, 0) > 0 THEN 1 / r.production_rate END, 0) AS hours_per_unit,
           round(COALESCE(t.quantity, 1) * ca.quantity_factor
                 * COALESCE(r.default_labor_hours,
                     CASE WHEN COALESCE(r.production_rate, 0) > 0 THEN 1 / r.production_rate END, 0), 4) AS labor_hours,
           round(COALESCE(r.material_allowance, 0) * (1 + COALESCE(r.waste_factor, 0))
                 * v_mat_factor * ca.quantity_factor, 2) AS material_cost,
           round(COALESCE((_pricing->'laborRates'->>COALESCE(r.trade_key, ''))::numeric,
                          v_default_rate), 2) AS labor_rate,
           row_number() OVER (PARTITION BY i.line_id
                              ORDER BY ca.quantity_factor DESC, ca.assembly_key ASC) AS ord
    FROM intent i
    JOIN target t ON t.id = i.line_id
    JOIN public.catalog_intent_aliases ca
      ON ca.library_version = v_lib AND ca.alias_norm = i.alias_norm AND ca.assembly_key IS NOT NULL
    JOIN lib r ON r.assembly_key = ca.assembly_key
    WHERE i.review_reason IS NULL
  ),
  intent_resolved AS (
    SELECT
      ic.line_id,
      max(ic.score) AS score,
      max(ic.alias_norm) AS alias_norm,
      (array_agg(ic.assembly_key ORDER BY ic.ord))[1] AS assembly_key,
      (array_agg(ic.work_item ORDER BY ic.ord))[1] AS work_item,
      (array_agg(ic.origin ORDER BY ic.ord))[1] AS origin,
      (array_agg(ic.unit_key ORDER BY ic.ord))[1] AS unit_key,
      (array_agg(ic.trade_key ORDER BY ic.ord))[1] AS trade_key,
      (array_agg(ic.category_key ORDER BY ic.ord))[1] AS category_key,
      (array_agg(ic.subcategory_key ORDER BY ic.ord))[1] AS subcategory_key,
      max(ic.default_overhead_pct) AS default_overhead_pct,
      max(ic.suggested_profit_pct) AS suggested_profit_pct,
      bool_or(COALESCE(ic.is_sample_data, false)) AS is_sample_data,
      count(*) AS component_count,
      sum(ic.labor_hours) AS labor_hours,
      sum(ic.material_cost) AS material_cost,
      CASE WHEN sum(ic.labor_hours) > 0
           THEN round(sum(ic.labor_hours * ic.labor_rate) / sum(ic.labor_hours), 2)
           ELSE round(max(ic.labor_rate), 2) END AS labor_rate,
      bool_and(ic.line_unit IS NULL OR ic.unit_key = ic.line_unit) AS unit_ok,
      -- ADR-048: a size written in the description is not a count.
      bool_or(ic.line_unit = 'each' AND COALESCE(ic.quantity, 1) > 24) AS implausible_count,
      jsonb_agg(jsonb_build_object(
        'assemblyKey', ic.assembly_key, 'workItem', ic.work_item, 'role', ic.role,
        'quantityFactor', ic.quantity_factor, 'laborHoursPerUnit', ic.hours_per_unit,
        'laborHours', ic.labor_hours, 'materialCost', ic.material_cost,
        'laborRate', ic.labor_rate) ORDER BY ic.ord) AS components
    FROM intent_components ic
    GROUP BY ic.line_id
  ),
  -- ---------- legacy scoring layer (unchanged tiers) ----------
  scored AS (
    SELECT t.id AS line_id, t.quantity, t.unit_key AS line_unit, m.*
    FROM target t
    LEFT JOIN public.scope_items si ON si.id = t.scope_item_id
    LEFT JOIN LATERAL (
      SELECT c.*, (c.base_score + c.bonus) AS score
      FROM (
        SELECT a.*,
          CASE
            WHEN t.trusted_catalog_key IS NOT NULL AND a.assembly_key = t.trusted_catalog_key THEN 100
            WHEN si.scope_item_key IS NOT NULL AND a.assembly_key = si.scope_item_key THEN 95
            WHEN public.kb_norm(a.work_item) = t.norm_description THEN 85
            WHEN EXISTS (
              SELECT 1 FROM unnest(COALESCE(a.keywords, '{}') || COALESCE(a.synonyms, '{}')) k
              WHERE public.kb_norm(k) = t.norm_description) THEN 75
            WHEN t.trade_key IS NOT NULL AND a.trade_key = t.trade_key
                 AND public.kb_overlap(t.description, a.work_item) >= 0.6 THEN 65
            WHEN t.category_key IS NOT NULL AND a.category_key = t.category_key
                 AND public.kb_overlap(t.description, a.work_item) >= 0.6 THEN 62
            WHEN public.kb_overlap(t.description, a.work_item) >= 0.8 THEN 55
            ELSE 0
          END AS base_score,
          CASE
            WHEN t.trusted_catalog_key IS NOT NULL AND a.assembly_key = t.trusted_catalog_key THEN 'catalog_key'
            WHEN si.scope_item_key IS NOT NULL AND a.assembly_key = si.scope_item_key THEN 'scope_key'
            WHEN public.kb_norm(a.work_item) = t.norm_description THEN 'exact_title'
            WHEN EXISTS (
              SELECT 1 FROM unnest(COALESCE(a.keywords, '{}') || COALESCE(a.synonyms, '{}')) k
              WHERE public.kb_norm(k) = t.norm_description) THEN 'keyword'
            WHEN t.trade_key IS NOT NULL AND a.trade_key = t.trade_key
                 AND public.kb_overlap(t.description, a.work_item) >= 0.6 THEN 'trade_overlap'
            WHEN t.category_key IS NOT NULL AND a.category_key = t.category_key
                 AND public.kb_overlap(t.description, a.work_item) >= 0.6 THEN 'category_overlap'
            WHEN public.kb_overlap(t.description, a.work_item) >= 0.8 THEN 'text_overlap'
            ELSE 'none'
          END AS reason,
          (CASE WHEN t.trade_key IS NOT NULL AND a.trade_key = t.trade_key THEN 2 ELSE 0 END
           + CASE WHEN t.category_key IS NOT NULL AND a.category_key = t.category_key THEN 1 ELSE 0 END
           + CASE WHEN a.origin = 'organization' THEN 3 ELSE 0 END) AS bonus
        FROM lib a
        WHERE t.unit_key IS NULL
           OR a.unit_key IS NULL
           OR a.unit_key = t.unit_key
           OR a.assembly_key = t.trusted_catalog_key
           OR a.assembly_key = si.scope_item_key
      ) c
      WHERE c.base_score > 0
      ORDER BY (c.base_score + c.bonus) DESC, c.assembly_key ASC
      LIMIT 1
    ) m ON true
  ),
  -- ---------- one resolution per line ----------
  resolved AS (
    SELECT
      t.id AS line_id,
      CASE
        WHEN ir.line_id IS NOT NULL AND ir.unit_ok AND NOT ir.implausible_count THEN true
        WHEN i.line_id IS NOT NULL THEN false
        WHEN s.assembly_key IS NOT NULL AND s.score >= v_min_score THEN true
        ELSE false
      END AS priceable,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.assembly_key ELSE s.assembly_key END AS assembly_key,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.work_item ELSE s.work_item END AS work_item,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.origin ELSE s.origin END AS origin,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.unit_key ELSE s.unit_key END AS unit_key,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.trade_key ELSE s.trade_key END AS trade_key,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.category_key ELSE s.category_key END AS category_key,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.subcategory_key ELSE s.subcategory_key END AS subcategory_key,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.default_overhead_pct ELSE s.default_overhead_pct END AS default_overhead_pct,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.suggested_profit_pct ELSE s.suggested_profit_pct END AS suggested_profit_pct,
      CASE WHEN ir.line_id IS NOT NULL THEN COALESCE(ir.is_sample_data, false) ELSE COALESCE(s.is_sample_data, false) END AS is_sample_data,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.labor_hours
           ELSE round(COALESCE(s.quantity, 1)
                * COALESCE(s.default_labor_hours,
                    CASE WHEN COALESCE(s.production_rate, 0) > 0 THEN 1 / s.production_rate END, 0), 4) END AS labor_hours,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.labor_rate
           ELSE round(COALESCE((_pricing->'laborRates'->>COALESCE(s.trade_key, ''))::numeric,
                               v_default_rate), 2) END AS labor_rate,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.material_cost
           ELSE round(COALESCE(s.material_allowance, 0)
                      * (1 + COALESCE(s.waste_factor, 0)) * v_mat_factor, 2) END AS material_cost,
      CASE WHEN ir.line_id IS NOT NULL THEN ir.score ELSE s.score END AS score,
      CASE
        WHEN ir.line_id IS NOT NULL AND ir.score = 90 THEN 'intent_alias_exact'
        WHEN ir.line_id IS NOT NULL THEN 'intent_alias_phrase'
        ELSE s.reason
      END AS reason,
      CASE
        WHEN ir.line_id IS NOT NULL AND NOT ir.unit_ok THEN 'unit_mismatch'
        WHEN ir.line_id IS NOT NULL AND ir.implausible_count THEN 'implausible_count'
        WHEN i.line_id IS NOT NULL AND i.review_reason IS NOT NULL THEN i.review_reason
        WHEN i.line_id IS NOT NULL AND ir.line_id IS NULL THEN 'intent_assembly_unavailable'
        WHEN s.assembly_key IS NULL THEN 'no_knowledge_base_match'
        ELSE 'weak_match_needs_review'
      END AS review_reason,
      i.note AS review_note,
      i.alias_norm,
      ir.component_count,
      ir.components
    FROM target t
    LEFT JOIN intent i ON i.line_id = t.id
    LEFT JOIN intent_resolved ir ON ir.line_id = t.id
    LEFT JOIN scored s ON s.line_id = t.id
  ),
  applied AS (
    UPDATE public.estimate_line_items li
    SET
      unit_key = COALESCE(li.unit_key, r.unit_key),
      category_key = COALESCE(li.category_key, r.category_key),
      subcategory_key = COALESCE(li.subcategory_key, r.subcategory_key),
      trade_key = COALESCE(li.trade_key, r.trade_key),
      labor_hours = CASE WHEN COALESCE(li.labor_hours, 0) = 0 THEN r.labor_hours ELSE li.labor_hours END,
      labor_rate = CASE WHEN COALESCE(li.labor_rate, 0) = 0 THEN r.labor_rate ELSE li.labor_rate END,
      material_cost = CASE WHEN COALESCE(li.material_cost, 0) = 0 THEN r.material_cost ELSE li.material_cost END,
      overhead_pct = CASE WHEN COALESCE(li.overhead_pct, 0) = 0
        THEN COALESCE(r.default_overhead_pct, 0) ELSE li.overhead_pct END,
      profit_pct = CASE WHEN COALESCE(li.profit_pct, 0) = 0
        THEN COALESCE(r.suggested_profit_pct, 0) ELSE li.profit_pct END,
      catalog_item_key = COALESCE(li.catalog_item_key, r.assembly_key),
      catalog_mapping_source = COALESCE(li.catalog_mapping_source, 'auto'),
      pricing_source = 'knowledge_base',
      priced_at = now(),
      pricing_provenance = jsonb_strip_nulls(jsonb_build_object(
        'assemblyKey', r.assembly_key,
        'workItem', r.work_item,
        'origin', r.origin,
        'mappingSource', CASE WHEN li.catalog_mapping_source = 'contractor'
                              THEN 'contractor_confirmed' ELSE 'auto_match' END,
        'matchScore', r.score,
        'matchReason', r.reason,
        'intentAlias', r.alias_norm,
        'componentCount', r.component_count,
        'components', r.components,
        'isSampleData', r.is_sample_data,
        'quantity', COALESCE(li.quantity, 1),
        'unitKey', COALESCE(li.unit_key, r.unit_key),
        'computedLaborHours', r.labor_hours,
        'crewSizeApplied', false,
        'markupApplied', false,
        'materialFactor', v_mat_factor,
        'equipmentFactor', v_eq_factor,
        'pricing', v_prov
      ))
    FROM resolved r
    WHERE li.id = r.line_id AND r.priceable
    RETURNING 1
  ),
  missed AS (
    UPDATE public.estimate_line_items li
    SET pricing_source = 'unmatched',
        priced_at = now(),
        pricing_provenance = jsonb_strip_nulls(jsonb_build_object(
          'reason', r.review_reason,
          'reviewNote', r.review_note,
          'intentAlias', r.alias_norm,
          'candidateAssemblyKey', r.assembly_key,
          'candidateWorkItem', r.work_item,
          'candidateScore', r.score,
          'candidateReason', r.reason,
          'minimumScore', v_min_score))
    FROM resolved r
    WHERE li.id = r.line_id AND NOT r.priceable
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM applied), (SELECT count(*) FROM missed)
    INTO v_priced, v_unmatched;

  PERFORM set_config('vw.kb_pricing', 'off', true);

  RETURN jsonb_build_object(
    'priced', v_priced,
    'unmatched', v_unmatched,
    'isSampleData', true,
    'provenance', v_prov);
END
$function$;
