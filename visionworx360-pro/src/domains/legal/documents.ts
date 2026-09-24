/**
 * Legal document registry.
 *
 * Wording lives in i18n (`legal` namespace) and is versioned here. The version
 * string is what gets persisted with a user's acceptance, so wording can be
 * replaced/reviewed later without changing the acceptance architecture.
 *
 * `reviewStatus` is INTERNAL metadata only — never rendered to customers.
 */

export type LegalReviewStatus = "owner_approved_draft" | "counsel_reviewed";

export interface LegalDocument {
  key: string;
  version: string;
  /** i18n keys within the `legal` namespace. */
  titleKey: string;
  summaryKey: string;
  sectionsKey: string;
  /** Customer-visible effective date (ISO yyyy-mm-dd). */
  effectiveDate: string;
  /** Internal launch-readiness flag; not customer-visible copy. */
  reviewStatus: LegalReviewStatus;
  launchReady: boolean;
  /**
   * INTERNAL: these documents are owner-approved production drafts. Counsel
   * review is required before broad public launch; flip to false only after
   * that review is recorded.
   */
  requiresCounselReview: boolean;
}

export const TERMS_DOCUMENT: LegalDocument = {
  key: "terms_of_service",
  version: "2026-08-01",
  effectiveDate: "2026-08-01",
  titleKey: "terms.title",
  summaryKey: "terms.summary",
  sectionsKey: "terms.sections",
  reviewStatus: "owner_approved_draft",
  launchReady: true,
  requiresCounselReview: true,
};

export const PRIVACY_DOCUMENT: LegalDocument = {
  key: "privacy_policy",
  version: "2026-08-01",
  effectiveDate: "2026-08-01",
  titleKey: "privacy.title",
  summaryKey: "privacy.summary",
  sectionsKey: "privacy.sections",
  reviewStatus: "owner_approved_draft",
  launchReady: true,
  requiresCounselReview: true,
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [TERMS_DOCUMENT, PRIVACY_DOCUMENT];

/** The document key/version pairs a new account accepts at signup. */
export const SIGNUP_ACCEPTANCE_DOCUMENTS = LEGAL_DOCUMENTS.map((d) => ({
  documentKey: d.key,
  documentVersion: d.version,
}));

export interface LegalSection {
  heading: string;
  body: string;
}
