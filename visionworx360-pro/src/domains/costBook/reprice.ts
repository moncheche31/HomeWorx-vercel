/**
 * Cost Book reprice eligibility.
 *
 * A company Cost Book change must NEVER silently reprice history. Approved,
 * locked, archived, superseded, sent and accepted estimates keep the numbers
 * they were presented with. Editable estimates get an explicit contractor
 * action instead ("New company rate available — reprice from Cost Book").
 *
 * Pure module — no React, no IO.
 */

export interface RepriceCandidate {
  estimateId: string;
  status: string | null;
  lockedAt?: string | null;
  archivedAt?: string | null;
  supersededById?: string | null;
  /** Cost book stamp the lines were priced from, when known. */
  costBookAppliedAt?: string | null;
}

/** Statuses that are still working documents. */
export const EDITABLE_ESTIMATE_STATUSES = ["draft", "in_review", "ready"] as const;

export type RepriceBlockReason =
  | "locked"
  | "archived"
  | "superseded"
  | "status_not_editable"
  | null;

/** Why an estimate cannot be repriced, or null when it can. */
export function repriceBlockReason(candidate: RepriceCandidate): RepriceBlockReason {
  if (candidate.archivedAt) return "archived";
  if (candidate.lockedAt) return "locked";
  if (candidate.supersededById) return "superseded";
  if (!EDITABLE_ESTIMATE_STATUSES.includes((candidate.status ?? "") as never)) {
    return "status_not_editable";
  }
  return null;
}

export function canRepriceFromCostBook(candidate: RepriceCandidate): boolean {
  return repriceBlockReason(candidate) === null;
}

/**
 * True when the company Cost Book changed after this estimate was priced, so
 * the UI may offer (never perform) a reprice.
 */
export function costBookUpdateAvailable(
  candidate: RepriceCandidate,
  companyUpdatedAt: string | null | undefined,
): boolean {
  if (!companyUpdatedAt) return false;
  if (!canRepriceFromCostBook(candidate)) return false;
  if (!candidate.costBookAppliedAt) return true;
  return new Date(companyUpdatedAt).getTime() > new Date(candidate.costBookAppliedAt).getTime();
}

/** Lines a reprice is allowed to touch: system-owned only. */
export function isRepriceableLine(line: {
  isPriceOverridden?: boolean | null;
  pricingSource?: string | null;
  archivedAt?: string | null;
}): boolean {
  if (line.archivedAt) return false;
  if (line.isPriceOverridden) return false;
  return !["contractor", "manual"].includes(String(line.pricingSource ?? ""));
}
