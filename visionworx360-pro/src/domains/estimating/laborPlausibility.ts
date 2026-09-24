/**
 * Labor-hour plausibility bands.
 *
 * A derived number is not automatically right just because the arithmetic ran.
 * `0.4 hours to demo interior partition walls` is arithmetically fine and
 * professionally absurd. This module holds broad, trade-level ranges of
 * hours-per-unit so the engine can say "this is outside anything I can
 * defend" — and then FLAG it. Nothing here rewrites a number: a flag asks the
 * contractor, a repair requires mechanical proof (see `lineAudit`).
 *
 * The bands are deliberately wide. They exist to catch order-of-magnitude
 * mistakes (unit-convention bugs, placeholder quantities, missing labor), not
 * to second-guess a contractor who works faster or slower than a book rate.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import { isLaborBearingBasis, isProductionBasis, type TaskCostBasis } from "./costBasis";
import type { LaborTradeKey } from "./tradeTaxonomy";

export interface HoursBand {
  /** Hours per unit. */
  min: number;
  max: number;
}

/** Trade + unit bands. Wide by design — order-of-magnitude guards only. */
const TRADE_UNIT_BANDS: Record<string, HoursBand> = {
  "demolition:square_foot": { min: 0.008, max: 0.2 },
  "demolition:linear_foot": { min: 0.05, max: 1.5 },
  "demolition:each": { min: 0.25, max: 24 },
  "drywall:square_foot": { min: 0.008, max: 0.1 },
  "drywall:sheet": { min: 0.4, max: 2.5 },
  "painting:square_foot": { min: 0.004, max: 0.06 },
  "painting:linear_foot": { min: 0.01, max: 0.25 },
  "flooring:square_foot": { min: 0.008, max: 0.12 },
  "tile:square_foot": { min: 0.04, max: 0.4 },
  "framing:square_foot": { min: 0.015, max: 0.25 },
  "framing:linear_foot": { min: 0.05, max: 1.2 },
  "framing:board_foot": { min: 0.01, max: 0.3 },
  "framing:each": { min: 0.5, max: 40 },
  "insulation:square_foot": { min: 0.004, max: 0.06 },
  "roofing:square_foot": { min: 0.01, max: 0.12 },
  "roofing:square": { min: 1.5, max: 12 },
  "sitework_concrete:square_foot": { min: 0.02, max: 0.4 },
  "sitework_concrete:cubic_yard": { min: 0.5, max: 12 },
  "electrical:each": { min: 0.4, max: 12 },
  "electrical:linear_foot": { min: 0.02, max: 0.4 },
  "plumbing:each": { min: 0.75, max: 24 },
  "plumbing:linear_foot": { min: 0.05, max: 0.8 },
  "hvac:each": { min: 1, max: 40 },
  "finish_carpentry:linear_foot": { min: 0.04, max: 0.6 },
  "finish_carpentry:each": { min: 0.4, max: 24 },
  "exterior:square_foot": { min: 0.01, max: 0.2 },
  "specialty:each": { min: 0.25, max: 24 },
  "general_conditions:each": { min: 0.25, max: 40 },
};

/** Fallbacks when the trade is unknown. Wider still. */
const UNIT_BANDS: Record<string, HoursBand> = {
  square_foot: { min: 0.003, max: 0.5 },
  square_yard: { min: 0.02, max: 3 },
  linear_foot: { min: 0.01, max: 2 },
  board_foot: { min: 0.005, max: 0.5 },
  cubic_foot: { min: 0.02, max: 2 },
  cubic_yard: { min: 0.2, max: 12 },
  sheet: { min: 0.2, max: 3 },
  gallon: { min: 0.1, max: 4 },
  each: { min: 0.25, max: 60 },
  lump_sum: { min: 0.25, max: 400 },
  allowance: { min: 0, max: 400 },
  other: { min: 0.1, max: 200 },
};

export function bandFor(
  tradeKey: LaborTradeKey | string | null | undefined,
  unitKey: string | null | undefined,
): HoursBand | null {
  if (!unitKey) return null;
  if (tradeKey) {
    const exact = TRADE_UNIT_BANDS[`${tradeKey}:${unitKey}`];
    if (exact) return exact;
  }
  return UNIT_BANDS[unitKey] ?? null;
}

export type PlausibilityVerdict = "ok" | "implausibly_low" | "implausibly_high" | "missing" | "unknown";

export interface PlausibilityAssessment {
  verdict: PlausibilityVerdict;
  hoursPerUnit: number | null;
  band: HoursBand | null;
  /** Total hours the band would suggest, for the review UI. */
  expectedLow: number | null;
  expectedHigh: number | null;
  message: string | null;
}

const OK: PlausibilityAssessment = {
  verdict: "unknown",
  hoursPerUnit: null,
  band: null,
  expectedLow: null,
  expectedHigh: null,
  message: null,
};

/**
 * Assess derived hours against the band for the task's trade and unit.
 * Labor-free bases (fees, material-only, subcontract) are never assessed —
 * zero hours there is the correct answer, not a defect.
 */
export function assessHoursPlausibility(input: {
  basis: TaskCostBasis;
  tradeKey?: LaborTradeKey | string | null;
  unitKey?: string | null;
  quantity: number;
  totalHours: number;
  /** Contractor-entered totals are reported as `ok` — flagged elsewhere, never here. */
  isContractorOwned?: boolean;
}): PlausibilityAssessment {
  if (!isLaborBearingBasis(input.basis)) return OK;
  if (input.isContractorOwned) return { ...OK, verdict: "ok" };

  const qty = Number(input.quantity ?? 0);
  const hours = Number(input.totalHours ?? 0);

  if (!(hours > 0)) {
    return {
      ...OK,
      verdict: "missing",
      message: "Installation work with no labor hours.",
    };
  }
  if (!isProductionBasis(input.basis) || !(qty > 0)) return { ...OK, verdict: "ok" };

  const band = bandFor(input.tradeKey ?? null, input.unitKey ?? null);
  if (!band) return OK;

  const hoursPerUnit = hours / qty;
  const expectedLow = Math.round(band.min * qty * 100) / 100;
  const expectedHigh = Math.round(band.max * qty * 100) / 100;
  const base = { hoursPerUnit, band, expectedLow, expectedHigh };

  if (hoursPerUnit < band.min) {
    return {
      ...base,
      verdict: "implausibly_low",
      message: `Derived ${hoursPerUnit.toFixed(4)} hr/unit is below the defensible floor of ${band.min} for this work.`,
    };
  }
  if (hoursPerUnit > band.max) {
    return {
      ...base,
      verdict: "implausibly_high",
      message: `Derived ${hoursPerUnit.toFixed(4)} hr/unit is above the defensible ceiling of ${band.max} for this work.`,
    };
  }
  return { ...base, verdict: "ok", message: null };
}
