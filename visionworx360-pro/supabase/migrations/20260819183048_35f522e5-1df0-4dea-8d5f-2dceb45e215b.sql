ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS pricing_engine_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_repriced_at timestamptz;

COMMENT ON COLUMN public.estimates.pricing_engine_version IS
  'Pricing/catalog engine version the persisted line items were produced by. 0 = legacy/unknown.';

-- Patch kb_apply_pricing in place: 'unmatched' becomes a retryable outcome and
-- manual contractor authority is excluded from every repricing pass.
DO $do$
DECLARE
  d text;
  old_clause text := 'AND (NOT _only_new OR li.pricing_source IS NULL)';
  new_clause text :=
    'AND COALESCE(li.pricing_source, '''') NOT IN (''contractor'', ''manual'')
      AND (_only_new OR COALESCE(li.catalog_mapping_source, '''') <> ''contractor'')
      AND (NOT _only_new
           OR li.pricing_source IS NULL
           OR li.pricing_source = ''unmatched'')';
BEGIN
  SELECT pg_get_functiondef(oid) INTO d
  FROM pg_proc WHERE proname = 'kb_apply_pricing'
    AND pronamespace = 'public'::regnamespace;
  IF d IS NULL THEN RAISE EXCEPTION 'kb_apply_pricing not found'; END IF;
  IF position(old_clause IN d) = 0 THEN
    RAISE EXCEPTION 'kb_apply_pricing target filter not found; aborting patch';
  END IF;
  d := replace(d, old_clause, new_clause);
  EXECUTE d;
END
$do$;

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
  (1, 'temporary shoring', 'contains', 'framing.shoring.temporary', 1, 'temporary support', 100, NULL, NULL),
  (1, 'temporary support', 'contains', 'framing.shoring.temporary', 1, 'temporary support', 100, NULL, NULL),
  (1, 'shoring', 'contains', 'framing.shoring.temporary', 1, 'temporary support', 80, NULL, NULL),
  (1, 'structural engineering', 'contains', 'specialty.engineering.stamp', 1, 'engineering allowance', 100, NULL, NULL),
  (1, 'engineer detail', 'contains', 'specialty.engineering.stamp', 1, 'engineering allowance', 100, NULL, NULL),
  (1, 'engineered detail', 'contains', 'specialty.engineering.stamp', 1, 'engineering allowance', 100, NULL, NULL),
  (1, 'drywall wrap beam', 'contains', 'drywall.beam.wrap', 1, 'drywall beam wrap', 100, NULL, NULL),
  (1, 'drywall beam wrap', 'contains', 'drywall.beam.wrap', 1, 'drywall beam wrap', 100, NULL, NULL),
  (1, 'wrap beam', 'contains', 'trim.beam.wrap', 1, 'beam wrap', 85, NULL, NULL),
  (1, 'beam wrap', 'contains', 'trim.beam.wrap', 1, 'beam wrap', 85, NULL, NULL),
  (1, 'boxed beam', 'contains', 'trim.beam.wrap', 1, 'beam wrap', 100, NULL, NULL),
  (1, 'wrap column', 'contains', 'trim.column.wrap', 1, 'column wrap', 100, NULL, NULL),
  (1, 'column wrap', 'contains', 'trim.column.wrap', 1, 'column wrap', 100, NULL, NULL),
  (1, 'wrap post', 'contains', 'trim.column.wrap', 1, 'post wrap', 100, NULL, NULL),
  (1, 'post wrap', 'contains', 'trim.column.wrap', 1, 'post wrap', 100, NULL, NULL),
  (1, 'built in bookcase', 'contains', 'trim.bookcase.builtin', 1, 'built-in casework', 100, NULL, NULL),
  (1, 'bookcase', 'contains', 'trim.bookcase.builtin', 1, 'built-in casework', 80, NULL, NULL),
  (1, 'built in shelving', 'contains', 'trim.bookcase.builtin', 1, 'built-in casework', 100, NULL, NULL),
  (1, 'decorative molding', 'contains', 'trim.molding.decorative', 1, 'decorative molding', 100, NULL, NULL),
  (1, 'panel molding', 'contains', 'trim.molding.decorative', 1, 'decorative molding', 100, NULL, NULL),
  (1, 'chair rail', 'contains', 'trim.molding.decorative', 1, 'decorative molding', 100, NULL, NULL),
  (1, 'remove bearing wall', 'contains', 'demo.wall.bearing', 1, 'bearing wall demo', 100, NULL, NULL),
  (1, 'bearing wall demo', 'contains', 'demo.wall.bearing', 1, 'bearing wall demo', 100, NULL, NULL),
  (1, 'load bearing wall', 'contains', 'demo.wall.bearing', 1, 'bearing wall demo', 85, NULL, NULL),
  (1, 'structural opening', 'contains', 'demo.wall.bearing', 1, 'bearing wall demo', 80, NULL, NULL),
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
  (1, 'upper cabinets', 'contains', 'cabinets.wall.install', 1, 'wall cabinets', 92, NULL, NULL),
  (1, 'wall cabinets', 'contains', 'cabinets.wall.install', 1, 'wall cabinets', 92, NULL, NULL),
  (1, 'upper cabinetry', 'contains', 'cabinets.wall.install', 1, 'wall cabinets', 92, NULL, NULL),
  (1, 'wall cabinetry', 'contains', 'cabinets.wall.install', 1, 'wall cabinets', 92, NULL, NULL),
  (1, 'base cabinets', 'contains', 'cabinets.base.install', 1, 'base cabinets', 92, NULL, NULL),
  (1, 'lower cabinets', 'contains', 'cabinets.base.install', 1, 'base cabinets', 92, NULL, NULL),
  (1, 'base cabinetry', 'contains', 'cabinets.base.install', 1, 'base cabinets', 92, NULL, NULL),
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
  (1, 'relocate existing device or circuit', 'contains', 'electrical.device.relocate', 1, 'device relocation', 95, NULL, NULL),
  (1, 'relocate electrical device', 'contains', 'electrical.device.relocate', 1, 'device relocation', 95, NULL, NULL),
  (1, 'relocate receptacle', 'contains', 'electrical.device.relocate', 1, 'device relocation', 92, NULL, NULL),
  (1, 'relocate outlet', 'contains', 'electrical.device.relocate', 1, 'device relocation', 92, NULL, NULL),
  (1, 'relocate switch', 'contains', 'electrical.device.relocate', 1, 'device relocation', 92, NULL, NULL),
  (1, 'move receptacle', 'contains', 'electrical.device.relocate', 1, 'device relocation', 92, NULL, NULL),
  (1, 'move outlet', 'contains', 'electrical.device.relocate', 1, 'device relocation', 92, NULL, NULL),
  (1, 'receptacle relocation', 'contains', 'electrical.device.relocate', 1, 'device relocation', 92, NULL, NULL),
  (1, 'outlet relocation', 'contains', 'electrical.device.relocate', 1, 'device relocation', 92, NULL, NULL),
  (1, 'new circuits outlets lighting', 'contains', NULL, 1, NULL, 100, 'ambiguous_multi_scope', 'Split into circuits, receptacles and fixtures with counts so each can be priced.'),
  (1, 'hvac relocation', 'contains', 'hvac.relocate.equipment', 1, 'HVAC relocation', 100, NULL, NULL)
ON CONFLICT (library_version, alias_norm, COALESCE(assembly_key, '')) DO UPDATE SET
  match_kind = EXCLUDED.match_kind,
  quantity_factor = EXCLUDED.quantity_factor,
  role = EXCLUDED.role,
  priority = EXCLUDED.priority,
  review_reason = EXCLUDED.review_reason,
  note = EXCLUDED.note;
