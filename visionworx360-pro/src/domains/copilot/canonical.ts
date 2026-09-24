/**
 * Estimate Review, wired to the canonical project-fact model.
 *
 * Estimate Review used to be a third, disconnected questionnaire brain: its
 * accept / remove decisions lived only in device storage, so "Finish review"
 * could never move a number. This module gives every recommendation a stable
 * semantic fact id (`review.<itemKey>`) shared with Answer More Questions and
 * the Full Interview, so a decision made once is suppressed everywhere and can
 * drive a single, explicit recalculation.
 */
import type {
  CopilotDecision,
  CopilotDecisionMap,
  CopilotRecommendation,
  CopilotReview,
  CopilotSectionKey,
} from "./types";

export const REVIEW_FACT_PREFIX = "review.";

/** Stable semantic fact id for a recommendation. Never a display string. */
export function reviewFactKey(itemKey: string): string {
  return `${REVIEW_FACT_PREFIX}${itemKey}`;
}

/** Sections whose acceptance adds real work, and therefore real cost. */
const COST_DRIVING_SECTIONS: CopilotSectionKey[] = ["standard_items", "missing_scope", "upsell"];

export function isCostDriving(rec: CopilotRecommendation): boolean {
  return COST_DRIVING_SECTIONS.includes(rec.sectionKey);
}

/** Decisions already persisted as canonical facts, keyed by recommendation id. */
export function decisionsFromFacts(
  review: CopilotReview,
  answers: Record<string, string> | null | undefined,
): CopilotDecisionMap {
  const map: CopilotDecisionMap = {};
  for (const rec of review.recommendations) {
    const stored = answers?.[reviewFactKey(rec.itemKey)];
    if (stored === "accepted" || stored === "removed") map[rec.id] = stored;
  }
  return map;
}

/** Canonical answer patch for the decisions taken in this session. */
export function factsFromDecisions(
  review: CopilotReview,
  decisions: CopilotDecisionMap,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const rec of review.recommendations) {
    const decision = decisions[rec.id];
    if (decision === "accepted" || decision === "removed") {
      patch[reviewFactKey(rec.itemKey)] = decision;
    }
  }
  return patch;
}

/**
 * Hide anything the contractor already decided in an earlier review. A fact
 * known canonically is never asked twice, in any surface.
 */
export function suppressAnsweredRecommendations(
  review: CopilotReview,
  answers: Record<string, string> | null | undefined,
): CopilotReview {
  const known = (rec: CopilotRecommendation) => {
    const stored = answers?.[reviewFactKey(rec.itemKey)];
    return stored === "accepted" || stored === "removed";
  };
  const sections = review.sections.map((section) => ({
    ...section,
    recommendations: section.recommendations.filter((rec) => !known(rec)),
  }));
  const recommendations = review.recommendations.filter((rec) => !known(rec));
  const counts = { ...review.counts };
  for (const section of sections) counts[section.key] = section.recommendations.length;
  return {
    ...review,
    sections,
    recommendations,
    counts,
    isEmpty: review.isEmpty || recommendations.length === 0,
  };
}

export interface ReviewCommitPlan {
  /** Canonical answer patch to persist (empty when nothing was decided). */
  factPatch: Record<string, string>;
  /** Newly accepted, cost-driving recommendations to add to the scope. */
  additions: CopilotRecommendation[];
  /** Any new or changed canonical fact at all (including removals). */
  hasFactChange: boolean;
  /** Recalculation only runs when accepted work actually enters the scope. */
  shouldRecalculate: boolean;
}

/**
 * What finishing the review should actually do.
 *
 * No changed decision -> no fact write, no recalculation: a re-opened review
 * can never overwrite corrected pricing. A changed decision that adds work ->
 * the work is added to the scope and the active ballpark recalculates exactly
 * once from the corrected resolver.
 */
export function planReviewCommit(
  review: CopilotReview,
  decisions: CopilotDecisionMap,
  persistedAnswers: Record<string, string> | null | undefined,
): ReviewCommitPlan {
  const factPatch: Record<string, string> = {};
  const additions: CopilotRecommendation[] = [];

  for (const rec of review.recommendations) {
    const decision: CopilotDecision | undefined = decisions[rec.id];
    if (decision !== "accepted" && decision !== "removed") continue;
    const key = reviewFactKey(rec.itemKey);
    if (persistedAnswers?.[key] === decision) continue; // unchanged fact
    factPatch[key] = decision;
    if (decision === "accepted" && isCostDriving(rec)) additions.push(rec);
  }

  return {
    factPatch,
    additions,
    hasFactChange: Object.keys(factPatch).length > 0,
    shouldRecalculate: additions.length > 0,
  };
}
