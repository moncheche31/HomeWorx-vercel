/**
 * Practical GC subcontractor taxonomy.
 *
 * A general contractor does not budget "baseboard", "crown", "casing" and
 * "closet shelving" as four subcontractors — they budget FINISH CARPENTRY.
 * Every raw trade/category/group label the estimating engine produces is
 * normalized into this concise, hire-able list so the Trades view reads like a
 * subcontractor budget instead of a tag cloud.
 *
 * Pure module — no React, no IO.
 */

export const LABOR_TRADES = [
  "general_conditions",
  "demolition",
  "sitework_concrete",
  "framing",
  "roofing",
  "exterior",
  "plumbing",
  "electrical",
  "hvac",
  "insulation",
  "drywall",
  "finish_carpentry",
  "flooring",
  "tile",
  "painting",
  "specialty",
  "unassigned",
] as const;

export type LaborTradeKey = (typeof LABOR_TRADES)[number];

export const UNASSIGNED_TRADE: LaborTradeKey = "unassigned";

/** Keyword -> trade. First match wins, so order matters (most specific first). */
const RULES: Array<[readonly string[], LaborTradeKey]> = [
  [["general condition", "general_condition", "mobiliz", "cleanup", "clean up", "clean-up", "debris", "dumpster", "haul", "protection", "permit", "supervision", "overhead", "temporary", "service call"], "general_conditions"],
  [["demo", "tear out", "tearout", "removal", "remove", "strip"], "demolition"],
  [["excavat", "sitework", "site work", "site_work", "grading", "concrete", "footing", "foundation", "slab", "masonry", "brick", "block", "stucco", "paving", "flatwork"], "sitework_concrete"],
  // "Frame a 15.5 x 18 platform floor" is framing, not flooring: the verb the
  // contractor used decides the trade, not the noun the surface happens to be.
  [["framing", "frame ", "reframe", "rough carpentry", "structural", "beam", "header", "joist", "sheathing", "subfloor", "blocking", "platform floor"], "framing"],
  [["roof", "shingle", "gutter", "fascia", "soffit"], "roofing"],
  [["siding", "cladding", "exterior door", "window", "deck", "fence", "landscap"], "exterior"],
  [["plumb", "fixture rough", "water heater", "faucet", "toilet", "shower valve", "drain", "supply line", "gas line"], "plumbing"],
  [["electric", "wiring", "panel", "outlet", "receptacle", "switch", "lighting", "light fixture", "low voltage"], "electrical"],
  [["hvac", "mechanical", "furnace", "duct", "mini split", "mini-split", "ventilation", "exhaust fan", "air condition"], "hvac"],
  [["insulat", "air seal", "vapor barrier"], "insulation"],
  [["drywall", "plaster", "sheetrock", "tape", "mud", "texture"], "drywall"],
  // Tile & waterproofing outranks both flooring and framing: a tiled shower is
  // a tile scope even though the words "floor" and "wall" appear in it.
  [["tile", "backsplash", "grout", "shower surround", "shower pan", "waterproof", "cement board", "backer board", "schluter", "kerdi", "mortar bed"], "tile"],
  [["finish carpentry", "carpentry", "millwork", "cabinet", "trim", "baseboard", "crown", "casing", "stair", "railing", "built-in", "built in", "shelv", "closet", "interior door", "hardware", "countertop", "vanity"], "finish_carpentry"],
  [["floor", "carpet", "vinyl", "lvp", "laminate", "hardwood"], "flooring"],
  [["paint", "stain", "finishes", "primer", "coating", "refinish"], "painting"],
  [["appliance", "specialty", "other", "misc"], "specialty"],
];

/**
 * The vocabularies the rest of the app authors work in. Every key here MUST
 * resolve to a real labor trade — keyword matching is a fallback for free
 * text, never the mechanism for a known key.
 *
 * `CATALOG_TRADE_KEYS` mirrors `catalog_assemblies.trade_key`.
 * `SCOPE_AUTHORING_TRADE_KEYS` mirrors `SCOPE_TRADES` in the scope builder.
 * `src/tests/estimating/tradeTaxonomy.test.ts` fails if either drifts.
 */
export const CATALOG_TRADE_KEYS = [
  "demolition", "framing", "electrical", "plumbing", "painting", "flooring",
  "hvac", "drywall", "roofing", "doors", "decks", "handyman", "trim",
  "insulation", "concrete", "countertops", "siding", "masonry", "windows",
  "gutters", "cabinetry", "specialty",
  // Library v2 additions.
  "tile", "landscaping", "general_conditions",
] as const;

export const SCOPE_AUTHORING_TRADE_KEYS = [
  "general", "carpentry", "plumbing", "electrical", "hvac", "drywall",
  "painting", "flooring", "tile", "roofing", "siding", "masonry", "concrete",
  "insulation", "countertops", "cabinets", "landscaping", "other",
] as const;

/** Explicit, lossless mapping for every canonical key above. */
const CANONICAL_TRADE_MAP: Record<string, LaborTradeKey> = {
  // catalog_assemblies.trade_key
  demolition: "demolition",
  framing: "framing",
  electrical: "electrical",
  plumbing: "plumbing",
  painting: "painting",
  flooring: "flooring",
  hvac: "hvac",
  drywall: "drywall",
  roofing: "roofing",
  doors: "finish_carpentry",
  decks: "exterior",
  handyman: "general_conditions",
  trim: "finish_carpentry",
  insulation: "insulation",
  concrete: "sitework_concrete",
  countertops: "finish_carpentry",
  siding: "exterior",
  masonry: "sitework_concrete",
  windows: "exterior",
  gutters: "roofing",
  cabinetry: "finish_carpentry",
  specialty: "specialty",
  // scope authoring vocabulary
  general: "general_conditions",
  carpentry: "finish_carpentry",
  tile: "tile",
  cabinets: "finish_carpentry",
  landscaping: "exterior",
  other: "specialty",
};

/**
 * Normalize any raw label into the GC taxonomy. Unknown or empty labels become
 * `unassigned` — deliberately visible, never dropped, so the totals still
 * reconcile while the gap stays obvious to the contractor.
 */
export function normalizeTradeKey(raw: string | null | undefined): LaborTradeKey {
  if (!raw) return UNASSIGNED_TRADE;
  const text = String(raw).toLowerCase().replace(/[_\-.]+/g, " ").trim();
  if (!text) return UNASSIGNED_TRADE;
  if ((LABOR_TRADES as readonly string[]).includes(String(raw))) return raw as LaborTradeKey;
  // A canonical vocabulary key is never left to keyword luck.
  const canonical = CANONICAL_TRADE_MAP[text];
  if (canonical) return canonical;
  for (const [needles, trade] of RULES) {
    if (needles.some((needle) => text.includes(needle))) return trade;
  }
  return UNASSIGNED_TRADE;
}

/**
 * Which trade does the WORK ITSELF belong to, judged from its wording rather
 * than from whatever label a generator attached to it? Used by the scope
 * sanity check to catch "shower tile" filed under framing or "remove existing
 * partition wall" filed under anything but demolition.
 *
 * Returns `null` when the wording is genuinely inconclusive, so the validator
 * stays quiet instead of inventing a correction.
 */
export function suggestTradeFromText(
  ...parts: Array<string | null | undefined>
): LaborTradeKey | null {
  const text = parts.filter(Boolean).join(" ").trim();
  if (!text) return null;
  const key = normalizeTradeKey(text);
  return key === UNASSIGNED_TRADE ? null : key;
}
