/**
 * Deterministic scope-phrase → Knowledge Base intent map (Pricing Coverage pass).
 *
 * WHY THIS EXISTS
 * ---------------
 * Free-text overlap scoring ("Frame walls to code" ↔ "Frame interior 2x4
 * partition wall") is unreliable: it either misses (no shared words) or fires
 * on the wrong assembly. Contractor scope language is, however, highly
 * repetitive. This module encodes that language explicitly:
 *
 *   phrase → one assembly            (single mapping)
 *   phrase → several assemblies      (composite: priced as the sum of parts)
 *   phrase → review                  (recognized, but NOT safe to price)
 *
 * A `review` mapping is a feature, not a gap: "Install finished flooring" is a
 * real phrase with no defensible price until the contractor picks a material.
 * The engine refuses to guess and says why.
 *
 * INTEGRITY RULES (mirrored exactly by `kb_apply_pricing` in SQL)
 *  - An intent mapping applies only when the line unit is absent or equal to
 *    the assembly unit. A unit mismatch downgrades to review, never prices.
 *  - A contractor-confirmed catalog mapping always outranks an intent mapping.
 *  - Intent mappings score 90 (exact phrase) / 80 (contained phrase), so they
 *    sit above fuzzy text overlap and below confirmed keys.
 *
 * Pure data + pure functions — no React, no Supabase, no IO.
 */

import { INTENT_RULES_V2 } from "./intentMapV2";

export type IntentUnit = "each" | "square_foot" | "linear_foot" | "hour" | "day" | "cubic_yard";

export type IntentReviewReason =
  | "ambiguous_material_selection"
  | "ambiguous_multi_scope"
  | "missing_measured_quantity"
  | "unit_mismatch";

export interface IntentComponent {
  assemblyKey: string;
  /** Multiplier applied to the line quantity for this component. */
  quantityFactor: number;
  /** What this component covers, for the contractor-facing breakdown. */
  role: string;
}

export interface IntentRule {
  /** Human phrase as contractors write it. Normalized before comparison. */
  phrase: string;
  /** `exact` matches the whole description; `contains` matches a substring. */
  matchKind: "exact" | "contains";
  /** Priority breaks ties; higher wins. Longer phrases win by default. */
  priority?: number;
  /** Assemblies that price this phrase. Empty when `review` is set. */
  components?: IntentComponent[];
  /** Set instead of components when the phrase is known but not priceable. */
  review?: IntentReviewReason;
  /** Contractor-facing note explaining a review outcome. */
  note?: string;
}

const one = (assemblyKey: string, role: string): IntentComponent[] => [
  { assemblyKey, quantityFactor: 1, role },
];

/**
 * The alias table. Ordered by domain, not by priority — resolution sorts.
 * Every assembly key referenced here must exist in the seeded library; the
 * coverage test enforces that.
 */
export const INTENT_RULES: IntentRule[] = [
  /* ---------------- permits and compliance ---------------- */
  { phrase: "building permit", matchKind: "contains", components: one("permits.building.fee", "permit fee") },
  { phrase: "electrical permit and inspection", matchKind: "contains", components: [
    { assemblyKey: "permits.electrical.fee", quantityFactor: 1, role: "permit fee" },
    { assemblyKey: "permits.inspection.schedule", quantityFactor: 1, role: "inspection coordination" },
  ] },
  { phrase: "electrical permit", matchKind: "contains", components: one("permits.electrical.fee", "permit fee") },
  { phrase: "plumbing permit", matchKind: "contains", components: one("permits.plumbing.fee", "permit fee") },
  { phrase: "mechanical permit", matchKind: "contains", components: one("permits.mechanical.fee", "permit fee") },
  { phrase: "permit and inspection", matchKind: "contains", priority: 90, components: one("permits.inspection.schedule", "inspection coordination") },

  /* ---------------- framing and structure ---------------- */
  { phrase: "frame walls to code", matchKind: "contains", components: one("framing.wall.interior", "wall framing") },
  { phrase: "frame interior walls", matchKind: "contains", components: one("framing.wall.interior", "wall framing") },
  { phrase: "frame new walls", matchKind: "contains", components: one("framing.wall.interior", "wall framing") },
  { phrase: "move and reframe", matchKind: "contains", components: one("framing.window.reframe", "window relocation") },
  { phrase: "remove and reframe", matchKind: "contains", components: one("framing.window.reframe", "opening reframe") },
  { phrase: "relocate window", matchKind: "contains", components: one("framing.window.reframe", "window relocation") },
  { phrase: "close in existing", matchKind: "contains", components: one("framing.opening.infill", "opening infill") },
  { phrase: "close in opening", matchKind: "contains", components: one("framing.opening.infill", "opening infill") },
  { phrase: "infill opening", matchKind: "contains", components: one("framing.opening.infill", "opening infill") },
  { phrase: "cut out and frame opening", matchKind: "contains", components: one("framing.header.opening", "rough opening") },
  { phrase: "frame opening", matchKind: "contains", priority: 90, components: one("framing.header.opening", "rough opening") },
  // Installing an LVL is real structural labor + material, so this phrase prices
  // the beam per linear foot of measured/assumed span instead of being blocked.
  // Posts are carried in the beam assembly; the span stays flagged `assumed`
  // until the contractor confirms the engineered length.
  { phrase: "lvl beam and posts", matchKind: "contains",
    components: one("framing.beam.lvl", "structural beam and bearing posts"),
    note: "Beam length assumed from the widest measured span; confirm the engineered length and post count." },
  { phrase: "lvl beam", matchKind: "contains", priority: 90, components: one("framing.beam.lvl", "structural beam") },
  { phrase: "structural post", matchKind: "contains", components: one("framing.post.structural", "bearing post") },
  { phrase: "temporary shoring", matchKind: "contains", components: one("framing.shoring.temporary", "temporary support") },
  { phrase: "temporary support", matchKind: "contains", components: one("framing.shoring.temporary", "temporary support") },
  { phrase: "shoring", matchKind: "contains", priority: 80, components: one("framing.shoring.temporary", "temporary support") },
  { phrase: "structural engineering", matchKind: "contains", components: one("specialty.engineering.stamp", "engineering allowance") },
  { phrase: "engineer detail", matchKind: "contains", components: one("specialty.engineering.stamp", "engineering allowance") },
  { phrase: "engineered detail", matchKind: "contains", components: one("specialty.engineering.stamp", "engineering allowance") },

  /* ---------------- beam / column finish and built-ins ---------------- */
  { phrase: "drywall wrap beam", matchKind: "contains", components: one("drywall.beam.wrap", "drywall beam wrap") },
  { phrase: "drywall beam wrap", matchKind: "contains", components: one("drywall.beam.wrap", "drywall beam wrap") },
  { phrase: "wrap beam", matchKind: "contains", priority: 85, components: one("trim.beam.wrap", "beam wrap") },
  { phrase: "beam wrap", matchKind: "contains", priority: 85, components: one("trim.beam.wrap", "beam wrap") },
  { phrase: "boxed beam", matchKind: "contains", components: one("trim.beam.wrap", "beam wrap") },
  { phrase: "wrap column", matchKind: "contains", components: one("trim.column.wrap", "column wrap") },
  { phrase: "column wrap", matchKind: "contains", components: one("trim.column.wrap", "column wrap") },
  { phrase: "wrap post", matchKind: "contains", components: one("trim.column.wrap", "post wrap") },
  { phrase: "post wrap", matchKind: "contains", components: one("trim.column.wrap", "post wrap") },
  { phrase: "built-in bookcase", matchKind: "contains", components: one("trim.bookcase.builtin", "built-in casework") },
  { phrase: "built in bookcase", matchKind: "contains", components: one("trim.bookcase.builtin", "built-in casework") },
  { phrase: "bookcase", matchKind: "contains", priority: 80, components: one("trim.bookcase.builtin", "built-in casework") },
  { phrase: "built-in shelving", matchKind: "contains", components: one("trim.bookcase.builtin", "built-in casework") },
  /* Contractors say "casework" and "built-ins" as often as "bookcase". */
  { phrase: "casework", matchKind: "contains", priority: 80, components: one("trim.bookcase.builtin", "built-in casework") },
  { phrase: "built-in cabinetry", matchKind: "contains", components: one("trim.bookcase.builtin", "built-in casework") },
  { phrase: "built-ins", matchKind: "contains", priority: 78, components: one("trim.bookcase.builtin", "built-in casework") },
  { phrase: "built ins", matchKind: "contains", priority: 78, components: one("trim.bookcase.builtin", "built-in casework") },
  { phrase: "decorative molding", matchKind: "contains", components: one("trim.molding.decorative", "decorative molding") },
  { phrase: "panel molding", matchKind: "contains", components: one("trim.molding.decorative", "decorative molding") },
  { phrase: "chair rail", matchKind: "contains", components: one("trim.molding.decorative", "decorative molding") },
  { phrase: "remove bearing wall", matchKind: "contains", components: one("demo.wall.bearing", "bearing wall demo") },
  { phrase: "bearing wall demo", matchKind: "contains", components: one("demo.wall.bearing", "bearing wall demo") },
  { phrase: "load bearing wall", matchKind: "contains", priority: 85, components: one("demo.wall.bearing", "bearing wall demo") },
  { phrase: "structural opening", matchKind: "contains", priority: 80, components: one("demo.wall.bearing", "bearing wall demo") },
  { phrase: "bearing column", matchKind: "contains", components: one("framing.post.structural", "bearing column") },
  { phrase: "structural column", matchKind: "contains", components: one("framing.post.structural", "bearing column") },
  { phrase: "supporting post", matchKind: "contains", priority: 70, components: one("framing.post.structural", "bearing post") },


  /* ---------------- demolition ---------------- */
  { phrase: "remove existing garage partition wall", matchKind: "contains", components: one("demo.wall.nonbearing", "wall demo") },
  { phrase: "remove existing partition wall", matchKind: "contains", components: one("demo.wall.nonbearing", "wall demo") },
  /*
   * GENERIC wall / closet demolition. Contractors say "remove the wall between
   * the rooms" far more often than "remove existing partition wall", and a
   * missing generic alias here is what silently dropped real demolition scope
   * to $0. Non-bearing is the conservative default; the bearing aliases above
   * outrank it whenever the contractor says the wall carries load.
   */
  { phrase: "remove wall between", matchKind: "contains", priority: 88, components: one("demo.wall.nonbearing", "wall demo") },
  { phrase: "wall removal", matchKind: "contains", priority: 75, components: one("demo.wall.nonbearing", "wall demo") },
  { phrase: "remove wall", matchKind: "contains", priority: 70, components: one("demo.wall.nonbearing", "wall demo") },
  { phrase: "remove the wall", matchKind: "contains", priority: 72, components: one("demo.wall.nonbearing", "wall demo") },
  { phrase: "closet removal", matchKind: "contains", priority: 80, components: one("demo.wall.nonbearing", "closet demo") },
  { phrase: "closet enclosure removed", matchKind: "contains", priority: 82, components: one("demo.wall.nonbearing", "closet demo") },
  { phrase: "remove closet", matchKind: "contains", priority: 78, components: one("demo.wall.nonbearing", "closet demo") },
  { phrase: "remove existing back entry door", matchKind: "contains", components: one("demo.door.remove", "door removal") },
  { phrase: "remove existing door", matchKind: "contains", priority: 90, components: one("demo.door.remove", "door removal") },
  { phrase: "remove existing cabinets and countertops", matchKind: "contains", components: one("demo.cabinets.kitchen", "cabinet and top demo") },
  { phrase: "remove existing cabinets", matchKind: "contains", priority: 90, components: one("demo.cabinets.kitchen", "cabinet demo") },
  { phrase: "disconnect and remove appliances", matchKind: "contains", components: one("demo.appliance.disconnect", "appliance removal") },

  { phrase: "remove flooring", matchKind: "contains", review: "ambiguous_material_selection",
    note: "Carpet, tile and hardwood remove at very different rates — choose the existing floor type." },

  /* ---------------- insulation ---------------- */
  { phrase: "insulate walls, ceiling, floor — walls", matchKind: "contains", components: one("insulation.batt.wall", "wall insulation") },
  { phrase: "insulate walls, ceiling, floor — ceiling", matchKind: "contains", components: one("insulation.batt.ceiling", "ceiling insulation") },
  { phrase: "insulate walls, ceiling, floor — floor", matchKind: "contains", components: one("insulation.batt.floor", "floor insulation") },
  { phrase: "insulate walls", matchKind: "contains", priority: 80, components: one("insulation.batt.wall", "wall insulation") },
  { phrase: "insulate ceiling", matchKind: "contains", priority: 80, components: one("insulation.batt.ceiling", "ceiling insulation") },
  { phrase: "insulate floor", matchKind: "contains", priority: 80, components: one("insulation.batt.floor", "floor insulation") },

  /* ---------------- drywall and paint ---------------- */
  { phrase: "drywall repair", matchKind: "contains", components: one("drywall.repair.area", "drywall repair") },
  { phrase: "repair drywall", matchKind: "contains", components: one("drywall.repair.area", "drywall repair") },
  { phrase: "prime and paint walls and ceilings", matchKind: "contains", components: [
    { assemblyKey: "painting.prime.walls", quantityFactor: 1, role: "primer" },
    { assemblyKey: "painting.walls.twocoat", quantityFactor: 1, role: "wall finish coats" },
    { assemblyKey: "painting.ceiling", quantityFactor: 1, role: "ceiling finish" },
  ] },
  { phrase: "prime and paint walls", matchKind: "contains", priority: 90, components: [
    { assemblyKey: "painting.prime.walls", quantityFactor: 1, role: "primer" },
    { assemblyKey: "painting.walls.twocoat", quantityFactor: 1, role: "wall finish coats" },
  ] },
  { phrase: "prime and paint trim", matchKind: "contains", components: one("painting.trim.base", "trim paint") },
  { phrase: "paint blending", matchKind: "contains", components: one("painting.blend.touchup", "paint blending") },
  { phrase: "touch up paint", matchKind: "contains", components: one("painting.blend.touchup", "paint touch-up") },

  /* ---------------- flooring and trim ---------------- */
  { phrase: "subfloor prep and leveling", matchKind: "contains", components: one("flooring.level.selfleveling", "floor prep") },
  { phrase: "floor patching", matchKind: "contains", components: one("flooring.patch.area", "floor patching") },
  { phrase: "transitions and thresholds", matchKind: "contains", components: one("flooring.transition.strip", "transitions") },
  { phrase: "install finished flooring", matchKind: "contains", review: "ambiguous_material_selection",
    note: "Pick the flooring material (LVP, tile, hardwood or carpet) to price this line." },
  { phrase: "install new kitchen flooring", matchKind: "contains", review: "ambiguous_material_selection",
    note: "Pick the flooring material to price this line." },
  { phrase: "baseboard removal and reinstall", matchKind: "contains", components: one("trim.base.removereinstall", "baseboard R&R") },
  { phrase: "install/replace baseboards", matchKind: "contains", components: one("trim.base.install", "baseboard") },
  { phrase: "install baseboards", matchKind: "contains", priority: 80, components: one("trim.base.install", "baseboard") },
  { phrase: "install interior doors and trim", matchKind: "contains", components: [
    { assemblyKey: "doors.interior.prehung", quantityFactor: 1, role: "door" },
    { assemblyKey: "trim.casing.door", quantityFactor: 1, role: "casing" },
  ] },

  /* ---------------- cabinets and tops ---------------- */
  { phrase: "install base and wall cabinets", matchKind: "contains", components: [
    { assemblyKey: "cabinets.base.install", quantityFactor: 1, role: "base cabinets" },
    { assemblyKey: "cabinets.wall.install", quantityFactor: 1, role: "wall cabinets" },
  ] },
  /*
   * Upper/wall cabinetry is its own assembly. Priced with the base key it
   * would carry base-cabinet material money a second time.
   */
  { phrase: "upper cabinets", matchKind: "contains", priority: 92, components: one("cabinets.wall.install", "wall cabinets") },
  { phrase: "wall cabinets", matchKind: "contains", priority: 92, components: one("cabinets.wall.install", "wall cabinets") },
  { phrase: "upper cabinetry", matchKind: "contains", priority: 92, components: one("cabinets.wall.install", "wall cabinets") },
  { phrase: "base cabinets", matchKind: "contains", priority: 92, components: one("cabinets.base.install", "base cabinets") },
  { phrase: "lower cabinets", matchKind: "contains", priority: 92, components: one("cabinets.base.install", "base cabinets") },
  { phrase: "base cabinetry", matchKind: "contains", priority: 92, components: one("cabinets.base.install", "base cabinets") },
  { phrase: "vanity 60", matchKind: "contains", components: one("cabinets.vanity.install", "vanity") },
  { phrase: "vanities", matchKind: "exact", components: one("cabinets.vanity.install", "vanity") },
  { phrase: "vanity", matchKind: "exact", components: one("cabinets.vanity.install", "vanity") },
  { phrase: "template and install countertops", matchKind: "contains", review: "ambiguous_material_selection",
    note: "Pick the countertop material (quartz, granite, laminate or butcher block)." },

  /* ---------------- plumbing ---------------- */
  { phrase: "install rough plumbing for bathroom fixtures", matchKind: "contains", components: one("plumbing.rough.fixture", "fixture rough-in") },
  { phrase: "rough plumbing for sink relocation", matchKind: "contains", components: one("plumbing.rough.fixture", "fixture rough-in") },
  { phrase: "rough plumbing", matchKind: "contains", priority: 80, components: one("plumbing.rough.fixture", "fixture rough-in") },
  { phrase: "plumbing rough-in adjustments", matchKind: "contains", components: one("plumbing.rough.adjust", "rough-in adjustment") },
  { phrase: "install new shutoffs and supply lines", matchKind: "contains", components: one("plumbing.shutoff.valve", "shutoffs") },
  { phrase: "comfort-height toilet", matchKind: "contains", components: one("access.comfort.toilet", "toilet") },
  { phrase: "shower waterproofing", matchKind: "contains", components: one("bath.shower.waterproof.system", "shower waterproofing") },
  { phrase: "shower niche", matchKind: "contains", components: one("bath.shower.niche", "niche") },
  { phrase: "frameless glass shower", matchKind: "contains", components: one("bath.shower.glass.frameless", "glass enclosure") },

  /* ---------------- electrical and HVAC ---------------- */
  { phrase: "gfci / afci protection", matchKind: "contains", components: one("electrical.gfci.protect", "GFCI/AFCI") },
  { phrase: "gfci", matchKind: "contains", priority: 70, components: one("electrical.gfci.protect", "GFCI/AFCI") },
  { phrase: "add dedicated appliance circuits", matchKind: "contains", components: one("electrical.circuit.dedicated", "dedicated circuit") },
  { phrase: "dedicated circuit", matchKind: "contains", priority: 80, components: one("electrical.circuit.dedicated", "dedicated circuit") },
  { phrase: "electrical relocation", matchKind: "contains", components: one("electrical.device.relocate", "device relocation") },
  /* Moving one device is device work, never a whole-room electrical package. */
  { phrase: "relocate receptacle", matchKind: "contains", priority: 92, components: one("electrical.device.relocate", "device relocation") },
  { phrase: "relocate outlet", matchKind: "contains", priority: 92, components: one("electrical.device.relocate", "device relocation") },
  { phrase: "relocate switch", matchKind: "contains", priority: 92, components: one("electrical.device.relocate", "device relocation") },
  { phrase: "move receptacle", matchKind: "contains", priority: 92, components: one("electrical.device.relocate", "device relocation") },
  { phrase: "move outlet", matchKind: "contains", priority: 92, components: one("electrical.device.relocate", "device relocation") },
  { phrase: "receptacle relocation", matchKind: "contains", priority: 92, components: one("electrical.device.relocate", "device relocation") },
  { phrase: "outlet relocation", matchKind: "contains", priority: 92, components: one("electrical.device.relocate", "device relocation") },
  { phrase: "new circuits, outlets, lighting", matchKind: "contains", review: "ambiguous_multi_scope",
    note: "Split into circuits, receptacles and fixtures with counts so each can be priced." },
  { phrase: "hvac relocation", matchKind: "contains", components: one("hvac.relocate.equipment", "HVAC relocation") },
];

/* ---------------- normalization and resolution ---------------- */

/** Mirror of the SQL `kb_norm`: accent-folded, punctuation-stripped, collapsed. */
export function normalizePhrase(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export interface IntentMatch {
  rule: IntentRule;
  normalizedPhrase: string;
  score: number;
}

/** Highest-confidence rule for a description, or null when nothing is known. */
export function resolveIntent(description: string | null | undefined): IntentMatch | null {
  const target = normalizePhrase(description);
  if (!target) return null;

  let best: IntentMatch | null = null;
  for (const rule of allIntentRules()) {
    const normalizedPhrase = normalizePhrase(rule.phrase);
    if (!normalizedPhrase) continue;
    const exact = target === normalizedPhrase;
    const contained = rule.matchKind === "contains" && target.includes(normalizedPhrase);
    if (!exact && !contained) continue;
    const score = exact ? 90 : 80;
    const candidate: IntentMatch = { rule, normalizedPhrase, score };
    if (!best) {
      best = candidate;
      continue;
    }
    const rank = (m: IntentMatch) => [
      m.score,
      m.rule.priority ?? 100,
      m.normalizedPhrase.length,
    ];
    const [as, ap, al] = rank(candidate);
    const [bs, bp, bl] = rank(best);
    if (as > bs || (as === bs && (ap > bp || (ap === bp && al > bl)))) best = candidate;
  }
  return best;
}

/**
 * Library v1 rules plus the Residential Core v2 additions, as one lookup set.
 * v2 rules are authored in `intentMapV2.ts` purely to keep each file readable;
 * matching semantics are identical and ties still break on priority.
 */
export function allIntentRules(): IntentRule[] {
  return [...INTENT_RULES, ...INTENT_RULES_V2];
}

/** Every assembly key the map depends on — used by the coverage test. */
export function intentAssemblyKeys(): string[] {
  const keys = new Set<string>();
  for (const rule of allIntentRules()) {
    for (const component of rule.components ?? []) keys.add(component.assemblyKey);
  }
  return [...keys].sort();
}
