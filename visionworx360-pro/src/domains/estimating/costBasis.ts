/**
 * Canonical TASK COST BASIS model.
 *
 * Every priced line in VisionWorx360 answers one question before any math
 * happens: *what kind of cost is this?* A building permit is a fee. An LVL
 * beam that must be carried in and set is production labor plus material. A
 * dumpster is an other-direct-cost. Until that is explicit, the engine has no
 * defensible way to decide whether a line may legitimately carry zero labor
 * hours, which units its quantity may use, or whether a productivity rate
 * applies at all.
 *
 * Three rules this module enforces:
 *
 * 1. A FEE IS NEVER LABOR. Permits, inspections, municipal and utility charges
 *    are direct costs measured in dollars per each / lump sum. They may never
 *    carry labor hours and their scope quantity may never be `hour`.
 * 2. ZERO LABOR MUST BE INTENTIONAL. Only material-only, fee, allowance,
 *    subcontract and equipment bases may sit at zero hours. An installation
 *    task at zero hours is a defect, not a discount.
 * 3. UNITS FOLLOW THE BASIS. Area work is measured in area units, runs in
 *    linear feet, devices/fixtures in each, fees in each / lump sum. `hour` is
 *    an output of the labor model, not a scope quantity — except on a line
 *    that IS explicitly time-and-material labor.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import { classifyTrade } from "./tradeInference";
import type { LaborTradeKey } from "./tradeTaxonomy";

export const TASK_COST_BASES = [
  "labor_production",
  "labor_lump_sum",
  "labor_time_and_material",
  "material_unit",
  "material_lump_sum",
  "equipment",
  "subcontract",
  "permit_fee",
  "other_direct_cost",
  "allowance",
  "composite_task",
] as const;

export type TaskCostBasis = (typeof TASK_COST_BASES)[number];

/** Bases that MUST carry labor hours when the work is in scope. */
const LABOR_BEARING = new Set<TaskCostBasis>([
  "labor_production",
  "labor_lump_sum",
  "labor_time_and_material",
  "composite_task",
]);

/** Bases where zero labor hours is legitimate and expected. */
const LABOR_FREE = new Set<TaskCostBasis>([
  "material_unit",
  "material_lump_sum",
  "equipment",
  "subcontract",
  "permit_fee",
  "other_direct_cost",
  "allowance",
]);

export const isLaborBearingBasis = (basis: TaskCostBasis): boolean => LABOR_BEARING.has(basis);
export const isLaborFreeBasis = (basis: TaskCostBasis): boolean => LABOR_FREE.has(basis);
export const isFeeBasis = (basis: TaskCostBasis): boolean =>
  basis === "permit_fee" || basis === "other_direct_cost";

/** Bases whose hours scale with a measured quantity through a productivity rate. */
export const isProductionBasis = (basis: TaskCostBasis): boolean =>
  basis === "labor_production" || basis === "composite_task";

/* ------------------------------------------------------------------ *
 * Unit compatibility
 * ------------------------------------------------------------------ */

export const AREA_UNITS = ["square_foot", "square_yard", "square"] as const;
export const LINEAR_UNITS = ["linear_foot", "board_foot"] as const;
export const VOLUME_UNITS = ["cubic_foot", "cubic_yard", "gallon"] as const;
export const COUNT_UNITS = ["each", "sheet", "lump_sum", "allowance", "other"] as const;
export const TIME_UNITS = ["hour", "day"] as const;

const ALL_PHYSICAL = [
  ...AREA_UNITS,
  ...LINEAR_UNITS,
  ...VOLUME_UNITS,
  ...COUNT_UNITS,
  "pound",
] as const;

/** Units a basis may legitimately use for its SCOPE quantity. */
export const ALLOWED_UNITS: Record<TaskCostBasis, ReadonlySet<string>> = {
  labor_production: new Set(ALL_PHYSICAL),
  labor_lump_sum: new Set(["each", "lump_sum", "allowance", "other"]),
  labor_time_and_material: new Set(["hour", "day"]),
  material_unit: new Set(ALL_PHYSICAL),
  material_lump_sum: new Set(["each", "lump_sum", "allowance", "other"]),
  equipment: new Set(["each", "day", "lump_sum", "allowance", "other"]),
  subcontract: new Set([...ALL_PHYSICAL, "lump_sum", "allowance"]),
  permit_fee: new Set(["each", "lump_sum", "allowance", "other"]),
  other_direct_cost: new Set(["each", "lump_sum", "allowance", "other", "day"]),
  allowance: new Set(["each", "lump_sum", "allowance", "other"]),
  composite_task: new Set(ALL_PHYSICAL),
};

export function isUnitCompatibleWithBasis(basis: TaskCostBasis, unitKey: string | null | undefined): boolean {
  if (!unitKey) return false;
  return ALLOWED_UNITS[basis].has(unitKey);
}

/** The safe unit to fall back to when a stored unit is incompatible. */
export function defaultUnitForBasis(basis: TaskCostBasis): string {
  switch (basis) {
    case "permit_fee":
    case "other_direct_cost":
    case "allowance":
    case "material_lump_sum":
    case "labor_lump_sum":
      return "each";
    case "labor_time_and_material":
      return "hour";
    case "equipment":
      return "day";
    default:
      return "each";
  }
}

/* ------------------------------------------------------------------ *
 * Inference
 * ------------------------------------------------------------------ */

export interface CostBasisInput {
  description?: string | null;
  unitKey?: string | null;
  tradeKey?: string | null;
  categoryKey?: string | null;
  /** Explicit basis already stored on the line. Always wins. */
  storedBasis?: string | null;
  /** True when the contractor set the basis by hand. */
  isContractorOwned?: boolean;
}

export interface CostBasisClassification {
  basis: TaskCostBasis;
  confidence: "high" | "medium" | "low";
  /** Why the classifier landed here — contractor-auditable. */
  evidence: string[];
  /** The trade the wording points at, for downstream productivity lookup. */
  tradeKey: LaborTradeKey | null;
  /** True when a human owns this classification and it must not be recomputed. */
  isLocked: boolean;
}

const FEE_PHRASES = [
  "permit",
  "permitting",
  "inspection fee",
  "plan review",
  "plan check",
  "impact fee",
  "municipal fee",
  "city fee",
  "county fee",
  "utility fee",
  "connection fee",
  "tap fee",
  "engineering fee",
  "architect fee",
  "filing fee",
  "license fee",
  "hoa fee",
];

const ODC_PHRASES = [
  "dumpster",
  "disposal fee",
  "landfill",
  "haul off",
  "haul-off",
  "haul away",
  "delivery charge",
  "delivery fee",
  "freight",
  "port-a",
  "portable toilet",
  "temporary power",
  "storage unit",
];

const SUBCONTRACT_PHRASES = ["subcontract", "sub-contract", "by others", "sub quote", "vendor quote"];
const EQUIPMENT_PHRASES = [
  "equipment rental",
  "rental",
  "scissor lift",
  "boom lift",
  "scaffold rental",
  "excavator",
  "skid steer",
  "dumpster rental",
];
const ALLOWANCE_PHRASES = ["allowance", "budget placeholder", "tbd allowance"];
const MATERIAL_ONLY_PHRASES = [
  "material only",
  "materials only",
  "supply only",
  "furnish only",
  "material supply",
  "product only",
];
const TIME_AND_MATERIAL_PHRASES = ["time and material", "t&m", "hourly rate", "per hour labor"];
const LUMP_SUM_LABOR_PHRASES = [
  "service call",
  "trip charge",
  "mobilization",
  "punch list",
  "final cleaning",
  "site cleanup",
  "protection",
];

const has = (text: string, phrases: readonly string[]) => phrases.some((p) => text.includes(p));

/**
 * Classify a task's cost basis from its own wording, unit and trade. Explicit
 * stored bases and contractor-owned classifications are returned untouched.
 */
export function classifyCostBasis(input: CostBasisInput): CostBasisClassification {
  const stored = (input.storedBasis ?? "").trim();
  if (stored && (TASK_COST_BASES as readonly string[]).includes(stored)) {
    return {
      basis: stored as TaskCostBasis,
      confidence: "high",
      evidence: [input.isContractorOwned ? "contractor-assigned basis" : "stored basis"],
      tradeKey: null,
      isLocked: !!input.isContractorOwned,
    };
  }

  const text = `${input.description ?? ""} ${input.categoryKey ?? ""}`.toLowerCase();
  const unit = input.unitKey ?? null;
  const evidence: string[] = [];

  const decide = (
    basis: TaskCostBasis,
    reason: string,
    confidence: CostBasisClassification["confidence"] = "high",
  ): CostBasisClassification => ({
    basis,
    confidence,
    evidence: [...evidence, reason],
    tradeKey: null,
    isLocked: false,
  });

  if (has(text, FEE_PHRASES)) return decide("permit_fee", "fee/permit wording");
  if (has(text, SUBCONTRACT_PHRASES)) return decide("subcontract", "subcontracted wording");
  if (has(text, EQUIPMENT_PHRASES)) return decide("equipment", "equipment/rental wording");
  if (has(text, ODC_PHRASES)) return decide("other_direct_cost", "direct-cost wording");
  if (has(text, TIME_AND_MATERIAL_PHRASES))
    return decide("labor_time_and_material", "explicit time-and-material wording");
  if (has(text, MATERIAL_ONLY_PHRASES))
    return decide(
      unit && ALLOWED_UNITS.material_lump_sum.has(unit) ? "material_lump_sum" : "material_unit",
      "explicit material-only wording",
    );
  if (has(text, ALLOWANCE_PHRASES)) return decide("allowance", "allowance wording");
  if (has(text, LUMP_SUM_LABOR_PHRASES))
    return decide("labor_lump_sum", "non-production labor wording");

  const trade = classifyTrade(input.description ?? "");
  const tradeKey = trade.trade && trade.trade !== "unassigned" ? trade.trade : null;

  const measured =
    !!unit &&
    ([...AREA_UNITS, ...LINEAR_UNITS, ...VOLUME_UNITS] as readonly string[]).includes(unit);

  const basis: TaskCostBasis = measured ? "labor_production" : "labor_production";
  return {
    basis,
    confidence: trade.confidence === "high" ? "high" : measured ? "medium" : "low",
    evidence: [
      measured ? `measured unit ${unit}` : `count/undefined unit ${unit ?? "none"}`,
      `trade ${trade.trade ?? "unassigned"} (${trade.confidence})`,
    ],
    tradeKey,
    isLocked: false,
  };
}

/** Convenience: does this line's wording describe a fee rather than work? */
export function isFeeLine(description: string | null | undefined): boolean {
  return classifyCostBasis({ description }).basis === "permit_fee";
}
