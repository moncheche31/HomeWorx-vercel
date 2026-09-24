/**
 * GENERAL material composition — one reusable layer for every trade.
 *
 * A composition says how the material money an assembly already carries is
 * made up: which major materials, which normal consumables, and which of them
 * can be quantified from a standard coverage rate rather than guessed.
 *
 * It is deliberately NOT a job template. A composition is only ever selected
 * from the evidence on the line being priced — its canonical assembly key, its
 * authoritative trade and its own wording — so the material list for a paint
 * room cannot appear on a roof repair, and no global question is created to
 * force one trade's materials onto another's work.
 *
 * Shares split money the pricing library already validated; they never invent
 * new dollars. Coverage rates are ordinary construction knowledge (350 sf per
 * gallon, 32 sf per sheet, 100 sf per roofing square) and are applied only
 * when the line is measured in a compatible unit.
 */

import { normalizeTradeKey, type LaborTradeKey } from "../tradeTaxonomy";
import type { MaterialTier } from "./types";

export interface CompositionComponent {
  key: string;
  tier: MaterialTier;
  /** Fraction of the line's material money. Components sum to 1. */
  share: number;
  /**
   * Standard coverage: units of measure covered by ONE component unit
   * (350 sf per gallon of paint). Only applied when `measuredUnit` matches.
   */
  coveragePerUnit?: number;
  measuredUnit?: "square_foot" | "linear_foot" | "each";
  componentUnit?: string;
}

export interface MaterialComposition {
  id: string;
  components: readonly CompositionComponent[];
}

const compose = (id: string, components: readonly CompositionComponent[]): MaterialComposition => ({
  id,
  components,
});

/* ------------------------------------------------------------------ *
 * Trade compositions. Each covers the material categories that belong
 * to that trade's work, nothing more.
 * ------------------------------------------------------------------ */

const PAINTING = compose("painting", [
  {
    key: "paint",
    tier: "major",
    share: 0.55,
    coveragePerUnit: 350,
    measuredUnit: "square_foot",
    componentUnit: "gallon",
  },
  {
    key: "primer",
    tier: "major",
    share: 0.15,
    coveragePerUnit: 300,
    measuredUnit: "square_foot",
    componentUnit: "gallon",
  },
  { key: "patchingCaulk", tier: "consumable", share: 0.12 },
  { key: "maskingCovering", tier: "consumable", share: 0.1 },
  { key: "applicators", tier: "consumable", share: 0.08 },
]);

const FRAMING = compose("framing", [
  { key: "lumber", tier: "major", share: 0.62 },
  {
    key: "sheathing",
    tier: "major",
    share: 0.2,
    coveragePerUnit: 32,
    measuredUnit: "square_foot",
    componentUnit: "sheet",
  },
  { key: "connectors", tier: "major", share: 0.1 },
  { key: "fasteners", tier: "consumable", share: 0.08 },
]);

const ROOFING = compose("roofing", [
  {
    key: "shingles",
    tier: "major",
    share: 0.52,
    coveragePerUnit: 100,
    measuredUnit: "square_foot",
    componentUnit: "square",
  },
  { key: "underlayment", tier: "major", share: 0.12 },
  { key: "iceWaterShield", tier: "major", share: 0.08 },
  { key: "dripEdge", tier: "major", share: 0.06 },
  { key: "ridgeVentCap", tier: "major", share: 0.07 },
  { key: "flashing", tier: "major", share: 0.08 },
  { key: "roofingNails", tier: "consumable", share: 0.07 },
]);

const FLOORING = compose("flooring", [
  { key: "floorMaterial", tier: "major", share: 0.68 },
  { key: "underlayment", tier: "major", share: 0.12 },
  { key: "transitionsTrim", tier: "major", share: 0.07 },
  { key: "adhesiveFasteners", tier: "consumable", share: 0.08 },
  { key: "patchLeveling", tier: "consumable", share: 0.05 },
]);

const PLUMBING = compose("plumbing", [
  { key: "fixturesValves", tier: "major", share: 0.55 },
  { key: "pipeFittings", tier: "major", share: 0.3 },
  { key: "solderGlueTape", tier: "consumable", share: 0.09 },
  { key: "hangersStraps", tier: "consumable", share: 0.06 },
]);

const ELECTRICAL = compose("electrical", [
  { key: "devicesFixtures", tier: "major", share: 0.5 },
  { key: "wireBoxes", tier: "major", share: 0.35 },
  { key: "connectorsStaples", tier: "consumable", share: 0.15 },
]);

const DRYWALL = compose("drywall", [
  {
    key: "drywallBoard",
    tier: "major",
    share: 0.55,
    coveragePerUnit: 32,
    measuredUnit: "square_foot",
    componentUnit: "sheet",
  },
  { key: "jointCompound", tier: "major", share: 0.18 },
  { key: "cornerBead", tier: "major", share: 0.08 },
  { key: "drywallTape", tier: "consumable", share: 0.07 },
  { key: "drywallScrews", tier: "consumable", share: 0.05 },
  { key: "sandingTexture", tier: "consumable", share: 0.07 },
]);

const TILE = compose("tile", [
  { key: "tileMaterial", tier: "major", share: 0.6 },
  { key: "backerWaterproofing", tier: "major", share: 0.14 },
  { key: "thinset", tier: "major", share: 0.13 },
  { key: "grout", tier: "consumable", share: 0.08 },
  { key: "spacersSealer", tier: "consumable", share: 0.05 },
]);

const FINISH_CARPENTRY = compose("finish_carpentry", [
  { key: "millwork", tier: "major", share: 0.72 },
  { key: "hardware", tier: "major", share: 0.12 },
  { key: "fastenersAdhesive", tier: "consumable", share: 0.08 },
  { key: "fillerCaulkFinish", tier: "consumable", share: 0.08 },
]);

const INSULATION = compose("insulation", [
  { key: "insulationMaterial", tier: "major", share: 0.85 },
  { key: "fastenersTape", tier: "consumable", share: 0.15 },
]);

const HVAC = compose("hvac", [
  { key: "equipment", tier: "major", share: 0.6 },
  { key: "ductFittings", tier: "major", share: 0.28 },
  { key: "hangersTapeSealant", tier: "consumable", share: 0.12 },
]);

const SITEWORK_CONCRETE = compose("sitework_concrete", [
  { key: "concreteMix", tier: "major", share: 0.6 },
  { key: "rebarMesh", tier: "major", share: 0.18 },
  { key: "formsStakes", tier: "consumable", share: 0.12 },
  { key: "curingFinishing", tier: "consumable", share: 0.1 },
]);

const EXTERIOR = compose("exterior", [
  { key: "exteriorMaterial", tier: "major", share: 0.7 },
  { key: "flashingTrim", tier: "major", share: 0.12 },
  { key: "fasteners", tier: "consumable", share: 0.1 },
  { key: "sealant", tier: "consumable", share: 0.08 },
]);

const DEMOLITION = compose("demolition", [
  { key: "disposal", tier: "major", share: 0.6 },
  { key: "siteProtection", tier: "consumable", share: 0.25 },
  { key: "bladesConsumables", tier: "consumable", share: 0.15 },
]);

const GENERAL_CONDITIONS = compose("general_conditions", [
  { key: "generalAllowance", tier: "major", share: 0.7 },
  { key: "siteProtection", tier: "consumable", share: 0.3 },
]);

const GENERIC = compose("generic", [
  { key: "materialAllowance", tier: "major", share: 0.85 },
  { key: "consumablesAllowance", tier: "consumable", share: 0.15 },
]);

const BY_TRADE: Partial<Record<LaborTradeKey, MaterialComposition>> = {
  painting: PAINTING,
  framing: FRAMING,
  roofing: ROOFING,
  flooring: FLOORING,
  plumbing: PLUMBING,
  electrical: ELECTRICAL,
  drywall: DRYWALL,
  tile: TILE,
  finish_carpentry: FINISH_CARPENTRY,
  insulation: INSULATION,
  hvac: HVAC,
  sitework_concrete: SITEWORK_CONCRETE,
  exterior: EXTERIOR,
  demolition: DEMOLITION,
  general_conditions: GENERAL_CONDITIONS,
};

/* Assembly-level refinements: a single-subject assembly is one material. */
const SINGLE = (key: string, tier: MaterialTier = "major"): MaterialComposition =>
  compose(`single.${key}`, [{ key, tier, share: 1 }]);

const BY_CATALOG_KEY: Record<string, MaterialComposition> = {
  "cabinets.base.install": compose("cabinets", [
    { key: "cabinetBoxes", tier: "major", share: 0.86 },
    { key: "fillerTrim", tier: "major", share: 0.06 },
    { key: "fastenersAdhesive", tier: "consumable", share: 0.05 },
    { key: "shimsCaulk", tier: "consumable", share: 0.03 },
  ]),
  "cabinets.wall.install": compose("cabinets", [
    { key: "cabinetBoxes", tier: "major", share: 0.86 },
    { key: "fillerTrim", tier: "major", share: 0.06 },
    { key: "fastenersAdhesive", tier: "consumable", share: 0.05 },
    { key: "shimsCaulk", tier: "consumable", share: 0.03 },
  ]),
  "cabinets.tall.install": compose("cabinets", [
    { key: "cabinetBoxes", tier: "major", share: 0.9 },
    { key: "fastenersAdhesive", tier: "consumable", share: 0.06 },
    { key: "shimsCaulk", tier: "consumable", share: 0.04 },
  ]),
  "cabinets.hardware.install": SINGLE("hardware"),
  "cabinets.toekick.filler": compose("cabinetTrim", [
    { key: "fillerTrim", tier: "major", share: 0.85 },
    { key: "fastenersAdhesive", tier: "consumable", share: 0.15 },
  ]),
  "countertops.quartz.install": compose("countertops", [
    { key: "slabMaterial", tier: "major", share: 0.9 },
    { key: "adhesiveSealant", tier: "consumable", share: 0.1 },
  ]),
  "countertops.laminate.install": compose("countertops", [
    { key: "slabMaterial", tier: "major", share: 0.88 },
    { key: "adhesiveSealant", tier: "consumable", share: 0.12 },
  ]),
  "specialty.engineering.stamp": SINGLE("engineeringFee"),
  "framing.shoring.temporary": compose("shoring", [
    { key: "lumber", tier: "major", share: 0.8 },
    { key: "fasteners", tier: "consumable", share: 0.2 },
  ]),
  "framing.beam.lvl": compose("beam", [
    { key: "engineeredBeam", tier: "major", share: 0.86 },
    { key: "connectors", tier: "major", share: 0.08 },
    { key: "fasteners", tier: "consumable", share: 0.06 },
  ]),
  "framing.post.structural": compose("post", [
    { key: "postMaterial", tier: "major", share: 0.72 },
    { key: "connectors", tier: "major", share: 0.2 },
    { key: "fasteners", tier: "consumable", share: 0.08 },
  ]),
};

/**
 * Composition for one priced line. Selection order is most specific first:
 * canonical assembly key, then the authoritative trade, then a disclosed
 * generic allowance. Never a job template and never prior project state.
 */
export function compositionForLine(input: {
  catalogItemKey?: string | null;
  tradeKey?: string | null;
  description?: string | null;
}): MaterialComposition {
  const catalogKey = input.catalogItemKey?.trim();
  if (catalogKey && BY_CATALOG_KEY[catalogKey]) return BY_CATALOG_KEY[catalogKey];

  const trade = normalizeTradeKey(input.tradeKey ?? input.description ?? null);
  return BY_TRADE[trade] ?? GENERIC;
}

/** Exposed for tests: every composition's shares must total 1. */
export const ALL_COMPOSITIONS: readonly MaterialComposition[] = [
  ...Object.values(BY_TRADE).filter(Boolean),
  ...Object.values(BY_CATALOG_KEY),
  GENERIC,
] as MaterialComposition[];
