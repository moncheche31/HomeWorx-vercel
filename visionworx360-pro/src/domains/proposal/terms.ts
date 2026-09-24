/**
 * Centralized, versioned estimate/proposal terms.
 *
 * Wording lives in i18n (`proposal` namespace, `terms.*`) so it stays EN/ES,
 * and every field that a contractor may want to change (validity period,
 * which clauses appear) is configuration here rather than buried in a
 * component. `reviewStatus` is INTERNAL metadata and is never rendered to a
 * customer.
 */

export type ProposalTermsClauseKey =
  | "validity"
  | "basisOfEstimate"
  | "concealedConditions"
  | "changeOrders"
  | "exclusions"
  | "taxesAndFees"
  | "permitsAndCode"
  | "selectionsAndAllowances"
  | "preliminaryVsFinal"
  | "acceptance";

export interface ProposalTermsConfig {
  key: string;
  version: string;
  /** Days the estimate/proposal price stays valid. */
  validityDays: number;
  clauses: ProposalTermsClauseKey[];
  /** Internal launch-readiness metadata; not customer-visible. */
  reviewStatus: "owner_approved_draft" | "counsel_reviewed";
}

export const DEFAULT_PROPOSAL_TERMS: ProposalTermsConfig = {
  key: "estimate_proposal_terms",
  version: "2026-08-01",
  validityDays: 30,
  clauses: [
    "validity",
    "basisOfEstimate",
    "concealedConditions",
    "changeOrders",
    "exclusions",
    "taxesAndFees",
    "permitsAndCode",
    "selectionsAndAllowances",
    "preliminaryVsFinal",
    "acceptance",
  ],
  reviewStatus: "owner_approved_draft",
};

/** Clauses to render for a given document, honouring configuration and context. */
export function resolveProposalTermsClauses(
  config: ProposalTermsConfig,
  context: { preliminary: boolean; hasAcceptance: boolean },
): ProposalTermsClauseKey[] {
  return config.clauses.filter((clause) => {
    if (clause === "preliminaryVsFinal") return context.preliminary;
    if (clause === "acceptance") return context.hasAcceptance;
    return true;
  });
}
