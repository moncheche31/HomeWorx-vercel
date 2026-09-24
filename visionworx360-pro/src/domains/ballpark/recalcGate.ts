/**
 * Integrity gate for scope-driven ballpark recalculation.
 *
 * A ballpark band is a customer-facing number. It may only be replaced by a
 * scope-derived recalculation when the structured scope is actually reconciled
 * with the current Scope of Work, and when the new number is not absurd next to
 * the credible band it would replace.
 *
 * Blocking never destroys anything: the caller keeps the last credible band as
 * current and surfaces a "scope needs review" state instead.
 *
 * Pure: no React, no network, no i18n.
 */

export interface RecalcBand {
  low: number;
  expected: number;
  high: number;
}

export interface RecalcGateInput {
  candidate: RecalcBand | null;
  previous: RecalcBand | null;
  /** Included scope items the current narrative does not describe. */
  unresolvedCount: number;
  /** Scope lines the pricebook could not price at all. */
  unpriceableCount?: number;
  /** How far the new expected value may drift from a credible band. */
  divergenceFactor?: number;
  /**
   * The recalculation was requested by the contractor correcting a disclosed
   * assumption or answering a clarification question. That resolves the
   * "unreconciled scope" block — the contractor is looking at the facts — but
   * it is NOT a blanket bypass: a zero, invalid or implausibly divergent
   * candidate still may not replace a credible band.
   */
  contractorInitiated?: boolean;
  /**
   * The contractor typed an explicit corrected QUANTITY for a disclosed
   * assumption. That is authoritative arithmetic, not drift, so it clears the
   * divergence check as well — correcting "1 window" to "40 windows" is
   * supposed to move the price a long way.
   */
  assumptionCorrection?: boolean;
  /**
   * The saved snapshot was produced by an older pricing/inference engine. That
   * band's conclusions (notably its unpriced blockers) are known to be out of
   * date, so it is not the credible band the divergence gate exists to protect
   * and the migration to the current engine always applies.
   */
  engineUpgrade?: boolean;
  /**
   * The candidate priced meaningful scope to something presentable. `false`
   * means the new number is an incomplete estimate, never a quote.
   */
  candidateIsValidQuote?: boolean;
}


export type RecalcGateDecision =
  | { allow: true }
  | {
      allow: false;
      reason: "noResult" | "scopeNeedsReview" | "divergent" | "zeroBand" | "invalidCandidate";
    };

export const DEFAULT_DIVERGENCE_FACTOR = 2.5;

export function evaluateRecalcGate(input: RecalcGateInput): RecalcGateDecision {
  if (!input.candidate) return { allow: false, reason: "noResult" };

  /* Nothing credible to protect yet: a first band may be written freely. */
  if (!input.previous || !(input.previous.expected > 0)) return { allow: true };

  /*
   * A credible band is never replaced by nothing. This precedes every bypass:
   * neither a contractor clarification nor an engine upgrade may turn a real
   * price into $0 or into an admittedly incomplete quote.
   */
  if (!(input.candidate.expected > 0)) return { allow: false, reason: "zeroBand" };
  if (input.candidateIsValidQuote === false) {
    return { allow: false, reason: "invalidCandidate" };
  }

  if (input.engineUpgrade || input.assumptionCorrection) return { allow: true };

  /* A clarification IS the contractor reviewing the facts, so it clears this. */
  if (!input.contractorInitiated && input.unresolvedCount > 0) {
    return { allow: false, reason: "scopeNeedsReview" };
  }

  /* Sanity protection applies to contractor-initiated refinement as well. */
  const factor = input.divergenceFactor ?? DEFAULT_DIVERGENCE_FACTOR;
  const ratio = input.candidate.expected / input.previous.expected;
  if (ratio > factor || ratio < 1 / factor) return { allow: false, reason: "divergent" };

  return { allow: true };
}
