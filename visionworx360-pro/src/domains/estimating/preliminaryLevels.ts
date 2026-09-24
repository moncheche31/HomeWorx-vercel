/**
 * Canonical preliminary levels (economy / recommended / premium).
 *
 * ONE cost basis produces every number a contractor or customer ever sees.
 * The three levels are not three estimates: they are one set of priced lines
 * with an explicit, documented quality adjustment on top, run through the SAME
 * engine and the SAME pricing strategy as the final selling price.
 *
 * INVARIANT enforced here and by the regression matrix:
 *   sellingPrice(recommended) === sellingPrice(final estimate)
 * for identical lines, quality level and pricing snapshot. Any other number is
 * a defect, not a rounding artifact — the low/high band may express
 * uncertainty around the recommended value, but never a different formula.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import { calculateEngineEstimate } from "./engine/calculate";
import type { EstimateEngineConfig, EngineLineInput } from "./engine/types";
import { type PricingStrategy } from "./pricingStrategy";
import { TIER_SPEC } from "./range/calculate";
import { roundMoney as money } from "./money";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** The contractor-facing names for the three quality levels. */
export const PRELIMINARY_LEVELS = ["economy", "recommended", "premium"] as const;
export type PreliminaryLevel = (typeof PRELIMINARY_LEVELS)[number];

/** Each level maps onto the existing good / better / best range tier. */
export const LEVEL_TIER: Record<PreliminaryLevel, "good" | "better" | "best"> = {
  economy: "good",
  recommended: "better",
  premium: "best",
};

export interface PreliminaryLevelResult {
  level: PreliminaryLevel;
  /** Internal. Never rendered on a customer document. */
  directCost: number;
  laborHours: number;
  /** What the customer would be quoted at this level. */
  sellingPrice: number;
  /** Uncertainty around the level, not a different cost model. */
  low: number;
  high: number;
  materialFactor: number;
  laborFactor: number;
}

export interface PreliminaryLevelsResult {
  levels: Record<PreliminaryLevel, PreliminaryLevelResult>;
  /** The pricing inputs every level was priced with. Stored for audit. */
  pricingSnapshot: {
    method: PricingStrategy["method"];
    targetGrossMarginPct: number;
    overheadPct: number;
    profitPct: number;
    taxRatePct: number;
    currency: string;
  };
}

/** Applies a level's quality factors to a line. Material and labor only. */
export function applyLevelToLine(
  line: EngineLineInput,
  level: PreliminaryLevel,
): EngineLineInput {
  const spec = TIER_SPEC[LEVEL_TIER[level]];
  return {
    ...line,
    materialCost: round2((line.materialCost ?? 0) * spec.materialFactor),
    laborHours:
      line.laborHours == null ? line.laborHours : round2(line.laborHours * spec.laborFactor),
    laborHoursPerUnit:
      line.laborHoursPerUnit == null
        ? line.laborHoursPerUnit
        : line.laborHoursPerUnit * spec.laborFactor,
  };
}

/**
 * THE selling-price function. Preliminary levels, the contractor estimate and
 * the final customer number all come through here, so overhead+profit and
 * target gross margin can never be applied by two different formulas.
 *
 * The engine itself owns the mutex: under a target gross margin it suppresses
 * overhead/profit and grosses the job cost up; under overhead+profit it applies
 * the percentages and never grosses up. This wrapper adds no second formula —
 * it only names the result so callers cannot invent their own markup.
 */
export function canonicalSellingPrice(
  lines: EngineLineInput[],
  config: EstimateEngineConfig,
  strategy: PricingStrategy | null | undefined,
): { sellingPrice: number; directCost: number; laborHours: number; jobCost: number } {
  const engine = calculateEngineEstimate(lines, {
    ...config,
    pricingStrategy: strategy ?? config.pricingStrategy,
  });
  return {
    sellingPrice: money(engine.totals.grandTotal),
    directCost: money(engine.totals.directCost),
    laborHours: engine.totals.laborHours,
    jobCost: money(engine.totals.jobCost ?? engine.totals.grandTotal),
  };
}


/**
 * Builds all three levels from one set of priced lines. The `recommended`
 * level is the untouched cost basis, so it reconciles exactly with a detailed
 * estimate built from the same lines.
 */
export function buildPreliminaryLevels(
  lines: EngineLineInput[],
  config: EstimateEngineConfig,
  strategy: PricingStrategy | null | undefined,
): PreliminaryLevelsResult {
  const levels = {} as Record<PreliminaryLevel, PreliminaryLevelResult>;

  for (const level of PRELIMINARY_LEVELS) {
    const spec = TIER_SPEC[LEVEL_TIER[level]];
    const priced = canonicalSellingPrice(
      level === "recommended" ? lines : lines.map((l) => applyLevelToLine(l, level)),
      config,
      strategy,
    );
    levels[level] = {
      level,
      directCost: priced.directCost,
      laborHours: priced.laborHours,
      sellingPrice: priced.sellingPrice,
      low: money(priced.sellingPrice * (1 - spec.spreadPct / 100)),
      high: money(priced.sellingPrice * (1 + spec.spreadPct / 100)),
      materialFactor: spec.materialFactor,
      laborFactor: spec.laborFactor,
    };
  }

  return {
    levels,
    pricingSnapshot: {
      method: strategy?.method ?? "overhead_profit",
      targetGrossMarginPct: strategy?.targetGrossMarginPct ?? 0,
      overheadPct: strategy?.method === "target_gross_margin" ? 0 : (strategy?.overheadPct ?? 0),
      profitPct: strategy?.method === "target_gross_margin" ? 0 : (strategy?.profitPct ?? 0),
      taxRatePct: config.taxRatePct ?? 0,
      currency: config.currency,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Contractor-side reconciliation record
 * ------------------------------------------------------------------ */

export interface ReconciliationSnapshot {
  /** Which preliminary level the contractor sold. */
  selectedLevel: PreliminaryLevel;
  /**
   * Where inside the preliminary band the contractor sold (low / expected /
   * high). A price position, not a quality level.
   */
  selectedBandPosition?: "low" | "expected" | "high";
  preliminary: { sellingPrice: number; directCost: number; laborHours: number };
  final: { sellingPrice: number; directCost: number; laborHours: number };
  pricingSnapshot: PreliminaryLevelsResult["pricingSnapshot"];
  /** Named drivers of any difference. Empty when the two reconcile. */
  deltaDrivers: { code: string; detail?: string; amount?: number }[];
  reconciles: boolean;
  computedAt: string;
  /** Internal-only. Customer documents must never receive this object. */
  internalOnly: true;
}

/**
 * Builds the audit record stored on the estimate: what the preliminary said,
 * what the final says, the pricing snapshot both used, and every driver of a
 * remaining difference. A contractor should never have to guess why a price
 * moved.
 */
export function buildReconciliationSnapshot(input: {
  selectedLevel: PreliminaryLevel;
  selectedBandPosition?: "low" | "expected" | "high";
  preliminary: { sellingPrice: number; directCost: number; laborHours: number };
  final: { sellingPrice: number; directCost: number; laborHours: number };
  pricingSnapshot: PreliminaryLevelsResult["pricingSnapshot"];
  deltaDrivers?: { code: string; detail?: string; amount?: number }[];
  now?: () => Date;
}): ReconciliationSnapshot {
  const delta = money(input.final.sellingPrice - input.preliminary.sellingPrice);
  const tolerance = Math.max(1, Math.abs(input.preliminary.sellingPrice) * 0.005);
  const drivers = [...(input.deltaDrivers ?? [])];
  if (Math.abs(delta) > tolerance && drivers.length === 0) {
    drivers.push({ code: "unexplained", amount: delta });
  }
  return {
    selectedLevel: input.selectedLevel,
    selectedBandPosition: input.selectedBandPosition ?? "expected",
    preliminary: input.preliminary,
    final: input.final,
    pricingSnapshot: input.pricingSnapshot,
    deltaDrivers: drivers,
    reconciles: Math.abs(delta) <= tolerance,
    computedAt: (input.now?.() ?? new Date()).toISOString(),
    internalOnly: true,
  };
}

/**
 * Customer-safe projection. Everything internal — hours, cost, margin, drivers
 * — is dropped, so a proposal can never leak the contractor's numbers.
 */
export function customerFacingPrice(snapshot: ReconciliationSnapshot): {
  sellingPrice: number;
  level: PreliminaryLevel;
} {
  return { sellingPrice: snapshot.final.sellingPrice, level: snapshot.selectedLevel };
}
