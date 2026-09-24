/**
 * WHICH review belongs to WHICH estimating mode.
 *
 * A preliminary ballpark exists to answer "roughly what does this cost?" fast
 * enough to share with a prospect. Findings that would change the PRICE or
 * reveal a scope error (the same work listed twice, work from another project,
 * a missing demolition phase) still belong there.
 *
 * Findings that only affect how the work is ORGANIZED or how production is
 * booked — trade classification, labor-hour treatment, per-line pricing
 * exceptions — do not change the ballpark's honesty and must never stand
 * between a contractor and a preliminary number. They stay visible as optional
 * review information and become required work in detailed mode.
 *
 * Pure module — no React, no IO, no i18n.
 */

import type { EstimatingMode } from "@/domains/estimating/modes";
import type { ScopeFinding, ScopeFindingKind } from "./types";

export type FindingReviewStage = "ballpark" | "detailed";

export const FINDING_REVIEW_STAGE: Record<ScopeFindingKind, FindingReviewStage> = {
  /* Price/scope integrity — a ballpark that ignores these is simply wrong. */
  duplicate: "ballpark",
  unrelated_scope: "ballpark",
  missing_phase: "ballpark",
  conflicting_scope: "ballpark",
  foreign_context: "ballpark",
  /* Organization / production detail — detailed estimate owns these. */
  suspicious_trade: "detailed",
  zero_hours: "detailed",
  implausible_hours: "detailed",
  untreated_item: "detailed",
};

export function findingReviewStage(kind: ScopeFindingKind): FindingReviewStage {
  return FINDING_REVIEW_STAGE[kind] ?? "ballpark";
}

/** True when this finding must be answered in the given mode. */
export function isFindingInScopeForMode(
  finding: ScopeFinding,
  mode: EstimatingMode,
): boolean {
  if (mode === "detailed") return true;
  return findingReviewStage(finding.kind) === "ballpark";
}

export interface StagedFindings {
  /** Answer these now. */
  active: ScopeFinding[];
  /** Optional, non-blocking, shown as "handled in the detailed estimate". */
  deferred: ScopeFinding[];
}

export function partitionFindingsByMode(
  findings: readonly ScopeFinding[],
  mode: EstimatingMode,
): StagedFindings {
  const active: ScopeFinding[] = [];
  const deferred: ScopeFinding[] = [];
  for (const finding of findings) {
    if (isFindingInScopeForMode(finding, mode)) active.push(finding);
    else deferred.push(finding);
  }
  return { active, deferred };
}

/** Trade-assignment review is deferred by definition; named for readability. */
export function isTradeAssignmentFinding(finding: ScopeFinding): boolean {
  return finding.kind === "suspicious_trade";
}
