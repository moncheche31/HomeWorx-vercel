/**
 * Module 007B — Contractor Knowledge Base seed generator (Library v1).
 *
 * Emits supabase/seed/knowledge-base-v1.sql. All values are structurally valid
 * SAMPLE assumptions (is_sample_data = true) — NOT licensed cost data.
 * Regenerate with: node scripts/generate-knowledge-base-seed.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";

const q = (v) =>
  v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
const arr = (a) =>
  !a || a.length === 0 ? "'{}'" : `ARRAY[${a.map((x) => q(x)).join(",")}]::text[]`;
const num = (n) => (n === null || n === undefined ? "NULL" : String(n));

/**
 * Trade defaults: [tradeKey, crewSize, skillLevel, wasteFactor, equipment, safety]
 */
const TRADE = {
  demolition: [2, "general_labor", 0.0, "Dumpster, dollies, hand demo tools", "Dust containment, respirator, cut/puncture hazards, verify utilities de-energized"],
  framing: [2, "carpenter", 0.1, "Compressor, nailers, circular saw, laser level", "Fall protection, saw safety, temporary bracing"],
  drywall: [2, "drywall_finisher", 0.1, "Drywall lift, stilts, sanding vac", "Silica dust control, ladder/stilt safety"],
  painting: [2, "painter", 0.05, "Sprayer, ladders, masking, drop cloths", "Ventilation, VOC exposure, lead-safe practices pre-1978"],
  flooring: [2, "flooring_installer", 0.1, "Tile saw, trowels, roller, knee pads", "Silica dust, adhesive fumes, kneeling ergonomics"],
  trim: [1, "finish_carpenter", 0.1, "Miter saw, brad nailer, coping tools", "Saw safety, dust control"],
  doors: [2, "carpenter", 0.05, "Shims, levels, router jig", "Lifting hazards, pinch points"],
  windows: [2, "carpenter", 0.05, "Ladders, pry bars, caulk guns", "Fall protection, glass handling"],
  cabinetry: [2, "cabinet_installer", 0.05, "Cabinet jacks, levels, clamps", "Lifting hazards, anchoring into structure"],
  countertops: [2, "fabricator", 0.05, "Suction lifters, seam setters", "Heavy slab lifting, silica dust"],
  roofing: [3, "roofer", 0.1, "Roof jacks, harnesses, nail guns, dumpster", "Fall protection required, heat exposure, debris control"],
  siding: [2, "siding_installer", 0.1, "Scaffold, brake, snips, nailers", "Fall protection, ladder safety"],
  gutters: [2, "gutter_installer", 0.05, "Gutter machine, ladders, rivet tools", "Fall protection, ladder placement"],
  decks: [2, "carpenter", 0.1, "Post hole digger, saws, levels", "Excavation/utility locate, fall protection"],
  masonry: [2, "mason", 0.1, "Mixer, saws, scaffold", "Silica dust, heavy lifting, scaffold safety"],
  concrete: [3, "concrete_finisher", 0.05, "Mixer/pump, screed, float, saw", "Chemical burns, silica dust, back strain"],
  plumbing: [1, "licensed_plumber", 0.05, "Press tools, torch, drain machine", "Hot work permit, water shutoff, confined space"],
  electrical: [1, "licensed_electrician", 0.05, "Meters, benders, fish tape", "Lockout/tagout, arc flash, verify de-energized"],
  hvac: [2, "hvac_technician", 0.05, "Recovery machine, gauges, brazing kit", "Refrigerant handling, hot work, electrical safety"],
  insulation: [2, "insulation_installer", 0.05, "Blower, staple guns", "Respirator, skin protection"],
  specialty: [2, "general_contractor", 0.05, "Varies by scope", "Site-specific hazard review required"],
  handyman: [1, "handyman", 0.05, "Standard hand and power tools", "General jobsite safety"],
};

/** category => [tradeKey, subcategory, items[]]; item = [key, name, unit, hoursPerUnit, materialAllowance, measurement, keywords[]] */
const CATEGORIES = [];
const add = (categoryKey, tradeKey, subcategoryKey, items) =>
  CATEGORIES.push({ categoryKey, tradeKey, subcategoryKey, items });

// ---------------- INTERIOR ----------------
add("demo", "demolition", "interior", [
  ["demo.drywall.walls", "Demo drywall — walls", "square_foot", 0.012, 0.02, "Wall area (LF x height)", ["demo", "demolition", "tear out", "drywall", "gut"]],
  ["demo.drywall.ceiling", "Demo drywall — ceiling", "square_foot", 0.016, 0.02, "Ceiling footprint", ["demo", "ceiling", "drywall"]],
  ["demo.flooring.carpet", "Demo carpet and pad", "square_foot", 0.008, 0.01, "Floor area", ["demo", "carpet", "tear out", "flooring"]],
  ["demo.flooring.tile", "Demo tile flooring", "square_foot", 0.03, 0.03, "Floor area", ["demo", "tile", "thinset", "flooring"]],
  ["demo.flooring.hardwood", "Demo hardwood flooring", "square_foot", 0.02, 0.02, "Floor area", ["demo", "hardwood", "wood floor"]],
  ["demo.cabinets.kitchen", "Demo kitchen cabinets", "linear_foot", 0.25, 0.05, "LF of cabinet run", ["demo", "cabinets", "kitchen"]],
  ["demo.bath.fixtures", "Demo bathroom fixtures", "each", 0.75, 0.05, "Count of fixtures", ["demo", "toilet", "vanity", "tub", "bath"]],
  ["demo.tub.surround", "Demo tub and surround", "each", 3.5, 0.1, "Count", ["demo", "tub", "shower", "surround", "bath"]],
  ["demo.wall.nonbearing", "Demo non-bearing partition wall", "linear_foot", 0.35, 0.05, "LF of wall", ["demo", "wall", "partition", "framing"]],
  ["demo.trim.interior", "Demo interior trim and base", "linear_foot", 0.02, 0.01, "LF of trim", ["demo", "trim", "baseboard", "casing"]],
  ["demo.ceiling.popcorn", "Scrape popcorn ceiling texture", "square_foot", 0.02, 0.03, "Ceiling area", ["popcorn", "texture", "scrape", "ceiling"]],
  ["demo.debris.haul", "Debris haul-off and disposal", "cubic_yard", 0.5, 55, "Estimated dumpster yardage", ["dumpster", "disposal", "haul", "debris", "cleanup"]],
  ["demo.protect.floors", "Floor and surface protection", "square_foot", 0.004, 0.15, "Protected area", ["protection", "masking", "ram board"]],
]);

add("framing", "framing", "rough_carpentry", [
  ["framing.wall.interior", "Frame interior 2x4 partition wall", "linear_foot", 0.35, 11, "LF of wall at 8 ft height", ["framing", "wall", "studs", "partition", "2x4"]],
  ["framing.wall.exterior", "Frame exterior 2x6 wall", "linear_foot", 0.45, 18, "LF of wall", ["framing", "exterior wall", "2x6", "studs"]],
  ["framing.header.opening", "Frame header and rough opening", "each", 1.5, 45, "Count of openings", ["header", "rough opening", "framing", "door", "window"]],
  ["framing.floor.joist", "Frame floor joist system", "square_foot", 0.035, 6.5, "Floor area", ["joist", "floor framing", "subfloor structure"]],
  ["framing.subfloor.sheathing", "Install subfloor sheathing", "square_foot", 0.02, 2.4, "Floor area", ["subfloor", "sheathing", "osb", "plywood"]],
  ["framing.roof.rafters", "Frame conventional rafter roof", "square_foot", 0.05, 7.5, "Roof plan area", ["rafters", "roof framing", "ridge"]],
  ["framing.wall.furring", "Furring strips on masonry wall", "square_foot", 0.02, 1.1, "Wall area", ["furring", "basement", "masonry"]],
  ["framing.beam.lvl", "Install LVL beam", "linear_foot", 0.85, 34, "LF of beam", ["lvl", "beam", "structural", "load bearing"]],
  ["framing.blocking.backing", "Install blocking and backing", "linear_foot", 0.1, 2.5, "LF", ["blocking", "backing", "grab bar"]],
]);

add("insulation", "insulation", "thermal", [
  ["insulation.batt.wall", "Install fiberglass batt insulation — walls", "square_foot", 0.012, 0.85, "Wall area", ["insulation", "batt", "fiberglass", "r13"]],
  ["insulation.batt.ceiling", "Install batt insulation — ceiling", "square_foot", 0.014, 1.15, "Ceiling area", ["insulation", "attic", "ceiling", "r38"]],
  ["insulation.blown.attic", "Blown-in attic insulation", "square_foot", 0.008, 1.05, "Attic floor area", ["blown", "cellulose", "attic", "insulation"]],
  ["insulation.foam.rim", "Spray foam rim joist", "linear_foot", 0.08, 4.25, "LF of rim", ["spray foam", "rim joist", "air seal"]],
  ["insulation.sound.batt", "Sound attenuation batts", "square_foot", 0.013, 1.1, "Wall area", ["soundproof", "acoustic", "insulation"]],
]);

add("drywall", "drywall", "board_and_finish", [
  ["drywall.hang.wall", "Hang 1/2 in drywall — walls", "square_foot", 0.012, 0.55, "Wall area", ["drywall", "sheetrock", "hang", "gypsum"]],
  ["drywall.hang.ceiling", "Hang 5/8 in drywall — ceiling", "square_foot", 0.016, 0.65, "Ceiling area", ["drywall", "ceiling", "sheetrock", "5/8"]],
  ["drywall.finish.level4", "Tape and finish drywall — Level 4", "square_foot", 0.018, 0.28, "Board area", ["tape", "mud", "finish", "level 4", "drywall"]],
  ["drywall.finish.level5", "Tape and finish drywall — Level 5", "square_foot", 0.026, 0.4, "Board area", ["level 5", "skim coat", "finish", "drywall"]],
  ["drywall.patch.small", "Patch drywall — small repair", "each", 1.25, 18, "Count of patches", ["patch", "repair", "hole", "drywall"]],
  ["drywall.cement.board", "Install cement board underlayment", "square_foot", 0.025, 1.45, "Area", ["cement board", "durock", "backer", "tile"]],
  ["drywall.texture.knockdown", "Apply knockdown texture", "square_foot", 0.008, 0.14, "Area", ["texture", "knockdown", "orange peel"]],
  ["drywall.corner.bead", "Install corner bead", "linear_foot", 0.05, 0.65, "LF of corners", ["corner bead", "drywall"]],
]);

add("painting", "painting", "finishes", [
  ["painting.prime.walls", "Prime walls", "square_foot", 0.006, 0.16, "Wall area", ["primer", "prime", "paint", "sealer"]],
  ["painting.walls.twocoat", "Paint walls — two coats", "square_foot", 0.011, 0.34, "Wall area", ["paint", "walls", "two coat", "latex"]],
  ["painting.ceiling", "Paint ceiling", "square_foot", 0.01, 0.3, "Ceiling area", ["paint", "ceiling", "flat"]],
  ["painting.trim.base", "Paint trim and baseboard", "linear_foot", 0.045, 0.4, "LF of trim", ["paint", "trim", "baseboard", "enamel"]],
  ["painting.doors.slab", "Paint door and casing", "each", 1.1, 12, "Count of doors", ["paint", "door", "casing"]],
  ["painting.cabinets.refinish", "Refinish/spray cabinets", "linear_foot", 1.6, 26, "LF of cabinet face", ["cabinet paint", "refinish", "spray", "kitchen"]],
  ["painting.exterior.siding", "Paint exterior siding", "square_foot", 0.014, 0.42, "Wall area", ["exterior paint", "siding", "paint"]],
  ["painting.stain.deck", "Stain and seal deck", "square_foot", 0.012, 0.35, "Deck surface area", ["stain", "deck", "sealer"]],
  ["painting.caulk.prep", "Caulk, patch and surface prep", "linear_foot", 0.02, 0.12, "LF of joints", ["caulk", "prep", "patch"]],
]);

add("flooring", "flooring", "floor_covering", [
  ["flooring.lvp.install", "Install luxury vinyl plank", "square_foot", 0.035, 3.25, "Floor area", ["lvp", "vinyl", "plank", "flooring"]],
  ["flooring.hardwood.install", "Install prefinished hardwood", "square_foot", 0.055, 6.5, "Floor area", ["hardwood", "wood floor", "prefinished"]],
  ["flooring.hardwood.refinish", "Sand and refinish hardwood", "square_foot", 0.04, 1.85, "Floor area", ["refinish", "sand", "hardwood", "polyurethane"]],
  ["flooring.tile.floor", "Install ceramic/porcelain floor tile", "square_foot", 0.09, 5.25, "Floor area", ["tile", "porcelain", "ceramic", "floor tile"]],
  ["flooring.tile.shower", "Install shower wall tile", "square_foot", 0.14, 7.5, "Wall area of shower", ["shower tile", "wall tile", "bath", "tile"]],
  ["flooring.tile.waterproof", "Waterproofing membrane at wet area", "square_foot", 0.04, 2.4, "Area", ["waterproofing", "kerdi", "redgard", "shower"]],
  ["flooring.carpet.install", "Install carpet and pad", "square_foot", 0.02, 3.1, "Floor area", ["carpet", "pad", "flooring"]],
  ["flooring.underlayment", "Install floor underlayment", "square_foot", 0.015, 0.9, "Floor area", ["underlayment", "subfloor prep"]],
  ["flooring.level.selfleveling", "Self-leveling floor prep", "square_foot", 0.03, 1.75, "Floor area", ["self leveling", "floor prep", "level"]],
  ["flooring.transition.strip", "Install transitions and thresholds", "each", 0.35, 22, "Count", ["transition", "threshold", "t-molding"]],
]);

add("trim", "trim", "finish_carpentry", [
  ["trim.base.install", "Install baseboard", "linear_foot", 0.05, 2.1, "LF of wall base", ["baseboard", "base", "trim", "molding"]],
  ["trim.casing.door", "Install door casing", "each", 0.65, 24, "Count of openings", ["casing", "door trim", "molding"]],
  ["trim.crown.install", "Install crown molding", "linear_foot", 0.08, 3.4, "LF of ceiling perimeter", ["crown", "molding", "trim"]],
  ["trim.window.stool", "Install window stool and apron", "each", 0.9, 28, "Count of windows", ["window trim", "stool", "apron", "sill"]],
  ["trim.shoe.quarter", "Install shoe/quarter round", "linear_foot", 0.03, 1.05, "LF", ["shoe", "quarter round", "trim"]],
  ["trim.wainscot.panel", "Install wainscot paneling", "square_foot", 0.09, 6.25, "Wall area", ["wainscot", "paneling", "board and batten"]],
  ["trim.shelving.closet", "Install closet shelving system", "linear_foot", 0.22, 12.5, "LF of shelving", ["closet", "shelving", "wire shelf"]],
  ["trim.stair.railing", "Install stair handrail", "linear_foot", 0.4, 26, "LF of rail", ["handrail", "railing", "stairs"]],
]);

add("doors", "doors", "openings", [
  ["doors.interior.prehung", "Install interior prehung door", "each", 1.6, 165, "Count of doors", ["door", "prehung", "interior door"]],
  ["doors.interior.slab", "Install interior slab door", "each", 1.9, 135, "Count", ["slab door", "door"]],
  ["doors.bifold.install", "Install bifold closet door", "each", 1.2, 120, "Count", ["bifold", "closet door"]],
  ["doors.barn.install", "Install barn door and hardware", "each", 2.5, 385, "Count", ["barn door", "sliding door"]],
  ["doors.exterior.entry", "Install exterior entry door", "each", 4.5, 850, "Count", ["entry door", "exterior door", "front door"]],
  ["doors.patio.slider", "Install sliding patio door", "each", 6, 1250, "Count", ["patio door", "slider", "glass door"]],
  ["doors.hardware.set", "Install door hardware set", "each", 0.35, 45, "Count", ["knob", "lockset", "hardware", "hinges"]],
  ["doors.garage.overhead", "Install overhead garage door", "each", 7, 1450, "Count", ["garage door", "overhead door"]],
]);

add("windows", "windows", "openings", [
  ["windows.replace.insert", "Replace window — insert/pocket", "each", 2.5, 575, "Count of windows", ["window", "replacement", "insert", "pocket"]],
  ["windows.replace.fullframe", "Replace window — full frame", "each", 4.5, 720, "Count", ["window", "full frame", "new construction"]],
  ["windows.egress.basement", "Install basement egress window and well", "each", 14, 2150, "Count", ["egress", "basement window", "window well"]],
  ["windows.flash.seal", "Flash and seal window opening", "each", 0.8, 38, "Count", ["flashing", "seal", "window", "waterproof"]],
  ["windows.trim.exterior", "Install exterior window trim", "linear_foot", 0.09, 3.2, "LF of trim", ["exterior trim", "window", "brickmold"]],
]);

add("cabinets", "cabinetry", "casework", [
  ["cabinets.base.install", "Install base cabinets", "linear_foot", 0.65, 285, "LF of base run", ["cabinets", "base cabinet", "kitchen"]],
  ["cabinets.wall.install", "Install wall cabinets", "linear_foot", 0.75, 245, "LF of wall run", ["cabinets", "upper cabinet", "wall cabinet"]],
  ["cabinets.tall.install", "Install tall/pantry cabinet", "each", 2.2, 685, "Count", ["pantry", "tall cabinet", "utility cabinet"]],
  ["cabinets.vanity.install", "Install bathroom vanity cabinet", "each", 2.4, 525, "Count", ["vanity", "bath cabinet", "bathroom"]],
  ["cabinets.hardware.install", "Install cabinet knobs and pulls", "each", 0.1, 6.5, "Count of pulls", ["hardware", "pulls", "knobs", "cabinet"]],
  ["cabinets.refacing", "Reface existing cabinets", "linear_foot", 1.4, 165, "LF of cabinet face", ["refacing", "cabinet doors", "veneer"]],
  ["cabinets.toekick.filler", "Install fillers, toe kick and trim", "linear_foot", 0.18, 9.5, "LF", ["filler", "toe kick", "scribe"]],
]);

add("countertops", "countertops", "surfaces", [
  ["countertops.quartz.install", "Install quartz countertop", "square_foot", 0.22, 68, "Square feet of top", ["quartz", "countertop", "kitchen", "surface"]],
  ["countertops.granite.install", "Install granite countertop", "square_foot", 0.24, 62, "Square feet of top", ["granite", "countertop", "stone"]],
  ["countertops.laminate.install", "Install laminate countertop", "linear_foot", 0.3, 42, "LF of top", ["laminate", "countertop", "formica"]],
  ["countertops.butcherblock", "Install butcher block countertop", "square_foot", 0.25, 45, "Square feet", ["butcher block", "wood counter"]],
  ["countertops.backsplash.tile", "Install tile backsplash", "square_foot", 0.16, 11.5, "Backsplash area", ["backsplash", "tile", "subway"]],
  ["countertops.sink.cutout", "Sink cutout and undermount setting", "each", 1.2, 85, "Count", ["sink cutout", "undermount", "counter"]],
]);

// ---------------- EXTERIOR ----------------
add("roofing", "roofing", "roof_systems", [
  ["roofing.shingle.tearoff", "Tear off existing roofing", "square_foot", 0.014, 0.35, "Roof area including waste", ["tear off", "roof", "shingles", "demo"]],
  ["roofing.shingle.install", "Install architectural asphalt shingles", "square_foot", 0.026, 2.35, "Roof area", ["shingles", "roof", "asphalt", "architectural"]],
  ["roofing.underlayment.synthetic", "Install synthetic underlayment", "square_foot", 0.005, 0.28, "Roof area", ["underlayment", "felt", "roof"]],
  ["roofing.iceandwater", "Install ice and water shield", "square_foot", 0.008, 0.75, "Eave/valley area", ["ice and water", "membrane", "eave"]],
  ["roofing.ridge.vent", "Install ridge vent", "linear_foot", 0.06, 4.85, "LF of ridge", ["ridge vent", "ventilation", "roof"]],
  ["roofing.flashing.step", "Install step and counter flashing", "linear_foot", 0.09, 3.6, "LF", ["flashing", "step flashing", "roof"]],
  ["roofing.valley.metal", "Install metal valley", "linear_foot", 0.08, 5.4, "LF of valley", ["valley", "metal", "roof"]],
  ["roofing.pipe.boot", "Install pipe boots and penetration seals", "each", 0.5, 26, "Count", ["pipe boot", "penetration", "roof jack"]],
  ["roofing.decking.replace", "Replace damaged roof decking", "square_foot", 0.03, 2.6, "Area replaced", ["decking", "sheathing", "rot", "roof"]],
]);

add("siding", "siding", "cladding", [
  ["siding.vinyl.install", "Install vinyl siding", "square_foot", 0.035, 3.1, "Wall area", ["vinyl siding", "siding", "cladding"]],
  ["siding.fibercement.install", "Install fiber cement lap siding", "square_foot", 0.055, 5.4, "Wall area", ["hardie", "fiber cement", "siding", "lap"]],
  ["siding.wrap.house", "Install weather-resistive house wrap", "square_foot", 0.006, 0.32, "Wall area", ["house wrap", "tyvek", "wrb"]],
  ["siding.trim.corner", "Install corner boards and trim", "linear_foot", 0.07, 3.85, "LF", ["corner board", "trim", "siding"]],
  ["siding.soffit.fascia", "Install soffit and fascia", "linear_foot", 0.12, 7.25, "LF of eave", ["soffit", "fascia", "eave"]],
  ["siding.repair.patch", "Repair/patch existing siding", "square_foot", 0.09, 4.2, "Area repaired", ["siding repair", "patch"]],
]);

add("gutters", "gutters", "drainage", [
  ["gutters.seamless.install", "Install seamless aluminum gutter", "linear_foot", 0.06, 6.5, "LF of eave", ["gutter", "seamless", "eavestrough"]],
  ["gutters.downspout.install", "Install downspouts", "linear_foot", 0.07, 5.75, "LF of downspout", ["downspout", "leader", "gutter"]],
  ["gutters.guard.install", "Install gutter guards", "linear_foot", 0.05, 7.25, "LF", ["gutter guard", "leaf guard"]],
  ["gutters.clean.service", "Clean and reseal gutters", "linear_foot", 0.03, 0.35, "LF", ["gutter cleaning", "reseal"]],
]);

add("decks", "decks", "outdoor_living", [
  ["decks.footing.install", "Install deck footings", "each", 1.75, 65, "Count of footings", ["footing", "sonotube", "deck", "pier"]],
  ["decks.frame.build", "Build deck framing", "square_foot", 0.08, 9.5, "Deck area", ["deck framing", "joists", "ledger"]],
  ["decks.decking.composite", "Install composite decking", "square_foot", 0.07, 12.5, "Deck area", ["composite", "trex", "decking"]],
  ["decks.decking.wood", "Install pressure-treated decking", "square_foot", 0.06, 5.25, "Deck area", ["wood decking", "pressure treated", "deck boards"]],
  ["decks.railing.install", "Install deck railing", "linear_foot", 0.28, 42, "LF of railing", ["railing", "guardrail", "deck"]],
  ["decks.stairs.build", "Build deck stairs", "each", 1.1, 48, "Count of treads", ["deck stairs", "stringer", "steps"]],
  ["decks.ledger.flash", "Install and flash ledger board", "linear_foot", 0.12, 8.5, "LF of ledger", ["ledger", "flashing", "deck"]],
  ["decks.porch.roof", "Frame covered porch roof", "square_foot", 0.11, 16.5, "Roof plan area", ["porch", "covered", "roof", "patio cover"]],
]);

add("masonry", "masonry", "masonry_and_stone", [
  ["masonry.brick.veneer", "Install brick veneer", "square_foot", 0.22, 12.5, "Wall area", ["brick", "veneer", "masonry"]],
  ["masonry.stone.veneer", "Install manufactured stone veneer", "square_foot", 0.2, 14.5, "Wall area", ["stone veneer", "cultured stone", "masonry"]],
  ["masonry.tuckpoint.repair", "Tuckpoint and repoint mortar joints", "square_foot", 0.16, 3.4, "Wall area", ["tuckpoint", "repoint", "mortar", "brick repair"]],
  ["masonry.block.wall", "Lay CMU block wall", "square_foot", 0.18, 9.75, "Wall area", ["cmu", "block", "foundation wall"]],
  ["masonry.chimney.repair", "Chimney rebuild/repair", "square_foot", 0.35, 18, "Area", ["chimney", "crown", "masonry repair"]],
]);

add("concrete", "concrete", "flatwork", [
  ["concrete.slab.pour", "Form and pour concrete slab", "square_foot", 0.055, 7.25, "Slab area", ["concrete", "slab", "flatwork", "pour"]],
  ["concrete.sidewalk", "Form and pour sidewalk", "square_foot", 0.06, 7.75, "Walk area", ["sidewalk", "concrete", "walkway"]],
  ["concrete.driveway", "Form and pour driveway", "square_foot", 0.05, 8.5, "Driveway area", ["driveway", "concrete", "apron"]],
  ["concrete.footing.strip", "Excavate and pour strip footing", "linear_foot", 0.25, 22, "LF of footing", ["footing", "foundation", "concrete"]],
  ["concrete.steps.pour", "Form and pour concrete steps", "each", 3.5, 145, "Count of steps", ["steps", "stoop", "concrete"]],
  ["concrete.saw.removal", "Saw cut and remove concrete", "square_foot", 0.06, 1.35, "Area removed", ["concrete removal", "saw cut", "demo"]],
]);

// ---------------- MECHANICAL ----------------
add("plumbing", "plumbing", "rough_and_trim", [
  ["plumbing.rough.fixture", "Rough-in plumbing per fixture", "each", 4.5, 185, "Count of fixtures", ["plumbing rough", "rough in", "supply", "drain"]],
  ["plumbing.toilet.set", "Set toilet", "each", 1.25, 265, "Count", ["toilet", "water closet", "bath"]],
  ["plumbing.lav.faucet", "Install lavatory sink and faucet", "each", 1.75, 285, "Count", ["sink", "lavatory", "faucet", "bath"]],
  ["plumbing.kitchen.sink", "Install kitchen sink and faucet", "each", 2.25, 465, "Count", ["kitchen sink", "faucet", "disposal"]],
  ["plumbing.tub.set", "Set bathtub", "each", 4.5, 725, "Count", ["tub", "bathtub", "bath"]],
  ["plumbing.shower.valve", "Install shower valve and trim", "each", 2.25, 315, "Count", ["shower valve", "trim kit", "mixing valve"]],
  ["plumbing.shower.pan", "Install shower base/pan", "each", 3.5, 585, "Count", ["shower pan", "base", "receptor"]],
  ["plumbing.waterheater.replace", "Replace water heater", "each", 4, 1250, "Count", ["water heater", "tank", "hot water"]],
  ["plumbing.repipe.branch", "Repipe branch line (PEX)", "linear_foot", 0.09, 3.1, "LF of pipe", ["pex", "repipe", "supply line"]],
  ["plumbing.drain.line", "Install DWV drain line", "linear_foot", 0.12, 5.4, "LF of pipe", ["drain", "dwv", "waste line"]],
  ["plumbing.disposal.install", "Install garbage disposal", "each", 1.1, 185, "Count", ["disposal", "garbage disposal"]],
  ["plumbing.shutoff.valve", "Install shutoff/angle stops", "each", 0.4, 28, "Count", ["shutoff", "angle stop", "valve"]],
]);

add("electrical", "electrical", "power_and_lighting", [
  ["electrical.receptacle.new", "Install new receptacle circuit device", "each", 0.85, 32, "Device count", ["outlet", "receptacle", "plug", "electrical"]],
  ["electrical.switch.new", "Install switch and box", "each", 0.75, 28, "Device count", ["switch", "dimmer", "electrical"]],
  ["electrical.light.recessed", "Install recessed LED can light", "each", 1.1, 52, "Count", ["recessed", "can light", "led", "lighting"]],
  ["electrical.light.fixture", "Install surface light fixture", "each", 0.9, 45, "Count", ["light fixture", "sconce", "flush mount"]],
  ["electrical.fan.ceiling", "Install ceiling fan", "each", 1.6, 165, "Count", ["ceiling fan", "fan"]],
  ["electrical.exhaust.bath", "Install bath exhaust fan and vent", "each", 2.5, 175, "Count", ["exhaust fan", "bath fan", "ventilation"]],
  ["electrical.panel.replace", "Replace electrical panel", "each", 10, 1450, "Count", ["panel", "breaker box", "service upgrade"]],
  ["electrical.circuit.dedicated", "Run dedicated circuit", "each", 2.75, 115, "Count of circuits", ["circuit", "dedicated", "homerun"]],
  ["electrical.gfci.protect", "Install GFCI/AFCI protection", "each", 0.6, 42, "Count", ["gfci", "afci", "protection"]],
  ["electrical.smoke.detector", "Install smoke/CO detector", "each", 0.6, 48, "Count", ["smoke detector", "co detector", "alarm"]],
  ["electrical.undercabinet.light", "Install under-cabinet lighting", "linear_foot", 0.18, 18, "LF of run", ["under cabinet", "task lighting", "led strip"]],
  ["electrical.ev.charger", "Install EV charger circuit", "each", 5, 685, "Count", ["ev charger", "level 2", "car charger"]],
]);

add("hvac", "hvac", "mechanical_systems", [
  ["hvac.furnace.replace", "Replace gas furnace", "each", 8, 2850, "Count", ["furnace", "heating", "hvac"]],
  ["hvac.ac.condenser", "Replace AC condenser and coil", "each", 8, 3250, "Count", ["air conditioner", "condenser", "ac", "cooling"]],
  ["hvac.minisplit.install", "Install ductless mini split head", "each", 6.5, 2150, "Count of heads", ["mini split", "ductless", "heat pump"]],
  ["hvac.duct.run", "Install ductwork run", "linear_foot", 0.18, 12.5, "LF of duct", ["duct", "ductwork", "hvac"]],
  ["hvac.register.install", "Install supply/return register", "each", 0.6, 42, "Count", ["register", "grille", "vent"]],
  ["hvac.dryer.vent", "Install dryer vent", "each", 1.5, 65, "Count", ["dryer vent", "exhaust"]],
  ["hvac.thermostat.smart", "Install smart thermostat", "each", 0.75, 185, "Count", ["thermostat", "nest", "smart"]],
  ["hvac.bath.ventline", "Run bath vent to exterior", "linear_foot", 0.15, 8.5, "LF of vent", ["vent line", "bath fan duct"]],
]);

// ---------------- SPECIALTY / WHOLE-ROOM ----------------
add("bathroom_remodel", "specialty", "bathroom", [
  ["bath.remodel.mgmt", "Bathroom remodel project management", "day", 1.5, 0, "Project days", ["project management", "supervision", "bathroom"]],
  ["bath.layout.setout", "Bathroom layout and set out", "each", 2, 0, "Count of bathrooms", ["layout", "set out", "bathroom"]],
  ["bath.accessory.install", "Install bath accessories", "each", 0.3, 38, "Count of accessories", ["towel bar", "accessories", "paper holder"]],
  ["bath.mirror.install", "Install mirror or medicine cabinet", "each", 0.8, 165, "Count", ["mirror", "medicine cabinet"]],
  ["bath.shower.door", "Install shower/tub glass door", "each", 3, 785, "Count", ["shower door", "glass", "enclosure"]],
  ["bath.grabbar.install", "Install ADA grab bars", "each", 0.65, 65, "Count", ["grab bar", "ada", "accessibility"]],
  ["bath.final.clean", "Bathroom final clean and punch", "each", 2, 45, "Count of bathrooms", ["final clean", "punch list"]],
]);

add("kitchen_remodel", "specialty", "kitchen", [
  ["kitchen.remodel.mgmt", "Kitchen remodel project management", "day", 1.5, 0, "Project days", ["project management", "supervision", "kitchen"]],
  ["kitchen.layout.setout", "Kitchen layout and set out", "each", 3, 0, "Count", ["layout", "set out", "kitchen"]],
  ["kitchen.appliance.install", "Install appliance", "each", 1.25, 65, "Count of appliances", ["appliance", "range", "dishwasher", "install"]],
  ["kitchen.hood.vent", "Install range hood and venting", "each", 3.5, 485, "Count", ["range hood", "vent hood", "exhaust"]],
  ["kitchen.island.build", "Build and set kitchen island", "each", 6, 1250, "Count", ["island", "kitchen", "peninsula"]],
  ["kitchen.final.clean", "Kitchen final clean and punch", "each", 3, 65, "Count", ["final clean", "punch list"]],
]);

add("basement_finish", "specialty", "basement", [
  ["basement.finish.mgmt", "Basement finish project management", "day", 1.5, 0, "Project days", ["project management", "basement"]],
  ["basement.moisture.control", "Moisture control and vapor barrier", "square_foot", 0.012, 0.85, "Floor/wall area", ["vapor barrier", "moisture", "basement"]],
  ["basement.egress.compliance", "Egress and code compliance review", "each", 2.5, 0, "Count", ["egress", "code", "permit", "basement"]],
  ["basement.soffit.build", "Build soffits and chases", "linear_foot", 0.28, 8.5, "LF of soffit", ["soffit", "chase", "bulkhead"]],
  ["basement.sump.install", "Install sump pump system", "each", 6, 685, "Count", ["sump pump", "drainage", "basement"]],
]);

add("garage_conversion", "specialty", "garage", [
  ["garage.convert.mgmt", "Garage conversion project management", "day", 1.5, 0, "Project days", ["project management", "garage"]],
  ["garage.slab.level", "Level and prep garage slab", "square_foot", 0.035, 2.1, "Slab area", ["slab prep", "level", "garage"]],
  ["garage.door.infill", "Infill garage door opening", "each", 12, 950, "Count of openings", ["garage door infill", "wall infill"]],
  ["garage.hvac.extend", "Extend HVAC to converted space", "each", 8, 985, "Count", ["hvac extension", "garage", "conditioning"]],
]);

add("additions", "specialty", "addition", [
  ["addition.mgmt", "Addition project management", "day", 2, 0, "Project days", ["project management", "addition"]],
  ["addition.foundation", "Addition foundation system", "square_foot", 0.12, 22, "Footprint area", ["foundation", "addition", "footing"]],
  ["addition.shell.frame", "Frame addition shell", "square_foot", 0.14, 26, "Floor area", ["shell", "framing", "addition"]],
  ["addition.tiein.roof", "Roof tie-in to existing structure", "linear_foot", 0.45, 28, "LF of tie-in", ["tie in", "roof", "addition"]],
  ["addition.permit.coordination", "Permit and inspection coordination", "each", 6, 0, "Count of permits", ["permit", "inspection", "coordination"]],
]);

add("handyman", "handyman", "small_jobs", [
  ["handyman.hourly.service", "Handyman service — hourly", "hour", 1, 0, "Estimated hours", ["handyman", "hourly", "service call"]],
  ["handyman.tv.mount", "Mount TV on wall", "each", 1.25, 75, "Count", ["tv mount", "bracket"]],
  ["handyman.faucet.swap", "Replace faucet", "each", 1.1, 165, "Count", ["faucet", "replace", "swap"]],
  ["handyman.blinds.install", "Install blinds or shades", "each", 0.5, 85, "Count of windows", ["blinds", "shades", "window covering"]],
  ["handyman.door.adjust", "Adjust/repair door operation", "each", 0.6, 15, "Count", ["door repair", "adjust", "sticking door"]],
  ["handyman.caulk.refresh", "Re-caulk tub, shower or sink", "each", 0.9, 18, "Count", ["caulk", "recaulk", "tub", "sealant"]],
  ["handyman.drywall.anchor", "Install shelving/anchors", "each", 0.4, 22, "Count", ["anchor", "shelf", "mount"]],
]);

add("accessibility", "specialty", "accessibility", [
  ["access.ramp.build", "Build accessibility ramp", "linear_foot", 0.55, 48, "LF of ramp run", ["ramp", "ada", "accessibility", "wheelchair"]],
  ["access.door.widen", "Widen doorway for accessibility", "each", 6.5, 385, "Count", ["widen door", "ada", "36 inch"]],
  ["access.shower.curbless", "Convert to curbless roll-in shower", "each", 16, 2450, "Count", ["curbless", "roll in shower", "ada"]],
  ["access.comfort.toilet", "Install comfort-height toilet", "each", 1.4, 385, "Count", ["comfort height", "ada toilet"]],
]);

add("restoration", "specialty", "restoration", [
  ["restore.water.mitigation", "Water damage mitigation and drying", "square_foot", 0.02, 0.65, "Affected area", ["water damage", "drying", "mitigation", "restoration"]],
  ["restore.mold.remediation", "Mold remediation — contained area", "square_foot", 0.06, 2.4, "Affected area", ["mold", "remediation", "containment"]],
  ["restore.smoke.cleaning", "Smoke and soot cleaning", "square_foot", 0.03, 0.55, "Affected area", ["smoke", "soot", "fire damage"]],
  ["restore.content.pack", "Content pack-out and storage", "cubic_foot", 0.05, 1.1, "Volume", ["pack out", "contents", "storage"]],
]);

add("cleanup", "handyman", "site_services", [
  ["cleanup.daily.site", "Daily site cleanup", "day", 1, 15, "Project days", ["cleanup", "site", "daily"]],
  ["cleanup.final.construction", "Final construction clean", "square_foot", 0.006, 0.1, "Floor area", ["final clean", "construction clean"]],
  ["cleanup.dust.containment", "Dust containment setup", "each", 1.5, 95, "Count of zones", ["containment", "zip wall", "dust"]],
  ["cleanup.portable.toilet", "Portable toilet rental", "each", 0.25, 165, "Count of months", ["porta potty", "portable toilet", "rental"]],
]);

// ---------------- COVERAGE PASS: gaps found against live contractor scopes ----------------
// Every item below closes a phrase that contractors actually write but the
// v1 library could not price. Units are chosen to match how the phrase is
// measured in the field, because a unit mismatch blocks automatic pricing.

add("permits", "specialty", "compliance", [
  ["permits.building.fee", "Building permit fee allowance", "each", 1.5, 650, "Count of permits", ["building permit", "permit", "jurisdiction", "fee"]],
  ["permits.electrical.fee", "Electrical permit fee allowance", "each", 0.75, 185, "Count of permits", ["electrical permit", "permit", "fee"]],
  ["permits.plumbing.fee", "Plumbing permit fee allowance", "each", 0.75, 185, "Count of permits", ["plumbing permit", "permit", "fee"]],
  ["permits.mechanical.fee", "Mechanical permit fee allowance", "each", 0.75, 165, "Count of permits", ["mechanical permit", "hvac permit", "permit"]],
  ["permits.inspection.schedule", "Schedule and attend inspections", "each", 1.5, 0, "Count of inspections", ["inspection", "schedule", "permit", "sign off"]],
]);

add("framing", "framing", "rough_carpentry_coverage", [
  ["framing.window.reframe", "Relocate and reframe window opening", "each", 6, 185, "Count of openings", ["reframe", "relocate window", "move window", "opening"]],
  ["framing.opening.infill", "Close in and frame over existing opening", "each", 5, 145, "Count of openings", ["close in", "infill", "opening", "door", "window"]],
  ["framing.post.structural", "Install structural post and bearing", "each", 2.5, 125, "Count of posts", ["post", "column", "bearing", "structural"]],
]);

add("demo", "demolition", "interior_coverage", [
  ["demo.door.remove", "Remove existing door and frame", "each", 0.9, 0.05, "Count of doors", ["remove door", "demo", "door", "frame"]],
  ["demo.appliance.disconnect", "Disconnect and remove appliances", "each", 0.8, 0.05, "Count of appliances", ["appliance", "disconnect", "remove", "demo"]],
]);

add("drywall", "drywall", "repair", [
  ["drywall.repair.area", "Repair and re-finish damaged drywall area", "square_foot", 0.05, 0.95, "Repaired wall/ceiling area", ["drywall repair", "repair", "patch", "refinish"]],
]);

add("insulation", "insulation", "thermal_coverage", [
  ["insulation.batt.floor", "Install batt insulation — floor", "square_foot", 0.015, 1.05, "Floor area", ["insulation", "floor", "batt", "underfloor"]],
]);

add("electrical", "electrical", "modifications", [
  ["electrical.device.relocate", "Relocate existing device or circuit", "each", 1.4, 28, "Count of devices", ["relocate", "electrical relocation", "move outlet", "circuit"]],
]);

add("hvac", "hvac", "modifications", [
  ["hvac.relocate.equipment", "Relocate HVAC register, duct or equipment", "each", 3.5, 145, "Count of relocations", ["hvac relocation", "relocate", "duct", "register"]],
]);

add("painting", "painting", "repair_finishes", [
  ["painting.blend.touchup", "Blend and touch up existing paint", "each", 1.5, 22, "Count of areas", ["paint blending", "touch up", "blend", "paint"]],
]);

add("plumbing", "plumbing", "modifications", [
  ["plumbing.rough.adjust", "Adjust existing rough plumbing", "each", 2.2, 65, "Count of adjustments", ["rough in", "adjust", "relocate", "plumbing"]],
]);

add("flooring", "flooring", "repair", [
  ["flooring.patch.area", "Patch and infill existing flooring", "each", 2.5, 85, "Count of patch areas", ["floor patching", "patch", "infill", "flooring"]],
]);

add("bath", "specialty", "shower_systems", [
  ["bath.shower.waterproof.system", "Waterproof shower enclosure system", "each", 6, 285, "Count of showers", ["shower waterproofing", "waterproof", "membrane", "pan"]],
  ["bath.shower.niche", "Build and tile shower niche", "each", 2.5, 95, "Count of niches", ["niche", "shower niche", "recess"]],
  ["bath.shower.glass.frameless", "Install frameless glass shower enclosure", "each", 4, 1450, "Count of enclosures", ["frameless", "glass shower", "enclosure"]],
]);

add("trim", "trim", "finish_carpentry_coverage", [
  ["trim.base.removereinstall", "Remove and reinstall existing baseboard", "linear_foot", 0.06, 0.35, "LF of base", ["baseboard", "remove and reinstall", "r and r", "trim"]],
]);


const DEFAULT_MARKUP = 15;
const DEFAULT_OVERHEAD = 10;
const DEFAULT_PROFIT = 10;

const rows = [];
let sort = 0;
for (const group of CATEGORIES) {
  const [crew, skill, waste, equipment, safety] = TRADE[group.tradeKey];
  for (const [key, name, unit, hours, material, measurement, keywords] of group.items) {
    sort += 1;
    const production = hours > 0 ? Math.round((1 / hours) * 100) / 100 : null;
    rows.push({
      assembly_key: key,
      trade_key: group.tradeKey,
      category_key: group.categoryKey,
      subcategory_key: group.subcategoryKey,
      work_item: name,
      default_scope_description: `${name}. Includes layout, materials handling, installation per manufacturer instructions, and cleanup of work area. Sample production assumption — verify against field conditions.`,
      client_description: name,
      unit_key: unit,
      measurement_method: measurement,
      production_rate: production,
      default_labor_hours: hours,
      crew_size: crew,
      skill_level: skill,
      material_allowance: material,
      waste_factor: waste,
      equipment_requirements: equipment,
      suggested_markup_pct: DEFAULT_MARKUP,
      default_overhead_pct: DEFAULT_OVERHEAD,
      suggested_profit_pct: DEFAULT_PROFIT,
      estimated_duration_hours: Math.round(hours * 100) / 100,
      typical_dependencies: [],
      internal_notes: "Sample assumption from VisionWorx360 Library v1. Adjust to your crew and market.",
      safety_notes: safety,
      code_reference: "TBD — verify against locally adopted code edition",
      inspection_notes: "TBD — confirm required inspections with local jurisdiction",
      keywords: [...new Set([...keywords, group.categoryKey, group.tradeKey])],
      synonyms: keywords.slice(0, 4),
      sort_order: sort,
    });
  }
}

/** Templates: [key, name, description, category, [ [section, assemblyKey, qty] ... ] ] */
const T = (section, keys) => keys.map((k) => [section, ...(Array.isArray(k) ? k : [k, null])]);
const TEMPLATES = [
  ["tpl.bath.standard", "Standard Bathroom Remodel", "Full hall/standard bathroom gut and rebuild.", "bathroom_remodel", [
    ...T("Demolition", ["demo.protect.floors", "demo.bath.fixtures", "demo.tub.surround", "demo.flooring.tile", "demo.drywall.walls", "demo.debris.haul"]),
    ...T("Rough Trades", ["plumbing.rough.fixture", "plumbing.shower.valve", "electrical.circuit.dedicated", "electrical.gfci.protect", "electrical.exhaust.bath", "hvac.bath.ventline"]),
    ...T("Substrate", ["framing.blocking.backing", "insulation.sound.batt", "drywall.hang.wall", "drywall.cement.board", "flooring.tile.waterproof", "drywall.finish.level4"]),
    ...T("Finishes", ["flooring.tile.floor", "flooring.tile.shower", "painting.prime.walls", "painting.walls.twocoat", "painting.ceiling", "trim.base.install", "painting.trim.base"]),
    ...T("Fixtures & Trim", ["cabinets.vanity.install", "countertops.quartz.install", "plumbing.lav.faucet", "plumbing.toilet.set", "plumbing.tub.set", "bath.shower.door", "bath.mirror.install", "bath.accessory.install", "electrical.light.fixture"]),
    ...T("Closeout", ["bath.final.clean", "cleanup.daily.site"]),
  ]],
  ["tpl.bath.master", "Master Bathroom Remodel", "Larger primary bath with tiled shower and double vanity.", "bathroom_remodel", [
    ...T("Demolition", ["demo.protect.floors", "demo.bath.fixtures", "demo.tub.surround", "demo.flooring.tile", "demo.drywall.walls", "demo.debris.haul"]),
    ...T("Rough Trades", ["plumbing.rough.fixture", "plumbing.shower.valve", "plumbing.shower.pan", "electrical.circuit.dedicated", "electrical.exhaust.bath", "electrical.light.recessed", "hvac.bath.ventline"]),
    ...T("Substrate", ["framing.blocking.backing", "insulation.sound.batt", "drywall.hang.wall", "drywall.cement.board", "flooring.tile.waterproof", "drywall.finish.level4"]),
    ...T("Finishes", ["flooring.tile.floor", "flooring.tile.shower", "painting.prime.walls", "painting.walls.twocoat", "painting.ceiling", "trim.base.install", "trim.casing.door"]),
    ...T("Fixtures & Trim", ["cabinets.vanity.install", "countertops.quartz.install", "plumbing.lav.faucet", "plumbing.toilet.set", "bath.shower.door", "bath.mirror.install", "bath.grabbar.install", "electrical.light.fixture"]),
    ...T("Closeout", ["bath.final.clean", "cleanup.final.construction"]),
  ]],
  ["tpl.bath.hall", "Hall Bathroom Refresh", "Cosmetic refresh without moving plumbing.", "bathroom_remodel", [
    ...T("Demolition", ["demo.protect.floors", "demo.bath.fixtures", "demo.flooring.tile", "demo.debris.haul"]),
    ...T("Finishes", ["flooring.tile.floor", "painting.prime.walls", "painting.walls.twocoat", "painting.trim.base", "handyman.caulk.refresh"]),
    ...T("Fixtures", ["cabinets.vanity.install", "plumbing.lav.faucet", "plumbing.toilet.set", "bath.mirror.install", "bath.accessory.install", "electrical.light.fixture"]),
    ...T("Closeout", ["bath.final.clean"]),
  ]],
  ["tpl.kitchen.remodel", "Kitchen Remodel", "Full kitchen replacement with new cabinets and counters.", "kitchen_remodel", [
    ...T("Demolition", ["demo.protect.floors", "demo.cabinets.kitchen", "demo.flooring.tile", "demo.drywall.walls", "demo.debris.haul"]),
    ...T("Rough Trades", ["plumbing.rough.fixture", "electrical.circuit.dedicated", "electrical.gfci.protect", "kitchen.hood.vent", "hvac.duct.run"]),
    ...T("Substrate", ["framing.wall.interior", "drywall.hang.wall", "drywall.hang.ceiling", "drywall.finish.level4", "flooring.level.selfleveling"]),
    ...T("Finishes", ["flooring.lvp.install", "painting.prime.walls", "painting.walls.twocoat", "painting.ceiling", "trim.base.install"]),
    ...T("Cabinets & Tops", ["kitchen.layout.setout", "cabinets.base.install", "cabinets.wall.install", "cabinets.tall.install", "cabinets.toekick.filler", "cabinets.hardware.install", "countertops.quartz.install", "countertops.sink.cutout", "countertops.backsplash.tile"]),
    ...T("Fixtures & Appliances", ["plumbing.kitchen.sink", "plumbing.disposal.install", "kitchen.appliance.install", "electrical.light.recessed", "electrical.undercabinet.light"]),
    ...T("Closeout", ["kitchen.final.clean", "cleanup.final.construction"]),
  ]],
  ["tpl.basement.finish", "Basement Finish", "Convert unfinished basement to living space.", "basement_finish", [
    ...T("Preparation", ["basement.finish.mgmt", "basement.moisture.control", "basement.egress.compliance", "cleanup.dust.containment"]),
    ...T("Framing", ["framing.wall.furring", "framing.wall.interior", "framing.header.opening", "basement.soffit.build", "framing.blocking.backing"]),
    ...T("Rough Trades", ["electrical.circuit.dedicated", "electrical.receptacle.new", "electrical.switch.new", "electrical.light.recessed", "electrical.smoke.detector", "plumbing.rough.fixture", "hvac.duct.run", "hvac.register.install", "windows.egress.basement"]),
    ...T("Insulation & Drywall", ["insulation.batt.wall", "insulation.foam.rim", "drywall.hang.wall", "drywall.hang.ceiling", "drywall.corner.bead", "drywall.finish.level4"]),
    ...T("Finishes", ["painting.prime.walls", "painting.walls.twocoat", "painting.ceiling", "flooring.lvp.install", "trim.base.install", "trim.casing.door", "doors.interior.prehung", "doors.hardware.set"]),
    ...T("Closeout", ["cleanup.final.construction", "demo.debris.haul"]),
  ]],
  ["tpl.deck.build", "Deck Build", "New pressure-treated frame with composite decking.", "decks", [
    ...T("Site & Structure", ["decks.footing.install", "decks.ledger.flash", "decks.frame.build"]),
    ...T("Decking & Rail", ["decks.decking.composite", "decks.railing.install", "decks.stairs.build"]),
    ...T("Finishes", ["painting.stain.deck", "electrical.light.fixture"]),
    ...T("Closeout", ["cleanup.daily.site", "demo.debris.haul"]),
  ]],
  ["tpl.garage.conversion", "Garage Conversion", "Convert attached garage to conditioned living space.", "garage_conversion", [
    ...T("Preparation", ["garage.convert.mgmt", "garage.slab.level", "cleanup.dust.containment"]),
    ...T("Shell", ["garage.door.infill", "framing.wall.exterior", "framing.wall.interior", "windows.replace.fullframe", "insulation.batt.wall", "insulation.batt.ceiling"]),
    ...T("Rough Trades", ["electrical.circuit.dedicated", "electrical.receptacle.new", "electrical.switch.new", "garage.hvac.extend", "hvac.register.install"]),
    ...T("Finishes", ["drywall.hang.wall", "drywall.hang.ceiling", "drywall.finish.level4", "painting.prime.walls", "painting.walls.twocoat", "flooring.lvp.install", "trim.base.install", "doors.interior.prehung"]),
    ...T("Closeout", ["cleanup.final.construction"]),
  ]],
  ["tpl.roof.replacement", "Roof Replacement", "Tear-off and re-roof with architectural shingles.", "roofing", [
    ...T("Tear-off", ["roofing.shingle.tearoff", "roofing.decking.replace", "demo.debris.haul"]),
    ...T("Install", ["roofing.underlayment.synthetic", "roofing.iceandwater", "roofing.shingle.install", "roofing.valley.metal", "roofing.flashing.step", "roofing.pipe.boot", "roofing.ridge.vent"]),
    ...T("Closeout", ["gutters.clean.service", "cleanup.daily.site"]),
  ]],
  ["tpl.interior.paint", "Whole-House Interior Paint", "Prep, prime and paint interior surfaces.", "painting", [
    ...T("Preparation", ["demo.protect.floors", "painting.caulk.prep", "drywall.patch.small"]),
    ...T("Paint", ["painting.prime.walls", "painting.walls.twocoat", "painting.ceiling", "painting.trim.base", "painting.doors.slab"]),
    ...T("Closeout", ["cleanup.final.construction"]),
  ]],
  ["tpl.siding.replacement", "Siding Replacement", "Remove and replace exterior cladding.", "siding", [
    ...T("Removal", ["siding.repair.patch", "demo.debris.haul"]),
    ...T("Install", ["siding.wrap.house", "siding.fibercement.install", "siding.trim.corner", "siding.soffit.fascia", "windows.trim.exterior", "windows.flash.seal"]),
    ...T("Closeout", ["gutters.seamless.install", "gutters.downspout.install", "painting.exterior.siding", "cleanup.daily.site"]),
  ]],
];

const lines = [];
lines.push("-- GENERATED FILE — do not edit by hand.");
lines.push("-- Source: scripts/generate-knowledge-base-seed.mjs");
lines.push("-- VisionWorx360 Contractor Knowledge Base — Library v1 (SAMPLE data, not licensed cost data).");
lines.push("BEGIN;");
lines.push("");

const cols = [
  "library_version", "assembly_key", "trade_key", "category_key", "subcategory_key", "work_item",
  "default_scope_description", "client_description", "unit_key", "measurement_method",
  "production_rate", "default_labor_hours", "crew_size", "skill_level", "material_allowance",
  "waste_factor", "equipment_requirements", "suggested_markup_pct", "default_overhead_pct",
  "suggested_profit_pct", "estimated_duration_hours", "typical_dependencies", "internal_notes",
  "safety_notes", "code_reference", "inspection_notes", "keywords", "synonyms",
  "is_sample_data", "is_active", "sort_order",
];

lines.push(`INSERT INTO public.catalog_assemblies (${cols.join(", ")}) VALUES`);
lines.push(
  rows
    .map((r) =>
      "  (1, " +
      [
        q(r.assembly_key), q(r.trade_key), q(r.category_key), q(r.subcategory_key), q(r.work_item),
        q(r.default_scope_description), q(r.client_description), `${q(r.unit_key)}::public.scope_unit`,
        q(r.measurement_method), num(r.production_rate), num(r.default_labor_hours), num(r.crew_size),
        q(r.skill_level), num(r.material_allowance), num(r.waste_factor), q(r.equipment_requirements),
        num(r.suggested_markup_pct), num(r.default_overhead_pct), num(r.suggested_profit_pct),
        num(r.estimated_duration_hours), arr(r.typical_dependencies), q(r.internal_notes),
        q(r.safety_notes), q(r.code_reference), q(r.inspection_notes), arr(r.keywords), arr(r.synonyms),
        "true", "true", num(r.sort_order),
      ].join(", ") + ")",
    )
    .join(",\n"),
);
lines.push("ON CONFLICT (library_version, assembly_key) DO NOTHING;");
lines.push("");

const known = new Set(rows.map((r) => r.assembly_key));
for (const [key, name, description, category, items] of TEMPLATES) {
  const missing = items.filter(([, k]) => !known.has(k));
  if (missing.length) throw new Error(`Template ${key} references unknown assemblies: ${missing.map((m) => m[1]).join(", ")}`);
  lines.push(
    `INSERT INTO public.assembly_templates (organization_id, library_version, template_key, name, description, category_key, is_system_template)\n` +
      `VALUES (NULL, 1, ${q(key)}, ${q(name)}, ${q(description)}, ${q(category)}, true)\n` +
      `ON CONFLICT DO NOTHING;`,
  );
  const values = items
    .map(([section, aKey, qty], i) =>
      `  ((SELECT id FROM public.assembly_templates WHERE template_key = ${q(key)} AND organization_id IS NULL), NULL, ${q(section)}, ${q(aKey)}, ${num(qty)}, ${i})`,
    )
    .join(",\n");
  lines.push(
    `INSERT INTO public.assembly_template_items (template_id, organization_id, section_label, assembly_key, quantity, sort_order) VALUES\n${values};`,
  );
  lines.push("");
}

lines.push("COMMIT;");

mkdirSync("supabase/seed", { recursive: true });
writeFileSync("supabase/seed/knowledge-base-v1.sql", lines.join("\n"));
console.log(`assemblies: ${rows.length}`);
console.log(`templates: ${TEMPLATES.length}`);
console.log(`template items: ${TEMPLATES.reduce((n, t) => n + t[4].length, 0)}`);
