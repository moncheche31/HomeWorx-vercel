/**
 * Canonical assembly registry — ONE price subject, one set of numbers.
 *
 * The estimating system has two pricing surfaces:
 *
 *  - the BALLPARK pricebook (`domains/ballpark/pricebook`), keyed by ballpark
 *    item keys such as `kitchen.cabinets_base`;
 *  - the DETAILED knowledge base (`catalog_assemblies`), keyed by assembly
 *    keys such as `cabinets.base.install`.
 *
 * When the same physical work carries different labor hours or material money
 * on those two surfaces, the same project prices at two irreconcilable numbers
 * depending on which screen the contractor opens. That is not a rounding
 * problem, it is an architectural one.
 *
 * This module is the single reconciliation point. For every subject that both
 * surfaces can price, it states the catalog assembly key, the ballpark item
 * key and the canonical unit / labor hours / material money. The ballpark
 * pricebook builds its entries from here, and the detailed side maps scope
 * wording to the SAME catalog key through the intent map, so the two modes can
 * only ever disagree on presentation — never on cost.
 *
 * Numbers below mirror the seeded Knowledge Base library (`catalog_assemblies`).
 * Pure data + pure functions: no React, no Supabase, no i18n.
 */

export type CanonicalUnitKey = "each" | "linear_foot" | "square_foot";

export interface CanonicalAssembly {
  /** Knowledge Base key (`catalog_assemblies.assembly_key`). */
  catalogKey: string;
  /** Ballpark pricebook key for the same subject. */
  ballparkKey: string;
  /** Authoritative trade for labor rollups. Never a display group label. */
  tradeKey: string;
  unitKey: CanonicalUnitKey;
  /** Billable labor hours per unit. Crew size is descriptive, never a factor. */
  laborHoursPerUnit: number;
  /** Material cost per unit, waste included. */
  materialCostPerUnit: number;
  /**
   * TRUE when the money is a disclosed ALLOWANCE rather than a validated rate:
   * the work is real and recognized, but its extent (or the local fee) is not
   * knowable at ballpark time. Every surface that shows one must label it as
   * an allowance / contractor input recommended — never as a firm price.
   */
  allowance?: boolean;
}


export const CANONICAL_ASSEMBLIES: readonly CanonicalAssembly[] = [
  /* Cabinetry — base and wall runs are DISTINCT subjects with distinct money. */
  {
    catalogKey: "cabinets.base.install",
    ballparkKey: "kitchen.cabinets_base",
    tradeKey: "cabinetry",
    unitKey: "linear_foot",
    laborHoursPerUnit: 0.65,
    materialCostPerUnit: 285,
  },
  {
    catalogKey: "cabinets.wall.install",
    ballparkKey: "kitchen.cabinets_wall",
    tradeKey: "cabinetry",
    unitKey: "linear_foot",
    laborHoursPerUnit: 0.75,
    materialCostPerUnit: 245,
  },
  {
    catalogKey: "cabinets.tall.install",
    ballparkKey: "kitchen.cabinets_tall",
    tradeKey: "cabinetry",
    unitKey: "each",
    laborHoursPerUnit: 2.2,
    materialCostPerUnit: 685,
  },
  {
    catalogKey: "cabinets.toekick.filler",
    ballparkKey: "kitchen.cabinets_trim",
    tradeKey: "cabinetry",
    unitKey: "linear_foot",
    laborHoursPerUnit: 0.18,
    materialCostPerUnit: 9.5,
  },
  {
    catalogKey: "cabinets.hardware.install",
    ballparkKey: "kitchen.cabinet_hardware",
    tradeKey: "cabinetry",
    unitKey: "each",
    laborHoursPerUnit: 0.1,
    materialCostPerUnit: 6.5,
  },

  /* Countertops. */
  {
    catalogKey: "countertops.quartz.install",
    ballparkKey: "kitchen.countertop",
    tradeKey: "countertops",
    unitKey: "square_foot",
    laborHoursPerUnit: 0.22,
    materialCostPerUnit: 68,
  },
  {
    catalogKey: "countertops.laminate.install",
    ballparkKey: "kitchen.countertop_laminate",
    tradeKey: "countertops",
    unitKey: "linear_foot",
    laborHoursPerUnit: 0.3,
    materialCostPerUnit: 42,
  },

  /* Electrical — device-level work is never a circuit package. */
  {
    catalogKey: "electrical.device.relocate",
    ballparkKey: "electrical.device.relocate",
    tradeKey: "electrical",
    unitKey: "each",
    laborHoursPerUnit: 1.4,
    materialCostPerUnit: 28,
  },
  {
    catalogKey: "electrical.receptacle.new",
    ballparkKey: "electrical.device",
    tradeKey: "electrical",
    unitKey: "each",
    laborHoursPerUnit: 0.85,
    materialCostPerUnit: 32,
  },
  {
    catalogKey: "electrical.light.recessed",
    ballparkKey: "electrical.recessed_light",
    tradeKey: "electrical",
    unitKey: "each",
    laborHoursPerUnit: 1.1,
    materialCostPerUnit: 52,
  },
  {
    catalogKey: "electrical.light.fixture",
    ballparkKey: "electrical.fixture",
    tradeKey: "electrical",
    unitKey: "each",
    laborHoursPerUnit: 0.9,
    materialCostPerUnit: 45,
  },
  {
    catalogKey: "electrical.circuit.dedicated",
    ballparkKey: "electrical.circuit",
    tradeKey: "electrical",
    unitKey: "each",
    laborHoursPerUnit: 2.75,
    materialCostPerUnit: 115,
  },

  /* Trim. */
  {
    catalogKey: "trim.base.install",
    ballparkKey: "trim.base",
    tradeKey: "trim",
    unitKey: "linear_foot",
    laborHoursPerUnit: 0.05,
    materialCostPerUnit: 2.1,
  },

  /* ---------------------------------------------------------------- *
   * Structural primitives.
   *
   * Reusable operations, NOT a job template: opening up a bearing wall,
   * temporarily carrying the load, setting the beam and its posts, and the
   * engineering detail that structural work in a finished house often needs.
   * Any project that opens structure prices from these same records.
   * ---------------------------------------------------------------- */
  {
    /* Bearing demo is its own subject: shoring sequence, care, cleanup. */
    catalogKey: "demo.wall.bearing",
    ballparkKey: "demolition.wall_bearing",
    tradeKey: "demolition",
    unitKey: "linear_foot",
    laborHoursPerUnit: 0.55,
    materialCostPerUnit: 3.5,
  },
  {
    catalogKey: "framing.shoring.temporary",
    ballparkKey: "structural.shoring",
    tradeKey: "framing",
    unitKey: "linear_foot",
    laborHoursPerUnit: 0.6,
    materialCostPerUnit: 6.5,
    allowance: true,
  },
  {
    catalogKey: "framing.beam.lvl",
    ballparkKey: "structural.beam_lvl",
    tradeKey: "framing",
    unitKey: "linear_foot",
    laborHoursPerUnit: 0.85,
    materialCostPerUnit: 34,
  },
  {
    catalogKey: "framing.post.structural",
    ballparkKey: "structural.post",
    tradeKey: "framing",
    unitKey: "each",
    laborHoursPerUnit: 2.5,
    materialCostPerUnit: 125,
  },
  {
    /*
     * A stamped detail is commonly required for a new structural opening, but
     * requirements are jurisdictional. Carried as a visible allowance, never
     * as a legal assertion.
     */
    catalogKey: "specialty.engineering.stamp",
    ballparkKey: "structural.engineering",
    tradeKey: "specialty",
    unitKey: "each",
    laborHoursPerUnit: 1,
    materialCostPerUnit: 850,
    allowance: true,
  },

  /* ---------------------------------------------------------------- *
   * Finish carpentry primitives — beam / column wraps and built-ins.
   * ---------------------------------------------------------------- */
  {
    catalogKey: "drywall.beam.wrap",
    ballparkKey: "drywall.beam_wrap",
    tradeKey: "drywall",
    unitKey: "linear_foot",
    laborHoursPerUnit: 0.28,
    materialCostPerUnit: 4.25,
  },
  {
    catalogKey: "trim.beam.wrap",
    ballparkKey: "trim.beam_wrap",
    tradeKey: "trim",
    unitKey: "linear_foot",
    laborHoursPerUnit: 0.35,
    materialCostPerUnit: 9.5,
  },
  {
    /*
     * 6x6 pressure-treated post wrapped in PVC (Azek) column wrap with cap and
     * base trim: ~$400 per column installed (2.6 hr labor + $180 material,
     * Homewyse / Angi / manufacturer pricing, May–Aug 2026). This is NOT a
     * stone-veneer column, which is several times the money.
     */
    catalogKey: "trim.column.wrap",
    ballparkKey: "trim.column_wrap",
    tradeKey: "trim",
    unitKey: "each",
    laborHoursPerUnit: 2.6,
    materialCostPerUnit: 180,
  },
  {
    /*
     * Built-in casework by finished linear foot of run. Depth, height and
     * door/drawer content vary enormously, so the money is an allowance the
     * contractor is expected to tune.
     */
    catalogKey: "trim.bookcase.builtin",
    ballparkKey: "trim.bookcase",
    tradeKey: "trim",
    unitKey: "linear_foot",
    laborHoursPerUnit: 3.2,
    materialCostPerUnit: 145,
    allowance: true,
  },
  {
    catalogKey: "trim.molding.decorative",
    ballparkKey: "trim.decorative",
    tradeKey: "trim",
    unitKey: "linear_foot",
    laborHoursPerUnit: 0.12,
    materialCostPerUnit: 4.6,
  },
];


const BY_BALLPARK = new Map(CANONICAL_ASSEMBLIES.map((a) => [a.ballparkKey, a]));
const BY_CATALOG = new Map(CANONICAL_ASSEMBLIES.map((a) => [a.catalogKey, a]));

/** Canonical record for a ballpark item key, when the subject is reconciled. */
export function canonicalForBallparkKey(itemKey: string): CanonicalAssembly | null {
  return BY_BALLPARK.get(itemKey) ?? null;
}

/** Canonical record for a Knowledge Base assembly key. */
export function canonicalForCatalogKey(assemblyKey: string): CanonicalAssembly | null {
  return BY_CATALOG.get(assemblyKey) ?? null;
}

/** The detailed-side assembly that must price the same subject as a ballpark key. */
export function catalogKeyForBallparkKey(itemKey: string): string | null {
  return BY_BALLPARK.get(itemKey)?.catalogKey ?? null;
}

/** Authoritative trade for a ballpark item key. */
export function canonicalTradeForBallparkKey(itemKey: string): string | null {
  return BY_BALLPARK.get(itemKey)?.tradeKey ?? null;
}

/**
 * TRUE when the canonical money for this ballpark subject is a disclosed
 * allowance rather than a validated rate. Surfaces must label these.
 */
export function isAllowanceBallparkKey(itemKey: string): boolean {
  return BY_BALLPARK.get(itemKey)?.allowance === true;
}
