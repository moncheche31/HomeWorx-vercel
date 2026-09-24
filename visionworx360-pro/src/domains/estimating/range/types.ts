/**
 * V1 Estimate Range Engine — contracts.
 *
 * Layered *on top of* the Module 008 engine: it never re-implements the math.
 * It takes the same `EngineLineInput[]` every producer (Onsite Walkthrough,
 * Estimate from Photos, Describe Your Project, manual scope) already emits,
 * applies contractor-editable assumptions, and produces Good / Better / Best
 * preliminary ranges per section and for the whole project.
 *
 * Pure and deterministic: no Date, no random, no IO.
 */

export type RangeTier = "good" | "better" | "best";

export type RangeLocale = "en-US" | "es-US";

/** A named allowance the contractor can edit (permits, dumpster, travel…). */
export interface RangeAllowance {
  key: string;
  /** Contractor-entered label. Falls back to a localized label for known keys. */
  label?: string | null;
  amount: number;
  isTaxable?: boolean;
}

/**
 * Adjustment sourced from Estimate Review (Module 013). Accepted items widen
 * or reduce the range; they never silently change line-item math.
 */
export interface RangeAdjustment {
  id: string;
  label: string;
  kind: "add" | "reduce";
  low: number;
  high: number;
}

/** Everything the contractor can tune. Persisted with the estimate. */
export interface RangeAssumptions {
  tier: RangeTier;
  /** Overrides the per-line labor rate when set. */
  laborRate: number | null;
  overheadPct: number | null;
  profitPct: number | null;
  contingencyPct: number | null;
  /** Regional cost multiplier (1 = national baseline). */
  regionalFactor: number;
  allowances: RangeAllowance[];
  /** Allowances participate in overhead / profit / contingency. */
  markupOnAllowances: boolean;
  adjustments: RangeAdjustment[];
  /** Lines the contractor excluded from the preliminary range. */
  excludedLineIds: string[];
}

export interface RangeSectionResult {
  key: string;
  label: string;
  lineCount: number;
  laborHours: number;
  mid: number;
  low: number;
  high: number;
}

export interface RangeTierResult {
  tier: RangeTier;
  mid: number;
  low: number;
  high: number;
  laborHours: number;
  crewHours: number;
  /** Cost breakdown at this tier. */
  breakdown: {
    labor: number;
    material: number;
    equipment: number;
    subcontractor: number;
    other: number;
    allowances: number;
    overhead: number;
    profit: number;
    contingency: number;
    tax: number;
    directCost: number;
  };
  /**
   * The priced scope band BEFORE any Estimate Review adjustment. Displayed
   * separately so accepted options can never make the priced work look free.
   */
  base: { mid: number; low: number; high: number };
  /** What the accepted adjustments actually moved, after capping. */
  adjustmentImpact: {
    addLow: number;
    addHigh: number;
    reduceLow: number;
    reduceHigh: number;
    /** True when combined reductions were scaled down to the safety cap. */
    capped: boolean;
  };
  /** Adjustments as applied (deduplicated, capped) — not as requested. */
  adjustments: RangeAdjustment[];
  sections: RangeSectionResult[];
}

export interface EstimateRangeResult {
  currency: string;
  /** Always in Good / Better / Best order. */
  tiers: RangeTierResult[];
  selected: RangeTierResult;
  assumptions: RangeAssumptions;
  /** Non-blocking notes (missing rate, no lines, sample pricing…). */
  warnings: { code: string; message: string }[];
  /** True while nothing priceable exists. */
  isEmpty: boolean;
}
