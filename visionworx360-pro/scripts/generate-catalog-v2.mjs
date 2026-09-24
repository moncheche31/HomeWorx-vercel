/**
 * Residential Core Estimating Knowledge Base — Library v2 generator.
 *
 * Emits supabase/seed/knowledge-base-v2.sql: the NEW curated assemblies added
 * on top of Library v1 (v1 rows are copied forward by the migration, so v2 is
 * a superset and existing estimate provenance keeps resolving).
 *
 * All money is a structurally valid SAMPLE allowance (is_sample_data = true),
 * never licensed cost data. Productivity is expressed with an explicit
 * convention so no labor-producing assembly is left to guesswork.
 *
 * Regenerate: node scripts/generate-catalog-v2.mjs
 */
import { writeFileSync } from "node:fs";

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => (!a || a.length === 0 ? "'{}'" : `ARRAY[${a.map((x) => q(x)).join(",")}]::text[]`);
const num = (n) => (n === null || n === undefined ? "NULL" : String(n));
const b = (v) => (v ? "true" : "false");

/** tradeKey -> [crewSize, skillLevel, wasteFactor, equipment, safety] */
const TRADE = {
  general_conditions: [1, "general_labor", 0, "Trucks, barriers, containment, dumpsters", "General jobsite safety, housekeeping"],
  demolition: [2, "general_labor", 0, "Dumpster, dollies, hand demo tools", "Dust containment, respirator, verify utilities de-energized"],
  framing: [2, "carpenter", 0.1, "Compressor, nailers, circular saw, laser level", "Fall protection, saw safety, temporary bracing"],
  drywall: [2, "drywall_finisher", 0.1, "Drywall lift, stilts, sanding vac", "Silica dust control, ladder/stilt safety"],
  painting: [2, "painter", 0.05, "Sprayer, ladders, masking, drop cloths", "Ventilation, VOC exposure, lead-safe practices pre-1978"],
  flooring: [2, "flooring_installer", 0.1, "Saws, trowels, roller, knee pads", "Silica dust, adhesive fumes, kneeling ergonomics"],
  tile: [2, "tile_setter", 0.12, "Wet saw, trowels, mixers, levelling system", "Silica dust, wet work, kneeling ergonomics"],
  trim: [1, "finish_carpenter", 0.1, "Miter saw, brad nailer, coping tools", "Saw safety, dust control"],
  doors: [2, "carpenter", 0.05, "Shims, levels, router jig", "Lifting hazards, pinch points"],
  windows: [2, "carpenter", 0.05, "Ladders, pry bars, caulk guns", "Fall protection, glass handling"],
  cabinetry: [2, "cabinet_installer", 0.05, "Cabinet jacks, levels, clamps", "Lifting hazards, anchoring into structure"],
  countertops: [2, "fabricator", 0.05, "Suction lifters, seam setters", "Heavy slab lifting, silica dust"],
  roofing: [3, "roofer", 0.1, "Roof jacks, harnesses, nail guns, dumpster", "Fall protection required, heat exposure"],
  siding: [2, "siding_installer", 0.1, "Scaffold, brake, snips, nailers", "Fall protection, ladder safety"],
  gutters: [2, "gutter_installer", 0.05, "Gutter machine, ladders, rivet tools", "Fall protection, ladder placement"],
  decks: [2, "carpenter", 0.1, "Post hole digger, saws, levels", "Utility locate, fall protection"],
  masonry: [2, "mason", 0.1, "Mixer, saws, scaffold", "Silica dust, heavy lifting, scaffold safety"],
  concrete: [3, "concrete_finisher", 0.05, "Mixer/pump, screed, float, saw", "Chemical burns, silica dust, back strain"],
  landscaping: [2, "general_labor", 0.05, "Skid steer, compactor, hand tools", "Utility locate, equipment safety"],
  plumbing: [1, "licensed_plumber", 0.05, "Press tools, torch, drain machine", "Hot work permit, water shutoff"],
  electrical: [1, "licensed_electrician", 0.05, "Meters, benders, fish tape", "Lockout/tagout, arc flash, verify de-energized"],
  hvac: [2, "hvac_technician", 0.05, "Recovery machine, gauges, brazing kit", "Refrigerant handling, hot work"],
  insulation: [2, "insulation_installer", 0.05, "Blower, staple guns", "Respirator, skin protection"],
  specialty: [2, "general_contractor", 0.05, "Varies by scope", "Site-specific hazard review required"],
  handyman: [1, "handyman", 0.05, "Standard hand and power tools", "General jobsite safety"],
};

/**
 * Geometry kinds a quantity may legitimately be derived from. `null` means the
 * quantity can NEVER come from project geometry — it needs a count or a
 * task-specific measurement.
 */
const GEO = {
  floor: "floor_area",
  wall: "wall_area",
  ceiling: "ceiling_area",
  perimeter: "perimeter_lf",
  partition: "partition_lf",
  roof: "roof_area",
  facade: "facade_area",
  none: null,
};

const GROUPS = [];
/**
 * @param opts.costBasis  task_cost_basis enum value (default labor_production)
 * @param opts.convention hours_per_unit | units_per_hour | total_hours | none
 * @param opts.tier       finish tier scales the material allowance
 * @param opts.composite  assembly stands for several materially different parts
 * @param opts.allowance  eligible to price as a disclosed ballpark allowance
 */
const add = (categoryKey, tradeKey, subcategoryKey, items, opts = {}) =>
  GROUPS.push({ categoryKey, tradeKey, subcategoryKey, items, opts });

/* item = [key, workItem, unit, hoursPerUnit, materialAllowance, measurement, keywords[], geometry?, setupHours?] */

/* ============ A. GENERAL CONDITIONS / JOB ECONOMICS ============ */
add("general_conditions", "general_conditions", "mobilization", [
  ["gc.mobilization.crew", "Crew mobilization and daily setup", "day", 1.5, 25, "Working days on site", ["mobilization", "setup", "start up", "load in"], GEO.none],
  ["gc.servicecall.minimum", "Service call minimum — small job", "each", 2, 0, "One per small job", ["service call", "minimum", "trip charge", "small job"], GEO.none],
  ["gc.supervision.daily", "Site supervision and coordination", "day", 1, 0, "Working days on site", ["supervision", "coordination", "project management"], GEO.none],
  ["gc.protection.floorpath", "Protect floors and travel paths", "square_foot", 0.004, 0.18, "Protected area", ["protection", "ram board", "masking", "cover"], GEO.floor],
  ["gc.protection.dustwall", "Temporary dust containment partition", "square_foot", 0.02, 0.65, "Barrier area", ["dust barrier", "containment", "zip wall", "poly"], GEO.none],
  ["gc.cleanup.daily", "Daily jobsite cleanup", "day", 0.75, 8, "Working days on site", ["cleanup", "broom clean", "housekeeping"], GEO.none],
  ["gc.cleanup.final", "Final cleaning before handover", "square_foot", 0.01, 0.06, "Finished floor area", ["final clean", "punch clean", "handover"], GEO.floor],
  ["gc.debris.handling", "Debris handling to dumpster", "cubic_yard", 0.6, 0, "Estimated debris yardage", ["debris", "haul", "load out"], GEO.none],
]);
add("general_conditions", "general_conditions", "equipment_fees", [
  ["gc.dumpster.20yd", "Dumpster — 20 yard haul and disposal", "each", 0, 545, "Count of pulls", ["dumpster", "roll off", "disposal"], GEO.none],
  ["gc.dumpster.10yd", "Dumpster — 10 yard haul and disposal", "each", 0, 395, "Count of pulls", ["dumpster", "roll off", "small dumpster"], GEO.none],
  ["gc.portable.toilet", "Portable toilet rental", "each", 0, 185, "Rental months", ["porta potty", "portable toilet", "sanitation"], GEO.none],
  ["gc.equipment.rental", "General equipment rental allowance", "each", 0, 250, "Rental units", ["rental", "equipment", "lift", "scaffold"], GEO.none],
  ["gc.temp.power", "Temporary power and lighting", "each", 0, 165, "Per job", ["temporary power", "temp light", "generator"], GEO.none],
], { costBasis: "equipment", convention: "none" });
add("general_conditions", "general_conditions", "permits", [
  ["permits.demolition.fee", "Demolition permit fee", "each", 0, 185, "Count of permits", ["permit", "demolition permit"], GEO.none],
  ["permits.roofing.fee", "Roofing permit fee", "each", 0, 235, "Count of permits", ["permit", "roof permit"], GEO.none],
  ["permits.zoning.review", "Zoning or HOA review fee", "each", 0, 275, "Count of reviews", ["zoning", "hoa", "architectural review"], GEO.none],
  ["permits.plan.review", "Plan review fee", "each", 0, 325, "Count of reviews", ["plan review", "submittal"], GEO.none],
], { costBasis: "permit_fee", convention: "none" });

/* ============ B. DEMOLITION ============ */
add("demo", "demolition", "interior", [
  ["demo.ceiling.drywall", "Demo ceiling drywall and furring", "square_foot", 0.018, 0.03, "Ceiling area", ["demo ceiling", "tear out ceiling"], GEO.ceiling],
  ["demo.plaster.walls", "Demo plaster and lath walls", "square_foot", 0.028, 0.04, "Wall area", ["plaster", "lath", "demo"], GEO.wall],
  ["demo.flooring.vinyl", "Demo sheet vinyl or VCT flooring", "square_foot", 0.012, 0.02, "Floor area", ["demo vinyl", "vct", "sheet vinyl"], GEO.floor],
  ["demo.flooring.laminate", "Demo laminate or LVP flooring", "square_foot", 0.01, 0.02, "Floor area", ["demo laminate", "demo lvp", "click floor"], GEO.floor],
  ["demo.tile.wall", "Demo wall tile and backer", "square_foot", 0.045, 0.05, "Tiled wall area", ["demo wall tile", "tear out tile", "shower tile demo"], GEO.none],
  ["demo.countertop.remove", "Remove countertops", "linear_foot", 0.15, 0.05, "LF of countertop", ["remove countertop", "countertop demo"], GEO.none],
  ["demo.vanity.remove", "Remove vanity and top", "each", 1.25, 0.1, "Count", ["remove vanity", "vanity demo"], GEO.none],
  ["demo.toilet.remove", "Remove toilet", "each", 0.5, 0.05, "Count", ["remove toilet", "pull toilet"], GEO.none],
  ["demo.window.remove", "Remove existing window", "each", 1, 0.1, "Count", ["remove window", "window demo"], GEO.none],
  ["demo.ceiling.acoustic", "Remove suspended acoustic ceiling", "square_foot", 0.012, 0.02, "Ceiling area", ["drop ceiling", "acoustic tile", "grid ceiling"], GEO.ceiling],
  ["demo.selective.interior", "Selective interior demolition", "hour", 1, 3, "Crew hours", ["selective demo", "cut and patch demo"], GEO.none],
  ["demo.insulation.remove", "Remove existing insulation", "square_foot", 0.01, 0.02, "Area", ["remove insulation", "insulation demo"], GEO.none],
  ["demo.subfloor.remove", "Remove damaged subfloor", "square_foot", 0.03, 0.05, "Floor area", ["subfloor demo", "remove subfloor"], GEO.floor],
  ["demo.stair.remove", "Remove existing stair", "each", 6, 1, "Count of stair runs", ["stair demo", "remove stairs"], GEO.none],
]);
add("demo", "demolition", "exterior", [
  ["demo.roof.tearoff", "Tear off asphalt roofing — one layer", "square_foot", 0.012, 0.05, "Roof area", ["tear off", "roof demo", "strip shingles"], GEO.roof],
  ["demo.siding.remove", "Remove existing siding", "square_foot", 0.018, 0.04, "Facade area", ["siding demo", "remove siding"], GEO.facade],
  ["demo.deck.remove", "Demolish existing deck", "square_foot", 0.05, 0.1, "Deck area", ["deck demo", "remove deck"], GEO.none],
  ["demo.concrete.slab", "Break out and remove concrete slab", "square_foot", 0.09, 0.35, "Slab area", ["concrete demo", "break out slab", "saw cut"], GEO.none],
  ["demo.fence.remove", "Remove existing fence", "linear_foot", 0.1, 0.15, "LF of fence", ["fence demo", "remove fence"], GEO.none],
  ["demo.gutter.remove", "Remove gutters and downspouts", "linear_foot", 0.03, 0.02, "LF of gutter", ["gutter demo", "remove gutters"], GEO.none],
]);
add("demo", "demolition", "structural_review", [
  ["demo.wall.bearing.review", "Remove bearing wall — engineered review required", "linear_foot", 1.1, 6, "LF of bearing wall", ["bearing wall", "load bearing", "structural demo"], GEO.none],
], { allowance: false });

/* ============ C. FRAMING / ROUGH CARPENTRY ============ */
add("framing", "framing", "walls", [
  ["framing.wall.partition.2x4", "Frame 2x4 interior partition", "linear_foot", 0.35, 12, "LF of wall", ["partition", "frame wall", "2x4 wall", "stud wall"], GEO.partition],
  ["framing.wall.partition.2x6", "Frame 2x6 interior partition", "linear_foot", 0.4, 16, "LF of wall", ["2x6 partition", "plumbing wall"], GEO.partition],
  ["framing.wall.knee", "Frame knee wall or pony wall", "linear_foot", 0.3, 9, "LF of wall", ["knee wall", "pony wall", "half wall"], GEO.none],
  ["framing.wall.curved", "Frame curved or radius wall", "linear_foot", 0.85, 26, "LF of wall", ["curved wall", "radius wall"], GEO.none],
  ["framing.soffit.build", "Build framed soffit or bulkhead", "linear_foot", 0.28, 8, "LF of soffit", ["soffit", "bulkhead", "drop soffit"], GEO.none],
  ["framing.furring.wall", "Furring on masonry or concrete wall", "square_foot", 0.02, 1.2, "Wall area", ["furring", "strapping", "basement wall"], GEO.wall],
]);
add("framing", "framing", "floors", [
  ["framing.floor.platform", "Frame raised platform floor", "square_foot", 0.055, 8.5, "Platform area", ["platform floor", "raised floor", "sleepers"], GEO.floor],
  ["framing.floor.sleepers", "Install sleepers over slab", "square_foot", 0.025, 2.2, "Floor area", ["sleepers", "slab furring"], GEO.floor],
  ["framing.floor.sister", "Sister and reinforce floor joists", "linear_foot", 0.22, 5.5, "LF of joist repaired", ["sister joist", "joist repair", "reinforce"], GEO.none],
  ["framing.subfloor.replace", "Replace damaged subfloor sheathing", "square_foot", 0.03, 3.1, "Floor area", ["subfloor", "replace sheathing", "plywood"], GEO.floor],
]);
add("framing", "framing", "structural", [
  ["framing.beam.flush", "Install flush structural beam", "linear_foot", 1.05, 46, "LF of beam", ["flush beam", "structural beam", "carry beam"], GEO.none],
  ["framing.column.steel", "Install steel column and base", "each", 2.5, 210, "Count of columns", ["steel column", "lally", "post"], GEO.none],
  ["framing.header.exterior", "Frame exterior header and opening", "each", 2, 78, "Count of openings", ["exterior header", "rough opening"], GEO.none],
  ["framing.opening.enlarge", "Enlarge existing framed opening", "each", 3.25, 95, "Count of openings", ["enlarge opening", "widen opening"], GEO.none],
  ["framing.stair.build", "Frame interior stair run", "each", 12, 420, "Count of stair runs", ["stair framing", "stringers", "build stairs"], GEO.none],
  ["framing.roof.dormer", "Frame dormer structure", "each", 26, 1250, "Count of dormers", ["dormer", "roof framing"], GEO.none],
  ["framing.wall.exterior.new", "Frame new exterior 2x6 wall", "linear_foot", 0.48, 21, "LF of wall", ["exterior wall", "2x6 framing"], GEO.perimeter],
  ["framing.sheathing.wall", "Install exterior wall sheathing", "square_foot", 0.022, 2.1, "Wall area", ["sheathing", "osb", "zip"], GEO.facade],
]);

/* ============ D. DRYWALL / PLASTER ============ */
add("drywall", "drywall", "board", [
  ["drywall.hang.walls", "Hang 1/2 in drywall — walls", "square_foot", 0.016, 0.62, "Wall area", ["hang drywall", "sheetrock", "board walls"], GEO.wall],
  ["drywall.hang.ceiling", "Hang 5/8 in drywall — ceiling", "square_foot", 0.022, 0.78, "Ceiling area", ["hang ceiling", "5/8 board", "lid"], GEO.ceiling],
  ["drywall.hang.moisture", "Hang moisture-resistant board", "square_foot", 0.02, 0.95, "Area", ["green board", "moisture resistant", "wet area board"], GEO.none],
  ["drywall.hang.cementboard", "Hang cement backer board", "square_foot", 0.03, 1.65, "Area", ["cement board", "backer board", "durock"], GEO.none],
]);
add("drywall", "drywall", "finish", [
  ["drywall.finish.level4", "Tape and finish to Level 4", "square_foot", 0.02, 0.22, "Finished area", ["tape", "finish", "level 4", "mud"], GEO.wall],
  ["drywall.finish.level5", "Tape and finish to Level 5", "square_foot", 0.03, 0.34, "Finished area", ["level 5", "skim", "smooth finish"], GEO.wall],
  ["drywall.skimcoat.walls", "Skim coat existing walls", "square_foot", 0.024, 0.18, "Wall area", ["skim coat", "resurface wall"], GEO.wall],
  ["drywall.texture.knockdown", "Apply knockdown texture", "square_foot", 0.01, 0.12, "Area", ["texture", "knockdown", "orange peel"], GEO.none],
  ["drywall.cornerbead.install", "Install corner bead", "linear_foot", 0.05, 0.55, "LF of corner", ["corner bead", "outside corner"], GEO.none],
]);
add("drywall", "drywall", "repair", [
  ["drywall.patch.small", "Small drywall patch — up to 2 sf", "each", 1.25, 14, "Count of patches", ["small patch", "hole repair", "patch drywall"], GEO.none],
  ["drywall.patch.medium", "Medium drywall patch — up to 8 sf", "each", 2.25, 32, "Count of patches", ["patch", "drywall repair", "wall repair"], GEO.none],
  ["drywall.repair.measured", "Drywall repair — measured repair area", "square_foot", 0.09, 1.05, "Actual damaged/repair area only", ["drywall repair", "repair area", "damaged drywall"], GEO.none],
  ["drywall.ceiling.repair", "Ceiling drywall repair", "square_foot", 0.11, 1.15, "Actual repair area", ["ceiling repair", "water damage ceiling"], GEO.none],
  ["drywall.plaster.repair", "Plaster repair and re-key", "square_foot", 0.14, 1.4, "Actual repair area", ["plaster repair", "re-key plaster"], GEO.none],
]);

/* ============ E. PAINTING ============ */
add("painting", "painting", "interior", [
  ["painting.prime.ceiling", "Prime ceilings", "square_foot", 0.006, 0.16, "Ceiling area", ["prime ceiling", "primer"], GEO.ceiling],
  ["painting.ceiling.twocoat", "Paint ceilings — two coats", "square_foot", 0.011, 0.29, "Ceiling area", ["paint ceiling", "ceiling paint"], GEO.ceiling],
  ["painting.walls.onecoat", "Paint walls — one coat refresh", "square_foot", 0.007, 0.17, "Wall area", ["one coat", "refresh paint", "repaint walls"], GEO.wall],
  ["painting.accent.wall", "Paint accent wall", "square_foot", 0.012, 0.34, "Accent wall area", ["accent wall", "feature wall"], GEO.none],
  ["painting.trim.casing", "Paint door casing and trim", "linear_foot", 0.035, 0.28, "LF of trim", ["paint trim", "paint casing"], GEO.none],
  ["painting.door.each", "Paint door — both faces and edges", "each", 1.1, 16, "Count of doors", ["paint door", "door paint"], GEO.none],
  ["painting.cabinets.spray", "Prime and spray-finish cabinets", "linear_foot", 1.35, 34, "LF of cabinet run", ["paint cabinets", "cabinet refinish", "spray cabinets"], GEO.none],
  ["painting.stain.trim", "Stain and clear-coat trim", "linear_foot", 0.06, 0.65, "LF of trim", ["stain trim", "clear coat", "varnish"], GEO.none],
  ["painting.prep.patchsand", "Paint prep — patch, sand, caulk", "square_foot", 0.008, 0.09, "Prepped area", ["paint prep", "caulk", "sand", "patch"], GEO.wall],
  ["painting.closet.interior", "Paint closet interior", "each", 1.5, 18, "Count of closets", ["paint closet"], GEO.none],
  ["painting.stairs.railing", "Paint or finish stair railing", "linear_foot", 0.12, 1.1, "LF of railing", ["paint railing", "finish handrail"], GEO.none],
]);
add("painting", "painting", "exterior", [
  ["painting.exterior.siding", "Paint exterior siding — two coats", "square_foot", 0.014, 0.36, "Facade area", ["exterior paint", "paint siding"], GEO.facade],
  ["painting.exterior.trim", "Paint exterior trim and fascia", "linear_foot", 0.05, 0.42, "LF of trim", ["exterior trim paint", "fascia paint"], GEO.none],
  ["painting.deck.stain", "Clean and stain deck", "square_foot", 0.012, 0.31, "Deck area", ["deck stain", "seal deck"], GEO.none],
  ["painting.exterior.prep", "Exterior prep — scrape, wash, prime spots", "square_foot", 0.011, 0.14, "Facade area", ["exterior prep", "power wash", "scrape"], GEO.facade],
  ["painting.exterior.door", "Paint exterior door and jamb", "each", 1.6, 24, "Count of doors", ["paint exterior door"], GEO.none],
]);

/* ============ F. FLOORING ============ */
add("flooring", "flooring", "install", [
  ["flooring.lvp.install", "Install luxury vinyl plank", "square_foot", 0.03, 3.85, "Floor area", ["lvp", "vinyl plank", "luxury vinyl"], GEO.floor],
  ["flooring.laminate.install", "Install laminate flooring", "square_foot", 0.028, 3.15, "Floor area", ["laminate", "click flooring"], GEO.floor],
  ["flooring.hardwood.solid", "Install solid hardwood flooring", "square_foot", 0.05, 7.4, "Floor area", ["hardwood", "solid wood floor", "oak floor"], GEO.floor],
  ["flooring.hardwood.engineered", "Install engineered hardwood", "square_foot", 0.04, 6.1, "Floor area", ["engineered wood", "engineered hardwood"], GEO.floor],
  ["flooring.carpet.install", "Install carpet and pad", "square_foot", 0.02, 3.25, "Floor area", ["carpet", "pad", "broadloom"], GEO.floor],
  ["flooring.vinyl.sheet", "Install sheet vinyl", "square_foot", 0.03, 2.85, "Floor area", ["sheet vinyl", "linoleum"], GEO.floor],
  ["flooring.underlayment.install", "Install underlayment", "square_foot", 0.014, 0.85, "Floor area", ["underlayment", "sound mat"], GEO.floor],
  ["flooring.stair.treads", "Install finished stair treads and risers", "each", 1.1, 68, "Count of treads", ["stair treads", "risers"], GEO.none],
  ["flooring.transition.threshold", "Install transitions and thresholds", "each", 0.4, 26, "Count of transitions", ["transition", "threshold", "t-molding"], GEO.none],
]);
add("flooring", "flooring", "prep_repair", [
  ["flooring.prep.selflevel", "Self-leveling underlayment", "square_foot", 0.022, 1.55, "Floor area", ["self leveling", "floor leveling", "flatten floor"], GEO.floor],
  ["flooring.prep.grind", "Grind and prep slab", "square_foot", 0.018, 0.22, "Floor area", ["grind slab", "floor prep"], GEO.floor],
  ["flooring.refinish.sand", "Sand and refinish hardwood", "square_foot", 0.035, 1.95, "Floor area", ["refinish", "sand floors", "recoat"], GEO.floor],
  ["flooring.repair.board", "Repair or replace floor boards", "square_foot", 0.12, 6.5, "Actual repair area", ["floor repair", "replace boards"], GEO.none],
]);

/* ============ G. TILE / BATH SURFACES ============ */
add("tile", "tile", "wet_areas", [
  ["tile.shower.wall", "Install shower wall tile", "square_foot", 0.14, 8.9, "Shower wall area only", ["shower tile", "shower wall tile"], GEO.none],
  ["tile.shower.floor", "Install shower floor / mosaic tile", "square_foot", 0.26, 13.5, "Shower floor area only", ["shower floor tile", "mosaic", "shower pan tile"], GEO.none],
  ["tile.bath.floor", "Install bathroom floor tile", "square_foot", 0.1, 7.4, "Bathroom floor area", ["bathroom floor tile", "floor tile"], GEO.floor],
  ["tile.backsplash.kitchen", "Install kitchen backsplash tile", "square_foot", 0.16, 11.5, "Backsplash area", ["backsplash", "kitchen tile"], GEO.none],
  ["tile.largeformat.premium", "Large-format tile complexity add", "square_foot", 0.06, 1.6, "Large-format tiled area", ["large format", "big tile", "slab tile"], GEO.none],
  ["tile.waterproof.membrane", "Install waterproofing membrane system", "square_foot", 0.05, 3.2, "Wet-area surface", ["waterproofing", "kerdi", "redgard", "membrane"], GEO.none],
  ["tile.shower.pan.mud", "Build mud-set shower pan", "each", 5.5, 210, "Count of pans", ["shower pan", "mud pan", "pre-slope"], GEO.none],
  ["tile.shower.curb", "Build and waterproof shower curb", "linear_foot", 0.55, 22, "LF of curb", ["shower curb", "threshold curb"], GEO.none],
  ["tile.niche.install", "Install tiled shower niche", "each", 2.75, 95, "Count of niches", ["niche", "shampoo niche"], GEO.none],
  ["tile.grout.seal", "Grout and seal tile", "square_foot", 0.02, 0.5, "Tiled area", ["grout", "seal tile", "caulk tile"], GEO.none],
  ["tile.schluter.trim", "Install tile edge trim / profile", "linear_foot", 0.09, 4.2, "LF of edge", ["schluter", "tile trim", "edge profile"], GEO.none],
  ["tile.floor.heat", "Install electric floor heat mat under tile", "square_foot", 0.05, 9.5, "Heated floor area", ["floor heat", "heated floor", "ditra heat"], GEO.floor],
]);

/* ============ H. PLUMBING ============ */
add("plumbing", "plumbing", "connections", [
  ["plumbing.shutoff.angle", "Install angle stop / shutoff valve", "each", 0.5, 22, "Count of valves", ["shutoff", "angle stop", "valve"], GEO.none],
  ["plumbing.supply.line", "Install fixture supply line", "each", 0.35, 16, "Count of supply lines", ["supply line", "riser", "braided line"], GEO.none],
  ["plumbing.trap.assembly", "Install P-trap and drain assembly", "each", 0.6, 34, "Count of drains", ["p-trap", "drain assembly", "tailpiece"], GEO.none],
]);
add("plumbing", "plumbing", "fixtures", [
  ["plumbing.toilet.set", "Set toilet with wax seal and stops", "each", 1.5, 285, "Count of toilets", ["toilet", "water closet", "set toilet"], GEO.none],
  ["plumbing.lav.set", "Set lavatory sink and faucet", "each", 1.75, 265, "Count of lavatories", ["lavatory", "bathroom sink", "lav sink"], GEO.none],
  ["plumbing.kitchen.sink", "Set kitchen sink and faucet", "each", 2.25, 425, "Count of sinks", ["kitchen sink", "undermount sink"], GEO.none],
  ["plumbing.faucet.replace", "Replace faucet", "each", 1.25, 175, "Count of faucets", ["faucet", "replace faucet"], GEO.none],
  ["plumbing.disposal.install", "Install garbage disposal", "each", 1.25, 165, "Count", ["disposal", "garbage disposal"], GEO.none],
  ["plumbing.dishwasher.connect", "Connect dishwasher", "each", 1.25, 45, "Count", ["dishwasher hookup", "dishwasher connect"], GEO.none],
  ["plumbing.tub.set", "Set bathtub", "each", 4.5, 720, "Count of tubs", ["set tub", "bathtub install"], GEO.none],
  ["plumbing.shower.valve", "Install shower/tub valve and trim", "each", 2.25, 245, "Count of valves", ["shower valve", "mixing valve", "trim kit"], GEO.none],
  ["plumbing.showerhead.install", "Install shower head and arm", "each", 0.5, 85, "Count", ["shower head", "rain head"], GEO.none],
  ["plumbing.hosebib.install", "Install frost-free hose bib", "each", 1.25, 68, "Count", ["hose bib", "spigot", "sillcock"], GEO.none],
  ["plumbing.laundry.box", "Install laundry supply box and drain", "each", 2.5, 125, "Count", ["laundry box", "washer hookup"], GEO.none],
  ["plumbing.waterheater.tank", "Install tank water heater", "each", 5, 1250, "Count", ["water heater", "tank heater"], GEO.none],
  ["plumbing.waterheater.tankless", "Install tankless water heater", "each", 8, 2350, "Count", ["tankless", "on demand water heater"], GEO.none],
]);
add("plumbing", "plumbing", "rough_in", [
  ["plumbing.dwv.rough", "Rough drain, waste and vent for fixture", "each", 3.5, 165, "Count of fixtures roughed", ["dwv", "drain rough", "vent rough"], GEO.none],
  ["plumbing.water.rough", "Rough hot and cold water to fixture", "each", 2.5, 115, "Count of fixtures roughed", ["water rough", "supply rough", "pex"], GEO.none],
  ["plumbing.fixture.relocate", "Relocate plumbing fixture rough-in", "each", 5, 210, "Count of fixtures moved", ["relocate fixture", "move sink", "move toilet"], GEO.none],
  ["plumbing.gas.line", "Run gas line to appliance", "linear_foot", 0.25, 12, "LF of gas pipe", ["gas line", "gas pipe"], GEO.none],
]);
add("plumbing", "plumbing", "composite_allowance", [
  ["plumbing.bath.connections.allowance", "Bathroom fixture connection package — allowance", "each", 4.5, 210, "One per bathroom until fixture counts are confirmed", ["shutoffs", "supply lines", "fixture connections", "hook up fixtures"], GEO.none],
  ["plumbing.kitchen.connections.allowance", "Kitchen plumbing connection package — allowance", "each", 4, 245, "One per kitchen until fixture counts are confirmed", ["kitchen plumbing", "sink hookups"], GEO.none],
], { costBasis: "allowance", composite: true });

/* ============ I. ELECTRICAL ============ */
add("electrical", "electrical", "devices", [
  ["electrical.receptacle.standard", "Install standard receptacle", "each", 0.6, 24, "Count of receptacles", ["receptacle", "outlet", "plug"], GEO.none],
  ["electrical.receptacle.gfci", "Install GFCI receptacle", "each", 0.7, 42, "Count of GFCI devices", ["gfci", "ground fault"], GEO.none],
  ["electrical.switch.single", "Install switch", "each", 0.55, 22, "Count of switches", ["switch", "toggle"], GEO.none],
  ["electrical.switch.dimmer", "Install dimmer switch", "each", 0.65, 38, "Count of dimmers", ["dimmer"], GEO.none],
  ["electrical.smoke.co", "Install smoke / CO detector", "each", 0.75, 58, "Count of detectors", ["smoke detector", "co detector", "alarm"], GEO.none],
  ["electrical.device.exterior", "Install exterior weather-resistant device", "each", 0.85, 52, "Count of devices", ["exterior outlet", "weatherproof outlet"], GEO.none],
]);
add("electrical", "electrical", "lighting", [
  ["electrical.light.recessed", "Install recessed LED downlight", "each", 0.9, 62, "Count of lights", ["recessed light", "can light", "downlight"], GEO.none],
  ["electrical.light.surface", "Install surface or pendant light fixture", "each", 0.85, 95, "Count of fixtures", ["light fixture", "pendant", "flush mount"], GEO.none],
  ["electrical.light.vanity", "Install vanity light fixture", "each", 0.85, 115, "Count of fixtures", ["vanity light", "bath light"], GEO.none],
  ["electrical.fan.ceiling", "Install ceiling fan with brace", "each", 1.75, 185, "Count of fans", ["ceiling fan", "paddle fan"], GEO.none],
  ["electrical.light.undercabinet", "Install under-cabinet lighting", "linear_foot", 0.2, 26, "LF of cabinet run receiving light", ["under cabinet light", "undercabinet lighting", "task light"], GEO.none],
  ["electrical.light.exterior", "Install exterior light fixture", "each", 1, 125, "Count of fixtures", ["exterior light", "sconce", "flood light"], GEO.none],
]);
add("electrical", "electrical", "circuits", [
  ["electrical.circuit.new", "Run new branch circuit", "each", 2.5, 95, "Count of circuits", ["new circuit", "branch circuit", "run circuit"], GEO.none],
  ["electrical.circuit.appliance", "Run dedicated appliance circuit", "each", 3, 135, "Count of circuits", ["dedicated circuit", "appliance circuit", "240v"], GEO.none],
  ["electrical.circuit.extend", "Extend existing circuit", "each", 1.5, 45, "Count of extensions", ["extend circuit", "tap circuit"], GEO.none],
  ["electrical.panel.breaker", "Install breaker in existing panel", "each", 0.75, 55, "Count of breakers", ["breaker", "panel breaker"], GEO.none],
  ["electrical.panel.subpanel", "Install subpanel and feeder", "each", 8, 685, "Count of panels", ["subpanel", "feeder", "load center"], GEO.none],
  ["electrical.panel.upgrade", "Service panel upgrade — 200A", "each", 14, 1850, "Count of services", ["panel upgrade", "service upgrade", "200 amp"], GEO.none],
  ["electrical.lowvoltage.run", "Run low-voltage / data cabling", "each", 1, 38, "Count of drops", ["low voltage", "data drop", "cat6", "coax"], GEO.none],
]);
add("electrical", "electrical", "composite_allowance", [
  ["electrical.room.package.allowance", "Room electrical package — circuits, devices and lighting allowance", "each", 9, 425, "One per room until device counts are confirmed", ["new circuits outlets lighting", "electrical package", "wire room"], GEO.none],
  ["electrical.bath.package.allowance", "Bathroom electrical package — allowance", "each", 6.5, 310, "One per bathroom until device counts are confirmed", ["bathroom electrical", "bath circuits"], GEO.none],
  ["electrical.kitchen.package.allowance", "Kitchen electrical package — allowance", "each", 12, 685, "One per kitchen until device counts are confirmed", ["kitchen electrical", "kitchen circuits"], GEO.none],
], { costBasis: "allowance", composite: true });

/* ============ J. HVAC ============ */
add("hvac", "hvac", "distribution", [
  ["hvac.supply.extend", "Extend supply duct run and register", "each", 3, 145, "Count of supply runs", ["supply duct", "extend duct", "register"], GEO.none],
  ["hvac.return.add", "Add return air drop", "each", 3.5, 165, "Count of returns", ["return air", "return duct"], GEO.none],
  ["hvac.register.relocate", "Relocate register or grille", "each", 1.5, 45, "Count of registers", ["relocate register", "move vent"], GEO.none],
  ["hvac.duct.modify", "Modify existing ductwork", "hour", 1, 22, "Crew hours", ["duct modification", "reroute duct"], GEO.none],
  ["hvac.bathfan.install", "Install bath exhaust fan and duct to exterior", "each", 3, 185, "Count of fans", ["bath fan", "exhaust fan", "ventilation fan"], GEO.none],
  ["hvac.rangehood.vent", "Vent range hood to exterior", "each", 3.5, 165, "Count of hoods", ["range hood vent", "kitchen exhaust"], GEO.none],
  ["hvac.dryer.vent", "Install dryer vent to exterior", "each", 2, 85, "Count of vents", ["dryer vent"], GEO.none],
]);
add("hvac", "hvac", "equipment", [
  ["hvac.minisplit.single", "Install single-zone mini-split", "each", 10, 2450, "Count of systems", ["mini split", "ductless", "heat pump head"], GEO.none],
  ["hvac.thermostat.install", "Install programmable thermostat", "each", 1, 165, "Count", ["thermostat", "stat"], GEO.none],
  ["hvac.equipment.relocate", "Relocate HVAC equipment", "each", 8, 285, "Count of units", ["relocate furnace", "move air handler"], GEO.none],
  ["hvac.linehide.exterior", "Install refrigerant line set and cover", "linear_foot", 0.2, 14, "LF of line set", ["line set", "line hide", "refrigerant line"], GEO.none],
]);

/* ============ K. INSULATION / AIR SEALING ============ */
add("insulation", "insulation", "thermal", [
  ["insulation.batt.floorjoist", "Batt insulation between floor joists", "square_foot", 0.014, 1.05, "Floor area", ["floor insulation", "joist batt", "crawlspace insulation"], GEO.floor],
  ["insulation.rigid.foam", "Install rigid foam board insulation", "square_foot", 0.02, 1.55, "Area", ["rigid foam", "foam board", "xps"], GEO.none],
  ["insulation.spray.allowance", "Spray foam insulation — allowance", "square_foot", 0.025, 2.65, "Area", ["spray foam", "closed cell", "open cell"], GEO.none],
  ["insulation.rimjoist.seal", "Insulate and seal rim joists", "linear_foot", 0.09, 3.1, "LF of rim", ["rim joist", "band joist"], GEO.none],
  ["insulation.airseal.package", "Air sealing — penetrations and plates", "square_foot", 0.006, 0.16, "Area treated", ["air sealing", "caulk plates", "foam penetrations"], GEO.none],
  ["insulation.sound.batt", "Install sound-attenuation batt", "square_foot", 0.013, 1.15, "Wall or ceiling area", ["sound insulation", "acoustic batt", "safe and sound"], GEO.wall],
  ["insulation.vapor.barrier", "Install vapor retarder", "square_foot", 0.006, 0.22, "Area", ["vapor barrier", "poly", "vapor retarder"], GEO.none],
  ["insulation.attic.blown", "Blown-in attic insulation", "square_foot", 0.01, 1.35, "Attic floor area", ["blown insulation", "attic insulation", "cellulose"], GEO.ceiling],
]);

/* ============ L. DOORS / WINDOWS ============ */
add("doors", "doors", "interior", [
  ["doors.interior.prehung.install", "Install interior prehung door", "each", 1.75, 245, "Count of doors", ["prehung door", "interior door"], GEO.none],
  ["doors.interior.slab", "Hang interior slab door", "each", 2.25, 185, "Count of doors", ["slab door", "hang door"], GEO.none],
  ["doors.bifold.install", "Install bifold or bypass closet door", "each", 1.5, 195, "Count of openings", ["bifold", "bypass door", "closet door"], GEO.none],
  ["doors.pocket.install", "Install pocket door and frame", "each", 4.5, 385, "Count of doors", ["pocket door"], GEO.none],
  ["doors.barn.install", "Install barn door and track", "each", 2.5, 425, "Count of doors", ["barn door", "sliding door hardware"], GEO.none],
  ["doors.hardware.install", "Install door hardware / lockset", "each", 0.5, 68, "Count of doors", ["lockset", "door hardware", "knob", "handleset"], GEO.none],
  ["doors.adjust.repair", "Adjust and repair binding door", "each", 0.75, 12, "Count of doors", ["door adjustment", "door sticks", "plane door"], GEO.none],
]);
add("doors", "doors", "exterior", [
  ["doors.entry.install", "Install exterior entry door unit", "each", 5, 1250, "Count of doors", ["entry door", "exterior door"], GEO.none],
  ["doors.patio.slider", "Install patio slider or french door", "each", 6.5, 1850, "Count of units", ["patio door", "slider", "french door"], GEO.none],
  ["doors.storm.install", "Install storm door", "each", 2.5, 345, "Count of doors", ["storm door"], GEO.none],
  ["doors.weatherproof.flash", "Flash and weatherproof door opening", "each", 1.5, 65, "Count of openings", ["flashing", "weatherproof", "sill pan"], GEO.none],
]);
add("windows", "windows", "install", [
  ["windows.replace.insert", "Replace window — insert unit", "each", 3, 685, "Count of windows", ["replace window", "insert window"], GEO.none],
  ["windows.newconstruction.install", "Install new-construction window", "each", 4.5, 745, "Count of windows", ["new window", "nail fin window"], GEO.none],
  ["windows.egress.install", "Install egress window and well", "each", 14, 2150, "Count of windows", ["egress window", "basement egress"], GEO.none],
  ["windows.opening.resize", "Resize window rough opening", "each", 5, 210, "Count of openings", ["resize opening", "window reframe"], GEO.none],
  ["windows.trim.exterior", "Trim and flash window exterior", "each", 2, 125, "Count of windows", ["window trim", "window flashing"], GEO.none],
  ["windows.sill.interior", "Install interior sill and apron", "each", 1, 58, "Count of windows", ["window sill", "stool and apron"], GEO.none],
]);

/* ============ M. FINISH CARPENTRY / MILLWORK ============ */
add("trim", "trim", "interior_trim", [
  ["trim.base.install.paintgrade", "Install paint-grade baseboard", "linear_foot", 0.06, 2.45, "LF of base", ["baseboard", "base trim", "paint grade base"], GEO.perimeter],
  ["trim.base.install.stain", "Install stain-grade baseboard", "linear_foot", 0.08, 4.35, "LF of base", ["stain grade base", "hardwood base"], GEO.perimeter],
  ["trim.shoe.quarter", "Install shoe or quarter round", "linear_foot", 0.03, 1.15, "LF", ["shoe molding", "quarter round"], GEO.perimeter],
  ["trim.casing.door", "Case door opening", "each", 0.75, 42, "Count of openings", ["door casing", "case opening"], GEO.none],
  ["trim.casing.window", "Case window opening", "each", 1, 52, "Count of windows", ["window casing"], GEO.none],
  ["trim.crown.install", "Install crown molding", "linear_foot", 0.11, 4.25, "LF of crown", ["crown molding", "cornice"], GEO.perimeter],
  ["trim.wainscot.panel", "Install wainscot or panel molding", "square_foot", 0.09, 7.5, "Wall area", ["wainscot", "board and batten", "panel molding"], GEO.wall],
  ["trim.shelving.closet", "Install closet shelving and rod", "linear_foot", 0.12, 8.5, "LF of shelf", ["closet shelf", "shelving", "rod"], GEO.none],
  ["trim.closet.system", "Install closet organizer system", "linear_foot", 0.35, 42, "LF of closet", ["closet system", "organizer"], GEO.none],
  ["trim.handrail.install", "Install handrail and brackets", "linear_foot", 0.22, 14, "LF of rail", ["handrail", "stair rail"], GEO.none],
  ["trim.repair.patch", "Repair or replace damaged trim", "linear_foot", 0.12, 2.75, "LF repaired", ["trim repair", "replace trim"], GEO.none],
  ["trim.window.stool", "Install window stool and apron", "each", 0.9, 46, "Count of windows", ["stool", "apron", "window trim"], GEO.none],
]);

/* ============ N. CABINETS / COUNTERTOPS ============ */
add("cabinets", "cabinetry", "install", [
  ["cabinets.base.install", "Install base cabinets", "linear_foot", 0.55, 285, "LF of base run", ["base cabinets", "install cabinets", "lower cabinets"], GEO.none],
  ["cabinets.wall.install", "Install wall cabinets", "linear_foot", 0.5, 245, "LF of wall run", ["wall cabinets", "upper cabinets"], GEO.none],
  ["cabinets.tall.install", "Install tall / pantry cabinet", "each", 1.75, 685, "Count of tall units", ["pantry cabinet", "tall cabinet", "oven cabinet"], GEO.none],
  ["cabinets.vanity.install", "Install bathroom vanity cabinet", "each", 2, 585, "Count of vanities", ["vanity", "vanity cabinet"], GEO.none],
  ["cabinets.hardware.install", "Install cabinet hardware", "each", 0.1, 8, "Count of knobs/pulls", ["cabinet hardware", "pulls", "knobs"], GEO.none],
  ["cabinets.filler.panel", "Install fillers, panels and scribe", "linear_foot", 0.3, 45, "LF of filler/panel", ["filler", "end panel", "scribe"], GEO.none],
  ["cabinets.crown.install", "Install cabinet crown and light rail", "linear_foot", 0.16, 12, "LF of cabinet top", ["cabinet crown", "light rail"], GEO.none],
  ["cabinets.remove.reinstall", "Remove and reinstall cabinets", "linear_foot", 0.75, 12, "LF of cabinet run", ["remove and reinstall cabinets", "r&r cabinets"], GEO.none],
]);
add("countertops", "countertops", "install", [
  ["countertops.quartz.install", "Fabricate and install quartz countertop", "square_foot", 0.22, 78, "Countertop area", ["quartz", "engineered stone countertop"], GEO.none],
  ["countertops.granite.install", "Fabricate and install granite countertop", "square_foot", 0.22, 72, "Countertop area", ["granite countertop"], GEO.none],
  ["countertops.laminate.install", "Install laminate countertop", "linear_foot", 0.3, 42, "LF of countertop", ["laminate countertop", "post form"], GEO.none],
  ["countertops.butcherblock.install", "Install butcher block countertop", "square_foot", 0.25, 48, "Countertop area", ["butcher block", "wood countertop"], GEO.none],
  ["countertops.solidsurface.install", "Install solid-surface countertop", "square_foot", 0.22, 62, "Countertop area", ["solid surface", "corian"], GEO.none],
  ["countertops.template.visit", "Template and measure countertops", "each", 1.5, 0, "Count of template visits", ["template", "digital measure"], GEO.none],
]);

/* ============ O. ROOFING / EXTERIOR ============ */
add("roofing", "roofing", "asphalt", [
  ["roofing.asphalt.install", "Install architectural asphalt shingles", "square_foot", 0.025, 3.35, "Roof area", ["shingles", "asphalt roof", "reroof"], GEO.roof],
  ["roofing.underlayment.install", "Install synthetic underlayment", "square_foot", 0.006, 0.34, "Roof area", ["underlayment", "felt", "synthetic"], GEO.roof],
  ["roofing.iceandwater.install", "Install ice and water shield", "square_foot", 0.01, 0.85, "Eave and valley area", ["ice and water", "ice barrier"], GEO.none],
  ["roofing.ridge.vent", "Install ridge vent", "linear_foot", 0.08, 6.5, "LF of ridge", ["ridge vent", "roof ventilation"], GEO.none],
  ["roofing.flashing.step", "Install step and counter flashing", "linear_foot", 0.12, 5.5, "LF of flashing", ["flashing", "step flashing", "counter flashing"], GEO.none],
  ["roofing.pipe.boot", "Install pipe boot / roof penetration flashing", "each", 0.6, 38, "Count of penetrations", ["pipe boot", "roof jack", "penetration"], GEO.none],
  ["roofing.sheathing.repair", "Roof sheathing repair — allowance", "square_foot", 0.03, 3.1, "Estimated repair area", ["sheathing repair", "rotten decking"], GEO.none],
  ["roofing.valley.install", "Install valley flashing", "linear_foot", 0.11, 7.5, "LF of valley", ["valley", "valley metal"], GEO.none],
]);
add("siding", "siding", "cladding", [
  ["siding.vinyl.install", "Install vinyl siding", "square_foot", 0.03, 3.15, "Facade area", ["vinyl siding"], GEO.facade],
  ["siding.fibercement.install", "Install fiber-cement lap siding", "square_foot", 0.045, 5.85, "Facade area", ["hardie", "fiber cement", "lap siding"], GEO.facade],
  ["siding.wrap.install", "Install house wrap and flashing tape", "square_foot", 0.008, 0.42, "Facade area", ["house wrap", "tyvek", "wrb"], GEO.facade],
  ["siding.trim.exterior", "Install exterior trim boards", "linear_foot", 0.09, 4.6, "LF of trim", ["exterior trim", "corner board", "frieze"], GEO.none],
  ["siding.soffit.fascia", "Install soffit and fascia", "linear_foot", 0.14, 8.5, "LF of eave", ["soffit", "fascia"], GEO.none],
  ["siding.repair.patch", "Siding repair — patch and blend", "square_foot", 0.08, 5.5, "Actual repair area", ["siding repair", "patch siding"], GEO.none],
]);
add("gutters", "gutters", "drainage", [
  ["gutters.k5.install", "Install 5 in K-style gutter", "linear_foot", 0.06, 8.5, "LF of gutter", ["gutter", "k style", "eavestrough"], GEO.none],
  ["gutters.downspout.install", "Install downspout", "linear_foot", 0.07, 7.5, "LF of downspout", ["downspout", "leader"], GEO.none],
  ["gutters.guard.install", "Install gutter guards", "linear_foot", 0.05, 7, "LF of gutter", ["gutter guard", "leaf guard"], GEO.none],
  ["gutters.extension.drain", "Install downspout extension / drain tie-in", "each", 0.75, 45, "Count of downspouts", ["downspout extension", "drain tie in"], GEO.none],
]);

/* ============ P. CONCRETE / MASONRY ============ */
add("concrete", "concrete", "flatwork", [
  ["concrete.slab.pour", "Form and pour concrete slab", "square_foot", 0.06, 7.85, "Slab area", ["slab", "pour concrete", "flatwork"], GEO.none],
  ["concrete.walkway.pour", "Form and pour walkway", "square_foot", 0.07, 8.5, "Walkway area", ["walkway", "sidewalk"], GEO.none],
  ["concrete.pad.equipment", "Pour equipment pad", "each", 3, 245, "Count of pads", ["equipment pad", "condenser pad"], GEO.none],
  ["concrete.footing.pour", "Excavate and pour footing", "cubic_yard", 3.5, 235, "CY of footing concrete", ["footing", "foundation footing"], GEO.none],
  ["concrete.steps.pour", "Form and pour concrete steps", "each", 4.5, 195, "Count of risers", ["concrete steps", "stoop"], GEO.none],
  ["concrete.patch.repair", "Concrete patch and repair", "square_foot", 0.09, 4.5, "Actual repair area", ["concrete repair", "spall repair", "patch concrete"], GEO.none],
  ["concrete.saw.cut", "Saw cut concrete", "linear_foot", 0.12, 2.5, "LF of cut", ["saw cut", "cut slab"], GEO.none],
]);
add("masonry", "masonry", "walls_repair", [
  ["masonry.block.wall", "Lay CMU block wall", "square_foot", 0.13, 9.5, "Wall face area", ["block wall", "cmu", "concrete block"], GEO.none],
  ["masonry.frostwall.pour", "Form and pour frost wall", "linear_foot", 0.85, 62, "LF of wall", ["frost wall", "stem wall"], GEO.none],
  ["masonry.tuckpoint.repair", "Tuckpoint and repoint mortar joints", "square_foot", 0.14, 3.2, "Repointed area", ["tuckpoint", "repoint", "mortar repair"], GEO.none],
  ["masonry.brick.repair", "Brick replacement and repair", "square_foot", 0.28, 12.5, "Actual repair area", ["brick repair", "replace brick"], GEO.none],
  ["masonry.veneer.stone", "Install stone veneer", "square_foot", 0.22, 16.5, "Veneer area", ["stone veneer", "cultured stone"], GEO.none],
  ["masonry.chimney.repair", "Chimney repair — allowance", "each", 12, 850, "Count of chimneys", ["chimney repair", "crown repair"], GEO.none],
]);

/* ============ Q. DECKS / PORCHES / RAILINGS ============ */
add("decks", "decks", "structure", [
  ["decks.footing.install", "Install deck footing and post base", "each", 2.25, 145, "Count of footings", ["deck footing", "sonotube", "pier"], GEO.none],
  ["decks.framing.install", "Frame deck structure", "square_foot", 0.07, 9.5, "Deck area", ["deck framing", "joists", "ledger"], GEO.none],
  ["decks.decking.composite", "Install composite decking", "square_foot", 0.06, 11.5, "Deck area", ["composite decking", "trex"], GEO.none],
  ["decks.decking.wood", "Install pressure-treated decking", "square_foot", 0.05, 5.85, "Deck area", ["wood decking", "pt decking"], GEO.none],
  ["decks.stairs.build", "Build deck stairs", "each", 1.1, 68, "Count of treads", ["deck stairs", "stair treads"], GEO.none],
  ["decks.railing.install", "Install deck railing", "linear_foot", 0.28, 42, "LF of railing", ["deck railing", "guard rail", "balusters"], GEO.none],
  ["decks.skirting.install", "Install deck skirting / lattice", "linear_foot", 0.18, 14, "LF of skirt", ["skirting", "lattice"], GEO.none],
  ["decks.repair.boards", "Deck board and framing repair", "square_foot", 0.09, 6.5, "Actual repair area", ["deck repair", "replace deck boards"], GEO.none],
]);

/* ============ R. HANDYMAN / SMALL REPAIR ============ */
add("handyman", "handyman", "punch_list", [
  ["handyman.caulk.refresh", "Remove and replace caulk joint", "linear_foot", 0.05, 0.4, "LF of joint", ["caulk", "recaulk", "sealant"], GEO.none],
  ["handyman.shelf.install", "Install wall shelf with blocking", "each", 1, 45, "Count of shelves", ["shelf install", "floating shelf"], GEO.none],
  ["handyman.tv.mount", "Mount TV with in-wall blocking", "each", 1.75, 85, "Count of mounts", ["tv mount", "wall mount"], GEO.none],
  ["handyman.grabbar.install", "Install grab bar with blocking", "each", 1, 68, "Count of bars", ["grab bar", "safety bar"], GEO.none],
  ["handyman.toilet.repair", "Repair running or leaking toilet", "each", 1, 42, "Count of toilets", ["toilet repair", "flapper", "fill valve"], GEO.none],
  ["handyman.fixture.swap", "Swap light fixture or device", "each", 0.75, 0, "Count of fixtures", ["swap fixture", "replace light"], GEO.none],
  ["handyman.mirror.install", "Install mirror or medicine cabinet", "each", 1, 145, "Count", ["mirror", "medicine cabinet"], GEO.none],
  ["handyman.towelbar.accessory", "Install bath accessories", "each", 0.4, 38, "Count of accessories", ["towel bar", "paper holder", "bath accessory"], GEO.none],
  ["handyman.screen.repair", "Repair window or door screen", "each", 0.6, 28, "Count of screens", ["screen repair", "rescreen"], GEO.none],
  ["handyman.punch.hour", "Punch-list and miscellaneous repairs", "hour", 1, 6, "Crew hours", ["punch list", "misc repair", "handyman hour"], GEO.none],
  ["handyman.weatherstrip.door", "Replace door weatherstripping and sweep", "each", 0.75, 34, "Count of doors", ["weatherstrip", "door sweep", "draft"], GEO.none],
]);

/* ============ S. LANDSCAPING / SITE BASICS ============ */
add("sitework", "landscaping", "site", [
  ["site.grading.rough", "Rough grading around structure", "square_foot", 0.006, 0.18, "Graded area", ["grading", "rough grade", "slope away"], GEO.none],
  ["site.excavation.trench", "Excavate trench", "linear_foot", 0.12, 1.6, "LF of trench", ["trench", "excavate"], GEO.none],
  ["site.drainage.french", "Install french drain", "linear_foot", 0.22, 12.5, "LF of drain", ["french drain", "drainage", "perimeter drain"], GEO.none],
  ["site.topsoil.seed", "Place topsoil and seed", "square_foot", 0.004, 0.32, "Area", ["topsoil", "seed", "lawn repair"], GEO.none],
  ["site.sod.install", "Install sod", "square_foot", 0.008, 0.85, "Area", ["sod", "turf"], GEO.none],
  ["site.mulch.beds", "Place mulch in beds", "square_foot", 0.005, 0.42, "Bed area", ["mulch", "bark"], GEO.none],
  ["site.retaining.small", "Build small segmental retaining wall", "square_foot", 0.35, 22, "Wall face area", ["retaining wall", "block wall garden"], GEO.none],
  ["site.fence.privacy", "Install privacy fence", "linear_foot", 0.35, 28, "LF of fence", ["fence", "privacy fence"], GEO.none],
  ["site.plant.shrub", "Plant shrub or small tree", "each", 0.6, 65, "Count of plants", ["planting", "shrub", "tree"], GEO.none],
]);

/* ---------------- emit ---------------- */
const COLUMNS = [
  "library_version", "assembly_key", "trade_key", "category_key", "subcategory_key",
  "work_item", "default_scope_description", "client_description", "unit_key",
  "measurement_method", "production_rate", "default_labor_hours", "crew_size",
  "skill_level", "material_allowance", "waste_factor", "equipment_requirements",
  "suggested_markup_pct", "default_overhead_pct", "suggested_profit_pct",
  "estimated_duration_hours", "typical_dependencies", "internal_notes",
  "safety_notes", "code_reference", "inspection_notes", "keywords", "synonyms",
  "is_sample_data", "is_active", "sort_order", "cost_basis",
  "productivity_convention", "setup_hours", "is_composite", "geometry_basis",
  "ballpark_allowance_eligible", "finish_tier_applies", "material_cost_low",
  "material_cost_high", "source_version",
];

const rows = [];
const keys = new Set();
let sort = 1000;
for (const g of GROUPS) {
  const [crew, skill, waste, equip, safety] = TRADE[g.tradeKey];
  const costBasis = g.opts.costBasis ?? "labor_production";
  const isFee = costBasis === "permit_fee" || costBasis === "equipment" || costBasis === "other_direct_cost";
  for (const [key, name, unit, hrs, mat, measure, kw, geo] of g.items) {
    if (keys.has(key)) throw new Error(`duplicate assembly key ${key}`);
    keys.add(key);
    const convention = g.opts.convention ?? (hrs > 0 ? "hours_per_unit" : "none");
    if (!isFee && costBasis !== "allowance" && hrs <= 0) {
      throw new Error(`labor-producing assembly ${key} has no hours`);
    }
    rows.push([
      2, key, g.tradeKey, g.categoryKey, g.subcategoryKey, name,
      `${name}. Includes layout, material handling, installation per manufacturer instructions, and cleanup of the work area. Sample production assumption — verify against field conditions.`,
      name, `${unit}'::public.scope_unit`, measure,
      hrs > 0 ? Number((1 / hrs).toFixed(3)) : null, hrs > 0 ? hrs : null,
      crew, skill, mat, waste, equip, 15, 10, 10, hrs > 0 ? hrs : null,
      [], "Sample assumption from VisionWorx360 Library v2 (Residential Core). Adjust to your crew and market.",
      safety, "TBD — verify against locally adopted code edition",
      "TBD — confirm required inspections with local jurisdiction",
      kw, kw, true, true, ++sort, costBasis, convention, 0,
      g.opts.composite === true, geo ?? null,
      g.opts.allowance === false ? false : true,
      g.opts.tier === true,
      mat > 0 ? Number((mat * 0.78).toFixed(2)) : null,
      mat > 0 ? Number((mat * 1.35).toFixed(2)) : null,
      "library-v2",
    ]);
  }
}

const value = (v, i) => {
  const col = COLUMNS[i];
  if (col === "unit_key") return `'${String(v)}`;
  if (Array.isArray(v)) return arr(v);
  if (typeof v === "boolean") return b(v);
  if (typeof v === "number") return num(v);
  return q(v);
};

const sql = [
  "-- GENERATED FILE — do not edit by hand.",
  "-- Source: scripts/generate-catalog-v2.mjs",
  "-- VisionWorx360 Residential Core Knowledge Base — Library v2 additions (SAMPLE data).",
  `INSERT INTO public.catalog_assemblies (${COLUMNS.join(", ")}) VALUES`,
  rows.map((r) => `  (${r.map(value).join(", ")})`).join(",\n"),
  "ON CONFLICT (library_version, assembly_key) DO NOTHING;",
  "",
].join("\n");

writeFileSync("supabase/seed/knowledge-base-v2.sql", sql);
console.error(`v2 assemblies: ${rows.length}`);
const byTrade = {};
for (const r of rows) byTrade[r[2]] = (byTrade[r[2]] ?? 0) + 1;
console.error(JSON.stringify(byTrade, null, 0));

/* ---------------------------------------------------------------------------
 * Compact form for the migration: the boilerplate text (scope description,
 * internal note, code/inspection placeholders) and the per-trade defaults are
 * composed in SQL instead of repeated on every row, which keeps the migration
 * an order of magnitude smaller and easier to review.
 * ------------------------------------------------------------------------- */
const compactRows = [];
let csort = 1000;
for (const g of GROUPS) {
  const costBasis = g.opts.costBasis ?? "labor_production";
  for (const [key, name, unit, hrs, mat, measure, kw, geo] of g.items) {
    const convention = g.opts.convention ?? (hrs > 0 ? "hours_per_unit" : "none");
    compactRows.push(
      `  (${q(key)},${q(g.tradeKey)},${q(g.categoryKey)},${q(g.subcategoryKey)},${q(name)},${q(unit)},${q(measure)},${num(hrs)},${num(mat)},${q(kw.join("|"))},${q(costBasis)},${q(convention)},${b(g.opts.composite === true)},${q(geo ?? null)},${b(g.opts.allowance !== false)},${b(g.opts.tier === true)},${++csort})`,
    );
  }
}

const compact = `-- GENERATED FILE — do not edit by hand (scripts/generate-catalog-v2.mjs).
WITH trade_defaults(trade_key, crew_size, skill_level, waste_factor, equipment_requirements, safety_notes) AS (
  VALUES
${Object.entries(TRADE)
  .map(([k, v]) => `  (${q(k)},${num(v[0])},${q(v[1])},${num(v[2])},${q(v[3])},${q(v[4])})`)
  .join(",\n")}
), src(assembly_key, trade_key, category_key, subcategory_key, work_item, unit_key, measurement_method,
       hours_per_unit, material_allowance, keywords_pipe, cost_basis, productivity_convention,
       is_composite, geometry_basis, ballpark_allowance_eligible, finish_tier_applies, sort_order) AS (
  VALUES
${compactRows.join(",\n")}
)
INSERT INTO public.catalog_assemblies (
  library_version, assembly_key, trade_key, category_key, subcategory_key, work_item,
  default_scope_description, client_description, unit_key, measurement_method,
  production_rate, default_labor_hours, crew_size, skill_level, material_allowance,
  waste_factor, equipment_requirements, suggested_markup_pct, default_overhead_pct,
  suggested_profit_pct, estimated_duration_hours, typical_dependencies, internal_notes,
  safety_notes, code_reference, inspection_notes, keywords, synonyms, is_sample_data,
  is_active, sort_order, cost_basis, productivity_convention, setup_hours, is_composite,
  geometry_basis, ballpark_allowance_eligible, finish_tier_applies, material_cost_low,
  material_cost_high, source_version)
SELECT 2, s.assembly_key, s.trade_key, s.category_key, s.subcategory_key, s.work_item,
  s.work_item || '. Includes layout, material handling, installation per manufacturer instructions, and cleanup of the work area. Sample production assumption — verify against field conditions.',
  s.work_item, s.unit_key::public.scope_unit, s.measurement_method,
  CASE WHEN s.hours_per_unit > 0 THEN round(1 / s.hours_per_unit, 3) END,
  CASE WHEN s.hours_per_unit > 0 THEN s.hours_per_unit END,
  t.crew_size, t.skill_level, s.material_allowance, t.waste_factor, t.equipment_requirements,
  15, 10, 10, CASE WHEN s.hours_per_unit > 0 THEN s.hours_per_unit END, '{}',
  'Sample assumption from VisionWorx360 Library v2 (Residential Core). Adjust to your crew and market.',
  t.safety_notes, 'TBD — verify against locally adopted code edition',
  'TBD — confirm required inspections with local jurisdiction',
  string_to_array(s.keywords_pipe, '|'), string_to_array(s.keywords_pipe, '|'), true, true,
  s.sort_order, s.cost_basis::public.task_cost_basis, s.productivity_convention, 0, s.is_composite,
  s.geometry_basis, s.ballpark_allowance_eligible, s.finish_tier_applies,
  CASE WHEN s.material_allowance > 0 THEN round(s.material_allowance * 0.78, 2) END,
  CASE WHEN s.material_allowance > 0 THEN round(s.material_allowance * 1.35, 2) END,
  'library-v2'
FROM src s JOIN trade_defaults t ON t.trade_key = s.trade_key
ON CONFLICT (library_version, assembly_key) DO NOTHING;
`;
writeFileSync("supabase/seed/knowledge-base-v2-compact.sql", compact);
console.error(`compact bytes: ${compact.length}`);
