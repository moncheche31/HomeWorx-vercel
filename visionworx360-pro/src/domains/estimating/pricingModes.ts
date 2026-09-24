import { roundMoney as money } from "./money";
/**
 * Estimate pricing / presentation modes.
 *
 * The same estimate can be SOLD three different ways without rebuilding it:
 *
 *  - `total`           one price (or one ballpark range). No breakout.
 *  - `labor_materials` labor and material subtotals plus a combined total.
 *  - `labor_only`      the contractor supplies labor; the owner supplies the
 *                      materials, so material sell price is excluded.
 *
 * ARCHITECTURE RULE — labor-only is a *presentation and sell* decision, never
 * an engine amnesia. The engine still resolves the complete assembly: material
 * quantities, demolition, protection, handling, prep, disposal and sequencing
 * all continue to drive labor hours. Labor-only merely removes the material
 * SELL money from the customer price (and adds the disclosed handling labor a
 * contractor really incurs receiving and staging owner-supplied material).
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

export type PricingMode = "total" | "labor_materials" | "labor_only";

export const PRICING_MODES = ["total", "labor_materials", "labor_only"] as const;

export const DEFAULT_PRICING_MODE: PricingMode = "total";

export function isPricingMode(value: unknown): value is PricingMode {
  return value === "total" || value === "labor_materials" || value === "labor_only";
}

export function normalizePricingMode(value: unknown): PricingMode {
  return isPricingMode(value) ? value : DEFAULT_PRICING_MODE;
}

/** What each mode promises the customer. Presentation-only contract. */
export interface PricingModeContract {
  mode: PricingMode;
  /** Material sell money is part of the customer price. */
  sellsMaterials: boolean;
  /** The customer document may show labor and material subtotals. */
  showsSplit: boolean;
  /** The customer must be told the owner supplies materials. */
  requiresOwnerSuppliedNotice: boolean;
}

export const PRICING_MODE_CONTRACTS: Record<PricingMode, PricingModeContract> = {
  total: { mode: "total", sellsMaterials: true, showsSplit: false, requiresOwnerSuppliedNotice: false },
  labor_materials: {
    mode: "labor_materials",
    sellsMaterials: true,
    showsSplit: true,
    requiresOwnerSuppliedNotice: false,
  },
  labor_only: {
    mode: "labor_only",
    sellsMaterials: false,
    showsSplit: true,
    requiresOwnerSuppliedNotice: true,
  },
};

export function pricingModeContract(mode: PricingMode): PricingModeContract {
  return PRICING_MODE_CONTRACTS[normalizePricingMode(mode)];
}

/**
 * How much of a customer document is itemised. Independent of the pricing
 * mode: a contractor selling labor + materials may still present one number.
 * `null` disclosure means "follow the pricing mode".
 */
export type PricingDisclosure =
  | "total_only"
  | "category_subtotals"
  | "labor_materials"
  | "labor_only";

export const PRICING_DISCLOSURES = [
  "total_only",
  "category_subtotals",
  "labor_materials",
  "labor_only",
] as const;

export function isPricingDisclosure(value: unknown): value is PricingDisclosure {
  return (PRICING_DISCLOSURES as readonly string[]).includes(String(value));
}

/** The contractor's explicit choice wins; otherwise the mode decides. */
export function resolveDisclosure(
  mode: PricingMode,
  override?: PricingDisclosure | null,
): PricingDisclosure {
  if (override && isPricingDisclosure(override)) return override;
  if (mode === "labor_only") return "labor_only";
  if (mode === "labor_materials") return "labor_materials";
  return "total_only";
}

/* ------------------------------------------------------------------ *
 * Presenting a calculated estimate through a mode
 * ------------------------------------------------------------------ */

/**
 * The subset of engine totals a mode needs. Both `EstimateEngineTotals` and
 * the pure `EstimateTotals` from `calculations.ts` satisfy it structurally.
 */
export interface PricingComponents {
  laborTotal: number;
  materialTotal: number;
  productTotal?: number;
  allowanceTotal?: number;
  equipmentTotal: number;
  subcontractorTotal: number;
  otherTotal: number;
  overhead: number;
  profit: number;
  contingency: number;
  tax: number;
}

export interface PresentedPricing {
  mode: PricingMode;
  disclosure: PricingDisclosure;
  /** Labor sell money, carrying its pro-rata share of overhead/profit/tax. */
  laborSell: number;
  /** Material sell money. Zero in labor-only. */
  materialSell: number;
  /** Equipment, subcontractor, other and allowances — still the contractor's. */
  otherSell: number;
  /** Disclosed labor added for receiving/handling owner-supplied material. */
  handlingSell: number;
  /** What the customer pays: laborSell + materialSell + otherSell + handlingSell. */
  total: number;
  /** Material sell money removed from the price (labor-only only). */
  excludedMaterialSell: number;
  ownerSuppliesMaterials: boolean;
}

/**
 * Labor a contractor genuinely spends receiving, staging, checking and
 * returning owner-supplied material. Applied ONLY in labor-only mode and only
 * when the scope actually contains material.
 */
export const OWNER_SUPPLIED_HANDLING_PCT = 5;

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Split a calculated estimate into the buckets a pricing mode presents.
 *
 * Overhead, profit, contingency and tax are pro-rated across the direct-cost
 * buckets, so the buckets always sum to the presented total and nothing is
 * ever counted twice.
 */
export function presentPricing(
  totals: PricingComponents,
  mode: PricingMode,
  options: { disclosure?: PricingDisclosure | null } = {},
): PresentedPricing {
  const resolvedMode = normalizePricingMode(mode);
  const labor = num(totals.laborTotal);
  const material = money(num(totals.materialTotal) + num(totals.productTotal));
  const other = money(
    num(totals.equipmentTotal) +
      num(totals.subcontractorTotal) +
      num(totals.otherTotal) +
      num(totals.allowanceTotal),
  );
  const direct = money(labor + material + other);
  const uplift = money(
    num(totals.overhead) + num(totals.profit) + num(totals.contingency) + num(totals.tax),
  );

  const share = (part: number) => (direct > 0 ? part / direct : 0);
  const laborSellFull = money(labor + uplift * share(labor));
  const materialSellFull = money(material + uplift * share(material));
  const otherSellFull = money(other + uplift * share(other));

  const ownerSupplies = resolvedMode === "labor_only";
  const handling =
    ownerSupplies && material > 0
      ? money((laborSellFull * OWNER_SUPPLIED_HANDLING_PCT) / 100)
      : 0;

  const materialSell = ownerSupplies ? 0 : materialSellFull;
  const total = money(laborSellFull + materialSell + otherSellFull + handling);

  return {
    mode: resolvedMode,
    disclosure: resolveDisclosure(resolvedMode, options.disclosure ?? null),
    laborSell: laborSellFull,
    materialSell,
    otherSell: otherSellFull,
    handlingSell: handling,
    total,
    excludedMaterialSell: ownerSupplies ? materialSellFull : 0,
    ownerSuppliesMaterials: ownerSupplies,
  };
}

/* ------------------------------------------------------------------ *
 * Presenting a ballpark BAND through a mode
 * ------------------------------------------------------------------ */

export interface PricingBand {
  low: number;
  expected: number;
  high: number;
}

/**
 * Re-express a ballpark band in the selected mode.
 *
 * A labor-only ballpark stays a ballpark: the same band, scaled by the
 * labor-and-other share of the full price. It is never converted into a
 * pretend time sheet.
 */
export function presentBand(
  band: PricingBand,
  totals: PricingComponents,
  mode: PricingMode,
): PricingBand & { factor: number } {
  const full = presentPricing(totals, "total");
  const presented = presentPricing(totals, mode);
  const factor = full.total > 0 ? presented.total / full.total : 1;
  return {
    low: money(num(band.low) * factor),
    expected: money(num(band.expected) * factor),
    high: money(num(band.high) * factor),
    factor: Math.round(factor * 10000) / 10000,
  };
}

/**
 * Switching mode must never change the underlying estimate. This guard is used
 * by tests and by the UI to prove scope, quantities, assumptions and answers
 * survived the switch.
 */
export function modeSwitchPreservesScope<T extends { id?: string; quantity?: number }>(
  before: readonly T[],
  after: readonly T[],
): boolean {
  if (before.length !== after.length) return false;
  return before.every((line, i) => {
    const next = after[i];
    return line.id === next.id && num(line.quantity) === num(next.quantity);
  });
}
