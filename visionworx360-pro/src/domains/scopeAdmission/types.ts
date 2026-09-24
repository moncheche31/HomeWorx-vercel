/**
 * SCOPE ADMISSION CONTRACT.
 *
 * Recognition (lexicons, ontology matching, vision models) may produce as many
 * CANDIDATES as it likes. Only ADMITTED items may become narrative scope,
 * structured scope items or priced estimate inputs.
 *
 * There are exactly three admission paths, and media observation is not one of
 * them:
 *
 *   1. `contractor_intent`        — an action verb bound to the subject's own
 *                                  object inside the SAME clause of what the
 *                                  contractor said or typed.
 *   2. `media_reference_detail`   — the contractor explicitly tied media to work
 *                                  that is already admitted ("build the
 *                                  bookcases like this rendering"). Media may
 *                                  refine an admitted item; it may never add a
 *                                  new one.
 *   3. `construction_dependency`  — work that is normally required to execute an
 *                                  already-admitted item, always carrying the
 *                                  parent item and a stated reason.
 *
 * Everything else is a SUGGESTION: visible for review, never auto-committed and
 * never priced.
 */

export type AdmissionPath =
  | "contractor_intent"
  | "media_reference_detail"
  | "construction_dependency";

export type SuggestionCode =
  /** No ontology subject owns this feature key, so intent cannot be verified. */
  | "no_subject_mapping"
  /** The subject's own noun never appears in a clause of the evidence. */
  | "subject_not_in_clause"
  /** The noun appears, but no action verb is directed at it in that clause. */
  | "no_action_in_clause"
  /** The noun is a location, a grade word or a landmark ("plumbing chase"). */
  | "context_only"
  /** The contractor ruled this work out ("do not replace the siding"). */
  | "negated"
  /** Seen in media only. Never an admission path. */
  | "media_only"
  /** A construction dependency of an admitted item, offered for review. */
  | "dependency_required"
  | "dependency_likely"
  | "dependency_optional"
  | "dependency_unknown";

export interface ScopeCandidate {
  featureKey: string;
  label: string;
  /** The sentence (or observation phrase) the candidate was recognized in. */
  sentence: string;
  /** Where the candidate came from. `vision` can never be admitted on its own. */
  source?: "description" | "vision" | "manual";
}

export interface AdmittedScopeItem {
  featureKey: string;
  label: string;
  /** Ontology subject that owns the work. */
  subjectKey: string;
  path: AdmissionPath;
  /** Verb the contractor directed at the subject, when there is one. */
  action: string | null;
  /** The clause that admitted it — the narrowest quotable evidence. */
  clause: string;
  /** Whole sentence the clause came from. */
  sentence: string;
  /** Plain-language justification, always safe to show a contractor. */
  reason: string;
  /** For dependencies: the admitted feature key that requires this. */
  requiredBy: string | null;
  /**
   * True when the contractor named exactly one of a countable thing ("build an
   * access door"). Lets a count feature use 1 instead of a catalog default.
   */
  singularCount: boolean;
}

export interface SuggestedScopeItem {
  featureKey: string | null;
  label: string;
  code: SuggestionCode;
  reason: string;
  evidence: string;
  /** Question to ask instead of silently pricing it. */
  question: string;
  /** For dependency suggestions: the admitted item that implies it. */
  requiredBy?: string | null;
}

/** Media may only sharpen an admitted item's details. */
export interface MediaDetail {
  /** Admitted feature key the media informs. */
  featureKey: string;
  label: string;
  evidence: string;
  reason: string;
}

export interface AdmissionResult {
  admitted: AdmittedScopeItem[];
  suggested: SuggestedScopeItem[];
  mediaDetails: MediaDetail[];
  /** Subjects the contractor explicitly ruled out. */
  excludedSubjectKeys: string[];
  /** True when the contractor referenced media as a spec for stated work. */
  mediaReferenced: boolean;
}

export interface AdmissionInput {
  /** Everything the contractor said or typed, merged. */
  text: string;
  candidates: ScopeCandidate[];
}
