/**
 * Scope sanity check — contracts.
 *
 * This is a GUARDRAIL, not an interview. It never rewrites scope; it produces
 * findings the contractor confirms, edits, reclassifies, merges or deletes
 * before approving. Messages are i18n keys plus params so the domain stays
 * language-free.
 */

import type { LaborTradeKey } from "@/domains/estimating/tradeTaxonomy";

export type ScopeFindingKind =
  /** Same work listed twice (exact or near-duplicate wording). */
  | "duplicate"
  /** Work that does not belong to this project type / room program. */
  | "unrelated_scope"
  /** Trade/category assignment contradicts the wording of the work. */
  | "suspicious_trade"
  /** Evidence implies a phase (usually demolition) that no item covers. */
  | "missing_phase"
  /** Labor-bearing item with no hours and no declared reason. */
  | "zero_hours"
  /** Real construction work priced at a token fraction of an hour. */
  | "implausible_hours"
  /** Two items that cannot both be true. */
  | "conflicting_scope"
  /** Reads like it was carried over from another project or room. */
  | "foreign_context"
  /** Approved item with no pricing or labor treatment at all. */
  | "untreated_item";

export type ScopeFindingSeverity = "blocker" | "warning" | "info";

/** How an item with no labor hours is legitimately accounted for. */
export type LaborTreatment =
  | "labor"
  | "no_labor"
  | "allowance"
  | "subcontract"
  | "excluded";

export const LABOR_TREATMENTS: readonly LaborTreatment[] = [
  "labor",
  "no_labor",
  "allowance",
  "subcontract",
  "excluded",
];

/** A treatment other than `labor` is an explicit, auditable contractor answer. */
export function isExplicitNoLaborTreatment(
  treatment: LaborTreatment | null | undefined,
): boolean {
  return (
    treatment === "no_labor" ||
    treatment === "allowance" ||
    treatment === "subcontract" ||
    treatment === "excluded"
  );
}

export interface ScopeValidationItem {
  id: string;
  title: string;
  description?: string | null;
  tradeKey?: string | null;
  categoryKey?: string | null;
  sectionName?: string | null;
  roomId?: string | null;
  roomName?: string | null;
  quantity?: number | null;
  unitKey?: string | null;
  /** Internal labor hours currently attached to this item. */
  laborHours?: number | null;
  /** Explicit contractor answer for items without hours. */
  laborTreatment?: LaborTreatment | null;
  /** False for pure allowances / owner-supplied material lines. */
  isLaborBearing?: boolean | null;
  /** Whether the estimating engine produced any price for this item. */
  isPriced?: boolean | null;
  isIncluded?: boolean | null;
  /** Stable provenance handle (import/source row) when the item has one. */
  originRef?: string | null;
  /** Section the item lives in — part of duplicate identity. */
  sectionId?: string | null;
  /**
   * Who chose the current trade. A contractor's own assignment is authoritative:
   * the validator never proposes reclassifying it, whatever the wording says.
   */
  tradeAssignedBy?: "contractor" | "system" | null;
}

export interface ScopeValidationContext {
  projectName?: string | null;
  projectType?: string | null;
  /** Narrative / interview / photo evidence text, concatenated. */
  evidenceText?: string | null;
  /** Room names that legitimately belong to this project. */
  roomNames?: readonly string[];
}

export interface ScopeFinding {
  /** Render key. NOT a decision key — it can move when scope is re-validated. */
  id: string;
  /**
   * Stable identity of the ISSUE (kind + the items it is about), independent
   * of array order and of unrelated scope changes. Contractor decisions are
   * keyed on this, never on `id`.
   */
  subjectKey: string;
  /**
   * Identity + the decision-relevant state of those items. A decision stays
   * honoured while this matches; a material edit changes it and re-opens the
   * question.
   */
  subjectFingerprint: string;
  kind: ScopeFindingKind;
  severity: ScopeFindingSeverity;
  /** Every item the finding is about. Never empty except `missing_phase`. */
  itemIds: string[];
  /** i18n interpolation values for `scope:validation.rules.<kind>`. */
  params?: Record<string, string | number>;
  /** For `suspicious_trade`: the trade the wording actually points at. */
  suggestedTradeKey?: LaborTradeKey | null;
}

/** A persisted contractor decision about one issue subject. */
export interface ScopeDecisionRecord {
  subjectKey: string;
  subjectFingerprint: string;
  decision?: "kept" | "reassigned" | "dismissed";
  decidedTradeKey?: string | null;
}


export interface ScopeValidationReport {
  findings: ScopeFinding[];
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  /** True when nothing needs a decision before approval. */
  isClean: boolean;
  /** Fingerprint of the validated scope; a change forces re-validation. */
  fingerprint: string;
}
