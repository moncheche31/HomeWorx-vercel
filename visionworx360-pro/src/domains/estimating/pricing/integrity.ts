/**
 * Pricing integrity guard (detailed estimates).
 *
 * A ballpark estimate carries a whole-project band (labor, materials, burden,
 * overhead, profit, allowances, demolition, disposal, permits, contingency).
 * When it is converted to a detailed estimate the scope-derived line items are
 * only as complete as the knowledge-base pricing behind them: lines that match
 * no assembly land at zero cost. The engine happily sums those zeroes, so a
 * $38.8k ballpark can present as a credible-looking $7k detailed total.
 *
 * This module classifies that situation. It never changes any number: real
 * refinement is allowed to move pricing in either direction. It only detects a
 * collapse that is *explained by missing pricing* and marks the detailed
 * estimate INCOMPLETE so the UI can keep showing the ballpark reference band
 * instead of presenting the partial figure as final.
 *
 * Pure and deterministic — no network, no React, no i18n.
 */

/** Minimum shape needed from a detailed line. */
export interface IntegrityLine {
  laborHours: number;
  laborRate: number;
  materialCost: number;
  equipmentCost: number;
  subcontractorCost: number;
  otherCost: number;
}

export interface BallparkReference {
  low: number;
  expected: number;
  high: number;
}

/** Share of lines that must carry a cost before a detailed estimate is credible. */
export const MIN_PRICED_LINE_RATIO = 0.8;

/**
 * How far the detailed total may fall under the ballpark low before we treat it
 * as a collapse rather than a legitimate refinement.
 */
export const BALLPARK_COLLAPSE_RATIO = 0.6;

export type IntegrityReason = "unpriced_lines" | "below_ballpark" | "no_lines";

export interface DetailedIntegrity {
  /** Detailed pricing cannot be presented as ready/final. */
  isIncomplete: boolean;
  /** Why, in priority order. */
  reasons: IntegrityReason[];
  totalLines: number;
  pricedLines: number;
  unpricedLines: number;
  /** 0..1 share of lines carrying any cost. */
  pricedRatio: number;
  /** Detailed grand total compared against the ballpark low, when available. */
  ballparkLow: number | null;
  ratioToBallparkLow: number | null;
}

const lineHasCost = (line: IntegrityLine): boolean =>
  (line.laborHours || 0) * (line.laborRate || 0) > 0 ||
  (line.materialCost || 0) > 0 ||
  (line.equipmentCost || 0) > 0 ||
  (line.subcontractorCost || 0) > 0 ||
  (line.otherCost || 0) > 0;

/**
 * Classify a detailed estimate against its own line coverage and, when known,
 * the ballpark band it was converted from.
 */
export function assessDetailedIntegrity(input: {
  lines: IntegrityLine[];
  grandTotal: number;
  ballpark?: BallparkReference | null;
}): DetailedIntegrity {
  const lines = input.lines ?? [];
  const totalLines = lines.length;
  const pricedLines = lines.filter(lineHasCost).length;
  const unpricedLines = totalLines - pricedLines;
  const pricedRatio = totalLines === 0 ? 0 : pricedLines / totalLines;

  const ballparkLow =
    input.ballpark && Number.isFinite(input.ballpark.low) && input.ballpark.low > 0
      ? input.ballpark.low
      : null;
  const ratioToBallparkLow = ballparkLow ? input.grandTotal / ballparkLow : null;

  const reasons: IntegrityReason[] = [];
  if (totalLines === 0) reasons.push("no_lines");
  if (totalLines > 0 && pricedRatio < MIN_PRICED_LINE_RATIO) reasons.push("unpriced_lines");
  /*
   * A collapse only counts when unpriced lines can explain it. A contractor who
   * deliberately reprices every line downwards is refining, not collapsing.
   */
  if (
    ratioToBallparkLow != null &&
    ratioToBallparkLow < BALLPARK_COLLAPSE_RATIO &&
    unpricedLines > 0
  ) {
    reasons.push("below_ballpark");
  }

  return {
    isIncomplete: reasons.length > 0,
    reasons,
    totalLines,
    pricedLines,
    unpricedLines,
    pricedRatio,
    ballparkLow,
    ratioToBallparkLow,
  };
}

/** Statuses a detailed estimate may not reach while pricing is incomplete. */
export const FINAL_ESTIMATE_STATUSES = [
  "ready",
  "approved",
  "sent",
  "accepted",
] as const;

export function isFinalEstimateStatus(status: string): boolean {
  return (FINAL_ESTIMATE_STATUSES as readonly string[]).includes(status);
}
