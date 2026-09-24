/**
 * Detailed-estimate pricing engine versioning.
 *
 * A ballpark snapshot self-heals when the engine changes (see
 * `src/domains/ballpark/engineVersion.ts`), but persisted `estimate_line_items`
 * did not: a line stamped `unmatched` by an older catalog stayed at $0 forever,
 * because every later sync only priced lines that had never been priced at all.
 * That is how the Kitchen Cabinets estimate kept reporting $0 base and upper
 * cabinetry after the canonical assemblies existed.
 *
 * The version stamp on the estimate row makes "these prices came from an older
 * engine" detectable, so reopening an EDITABLE DRAFT is enough to correct it.
 * Sent, accepted, locked or superseded documents stay frozen.
 *
 * Bump this ONLY when the pricing catalog / resolution logic changes in a way
 * that should retroactively replace already-persisted system pricing.
 *
 * Pure: no React, no network, no i18n.
 */

/**
 * 1 — intent aliases reconciled with the TypeScript intent map (base vs upper
 *     cabinetry resolve to distinct canonical assemblies) and `unmatched`
 *     becomes a retryable pricing outcome instead of a permanent $0.
 * 2 — authoritative calculator: catalog productivity is an explicit convention
 *     (hours per unit vs task total), labor is always
 *     `setup + quantity * hours_per_unit`, fees carry no labor, measured
 *     placeholder quantities are derived from saved project geometry, and the
 *     preliminary band is rebuilt from the SAME invariant detailed cost.
 */
export const PRICING_ENGINE_VERSION = 2;


export interface EstimatePricingStalenessInput {
  /** `pricing_engine_version` on the estimate row; 0/undefined = legacy. */
  pricingEngineVersion: number | null | undefined;
  /** Lines the system priced but could not resolve. */
  unmatchedLineCount: number;
  /** False for sent/accepted/locked/superseded documents. */
  isEditable: boolean;
  archived: boolean;
}

/**
 * True when an estimate's persisted system pricing should be recomputed.
 *
 * Deliberately narrow: an editable draft only. An estimate already at the
 * current version with no unresolved system lines is never touched, so this
 * can neither loop nor churn.
 */
export function shouldRepriceEstimate(input: EstimatePricingStalenessInput): boolean {
  if (!input.isEditable || input.archived) return false;
  const version = Number(input.pricingEngineVersion ?? 0);
  const stampStale = !Number.isFinite(version) || version < PRICING_ENGINE_VERSION;
  return stampStale || input.unmatchedLineCount > 0;
}
