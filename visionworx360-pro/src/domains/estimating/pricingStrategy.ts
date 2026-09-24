import { roundMoney as money } from "./money";
/**
 * Contractor PRICING METHOD (how markup is decided).
 *
 * Exactly ONE method is ever in force for an estimate. The two methods are
 * mutually exclusive by construction — there is a single `method` field, not
 * two independent toggles:
 *
 *  A. `target_gross_margin` — the contractor sets a target gross profit
 *     margin. Selling price (before tax) is derived by grossing the job cost
 *     up: `sellingPrice = jobCost / (1 - targetGrossMarginPct/100)`.
 *     Gross profit dollars = sellingPrice - jobCost.
 *
 *  B. `overhead_profit` — the legacy engine method, unchanged: overhead is a
 *     percentage of direct cost, profit is a percentage of
 *     (direct cost + overhead).
 *
 * CONTINGENCY — where it enters, exactly once:
 *   Contingency is a COST layer, never a markup layer. In both methods it is
 *   computed before the pricing method is applied and it is part of `jobCost`.
 *   In target-margin mode the job cost that gets grossed up therefore already
 *   includes contingency, so contingency is never marked up twice and never
 *   double-counted as profit.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

export type PricingMethod = "overhead_profit" | "target_gross_margin";

export const PRICING_METHODS = ["target_gross_margin", "overhead_profit"] as const;

/**
 * Legacy/back-compat default. Every estimate that existed before this feature
 * keeps `overhead_profit` with its saved percentages, so no saved estimate is
 * silently repriced.
 */
export const LEGACY_PRICING_METHOD: PricingMethod = "overhead_profit";

/** Recommended method for a brand-new company setup. */
export const RECOMMENDED_PRICING_METHOD: PricingMethod = "target_gross_margin";

export interface PricingStrategy {
  method: PricingMethod;
  /** Used only when `method === "target_gross_margin"`. 0 <= pct < 100. */
  targetGrossMarginPct: number;
  /** Used only when `method === "overhead_profit"`. */
  overheadPct: number;
  profitPct: number;
}

export const DEFAULT_PRICING_STRATEGY: PricingStrategy = {
  method: LEGACY_PRICING_METHOD,
  targetGrossMarginPct: 0,
  overheadPct: 0,
  profitPct: 0,
};

export function isPricingMethod(value: unknown): value is PricingMethod {
  return value === "overhead_profit" || value === "target_gross_margin";
}

export function normalizePricingMethod(value: unknown): PricingMethod {
  return isPricingMethod(value) ? value : LEGACY_PRICING_METHOD;
}

const num = (value: unknown, fallback = 0): number => {
  const n = value == null ? fallback : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** A target gross margin must be a percentage strictly below 100. */
export function isValidTargetGrossMargin(pct: unknown): boolean {
  const n = Number(pct);
  return Number.isFinite(n) && n >= 0 && n < 100;
}

export function normalizePricingStrategy(input: unknown): PricingStrategy {
  const raw = (input ?? {}) as Record<string, unknown>;
  const method = normalizePricingMethod(raw.method ?? raw.pricingMethod);
  const target = num(raw.targetGrossMarginPct ?? raw.target_gross_margin_pct);
  return {
    method,
    targetGrossMarginPct: isValidTargetGrossMargin(target) ? target : 0,
    overheadPct: Math.max(0, num(raw.overheadPct ?? raw.default_overhead_pct)),
    profitPct: Math.max(0, num(raw.profitPct ?? raw.default_profit_pct)),
  };
}

export function usesTargetGrossMargin(strategy: PricingStrategy | null | undefined): boolean {
  return (
    strategy?.method === "target_gross_margin" &&
    isValidTargetGrossMargin(strategy.targetGrossMarginPct) &&
    strategy.targetGrossMarginPct > 0
  );
}

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/**
 * Selling price (BEFORE tax) for a job cost at a target gross margin.
 * `jobCost / (1 - margin)`. A 0% target sells at cost.
 */
export function sellingPriceFromTargetMargin(jobCost: number, targetGrossMarginPct: number): number {
  const cost = num(jobCost);
  const pct = num(targetGrossMarginPct);
  if (!isValidTargetGrossMargin(pct) || pct <= 0) return money(cost);
  return money(cost / (1 - pct / 100));
}

/** Gross profit dollars = selling price (before tax) - job cost. */
export function grossProfitDollars(sellingPrice: number, jobCost: number): number {
  return money(num(sellingPrice) - num(jobCost));
}

/** Realized gross margin % of the selling price. */
export function grossMarginPct(sellingPrice: number, jobCost: number): number {
  const price = num(sellingPrice);
  if (price <= 0) return 0;
  return round2(((price - num(jobCost)) / price) * 100);
}

/** Build the strategy for an estimate-shaped record (or company defaults). */
export function pricingStrategyOf(source: {
  pricingMethod?: unknown;
  targetGrossMarginPct?: unknown;
  defaultOverheadPct?: unknown;
  defaultProfitPct?: unknown;
}): PricingStrategy {
  return normalizePricingStrategy({
    method: source.pricingMethod,
    targetGrossMarginPct: source.targetGrossMarginPct,
    overheadPct: source.defaultOverheadPct,
    profitPct: source.defaultProfitPct,
  });
}

/* ------------------------------------------------------------------ *
 * Benchmark presets — guidance, NOT endorsements or industry mandates.
 * ------------------------------------------------------------------ */

export interface GrossMarginPreset {
  key: string;
  /** Target gross margin percentage. Null for the custom entry. */
  pct: number | null;
  /** Attribution shown next to the preset. Never phrased as a mandate. */
  sourceName: string | null;
  sourceUrl: string | null;
}

export const GROSS_MARGIN_PRESETS: readonly GrossMarginPreset[] = [
  {
    key: "gp30",
    pct: 30,
    sourceName: "NAHB 2024 remodeler average (benchmark)",
    sourceUrl: "https://www.nahb.org/blog/2026/04/home-remodeling-profit-margin",
  },
  {
    key: "gp33",
    pct: 33,
    sourceName: "Qualified Remodeler contributor benchmark",
    sourceUrl: "https://www.qualifiedremodeler.com/how-much-profit-is-enough",
  },
  {
    key: "gp40",
    pct: 40,
    sourceName: "Qualified Remodeler contributor guidance",
    sourceUrl: "https://www.qualifiedremodeler.com/consider-growing-remodeling-revenue",
  },
  { key: "custom", pct: null, sourceName: null, sourceUrl: null },
] as const;

export function presetForPct(pct: number): GrossMarginPreset {
  return (
    GROSS_MARGIN_PRESETS.find((p) => p.pct != null && Math.abs(p.pct - pct) < 0.001) ??
    GROSS_MARGIN_PRESETS[GROSS_MARGIN_PRESETS.length - 1]
  );
}
