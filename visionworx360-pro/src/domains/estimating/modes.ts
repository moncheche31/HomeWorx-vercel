/**
 * The two estimating modes, as a product contract (not just wording).
 *
 * VisionWorx360 Pro sells two different promises and must never blur them:
 *
 * - BALLPARK is a *preliminary planning* estimate. It infers from project
 *   type, media, drawings, stated dimensions, scope context and regional
 *   assemblies, discloses what it assumed, asks only the few questions that
 *   could actually move the number, and answers "is this roughly a $20K, $50K
 *   or $100K project?". Ordinary residential unknowns become allowances, never
 *   blockers.
 * - DETAILED is a *priced document*. It inherits everything the ballpark
 *   established and refines it with confirmed quantities, decomposed
 *   assemblies, labor/material splits, selections and vendor pricing.
 *
 * One catalog serves both. The difference is granularity and who confirms the
 * numbers, not two parallel price libraries.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

export type EstimatingMode = "ballpark" | "detailed";

/**
 * How many high-value clarification questions a ballpark may put in front of
 * the contractor at once. Above this the mode stops being fast, and the honest
 * move is to assume, disclose the assumption, and let them correct it.
 */
export const BALLPARK_QUESTION_BUDGET = 6;

export interface EstimatingModeContract {
  mode: EstimatingMode;
  /** Coarse project/room assemblies vs decomposed line items. */
  granularity: "assembly" | "line_item";
  /** A range, or a single priced total. */
  output: "range" | "total";
  /** Max clarification questions surfaced at once (null = no cap). */
  questionBudget: number | null;
  /** May unresolved normal-residential detail stop the mode from finishing? */
  unknownsBlock: boolean;
  /** Unpriced/uncertain work resolves this way. */
  unknownsResolveAs: "allowance" | "explicit_price";
  /** Whose number it is once the mode completes. */
  authority: "assumed_by_engine" | "confirmed_by_contractor";
}

export const BALLPARK_CONTRACT: EstimatingModeContract = {
  mode: "ballpark",
  granularity: "assembly",
  output: "range",
  questionBudget: BALLPARK_QUESTION_BUDGET,
  unknownsBlock: false,
  unknownsResolveAs: "allowance",
  authority: "assumed_by_engine",
};

export const DETAILED_CONTRACT: EstimatingModeContract = {
  mode: "detailed",
  granularity: "line_item",
  output: "total",
  questionBudget: null,
  unknownsBlock: true,
  unknownsResolveAs: "explicit_price",
  authority: "confirmed_by_contractor",
};

export const ESTIMATING_MODE_CONTRACTS: Record<EstimatingMode, EstimatingModeContract> = {
  ballpark: BALLPARK_CONTRACT,
  detailed: DETAILED_CONTRACT,
};

export function estimatingModeContract(mode: EstimatingMode): EstimatingModeContract {
  return ESTIMATING_MODE_CONTRACTS[mode];
}

/**
 * Everything a detailed estimate inherits when a contractor progresses a
 * ballpark. Detailed mode never restarts intake: it refines what is already
 * known, and the ballpark snapshot stays in history for comparison.
 */
export const DETAILED_INHERITED_FACTS = [
  "client",
  "property",
  "project",
  "title",
  "description",
  "notes",
  "measurements",
  "geometry",
  "photos",
  "media",
  "scope",
  "assumptions",
  "answers",
  "ballparkRange",
] as const;

export type DetailedInheritedFact = (typeof DETAILED_INHERITED_FACTS)[number];

/**
 * Trim a list of candidate clarifications to the ballpark question budget,
 * keeping the caller's priority order. Anything dropped is not lost — it stays
 * a disclosed assumption the contractor can correct.
 */
export function selectBallparkClarifications<T>(
  candidates: readonly T[],
  budget: number = BALLPARK_QUESTION_BUDGET,
): T[] {
  const cap = Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : 0;
  return candidates.slice(0, cap);
}

/** True when a ballpark stayed within its promise of being fast to answer. */
export function withinBallparkQuestionBudget(
  questionCount: number,
  budget: number = BALLPARK_QUESTION_BUDGET,
): boolean {
  return questionCount <= budget;
}
