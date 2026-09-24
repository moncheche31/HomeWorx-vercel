import type { RemoteVisionSession } from "./types";

/**
 * The project's durable, already-saved state as this page needs to READ it.
 * Read-only mirror of `project_notes` (project_description) and
 * `project_narrative_scopes`. This module never writes anything back.
 */
export interface DurableProjectScopeState {
  /** `project_notes` -> note_type = 'project_description'. */
  descriptionText: string;
  /** Contractor-approved wording, when the project has an approval. */
  approvedText: string | null;
  approvedAt: string | null;
  /** Contractor-edited (but not yet approved) wording. */
  editedText: string | null;
}

/**
 * Precedence: FILL THE BLANKS.
 *
 * The photo/video flow is strictly additive, so durable project state is only
 * ever used to seed fields the local session has nothing in. A local value —
 * however old — is contractor work in this exact flow and always wins, which
 * makes the rule safe in both directions:
 *
 *  - Fresh open, no local session (Michael's case): every field is blank, so
 *    the saved description/narrative/approval hydrate and the flow resumes at
 *    the right step instead of rendering a disabled first-time intake.
 *  - Local session in progress: nothing is overwritten or downgraded, so an
 *    unsynced edit can never be clobbered by an older durable record.
 *
 * Timestamp comparison was rejected deliberately: the local session stamps
 * `updatedAt` on trivial UI churn (selecting a level, opening a panel), so a
 * newer-wins rule would let an empty local session out-rank real saved scope.
 */
export function planDurableHydration(
  session: RemoteVisionSession,
  durable: DurableProjectScopeState,
): Partial<RemoteVisionSession> | null {
  const patch: Partial<RemoteVisionSession> = {};

  const description = durable.descriptionText.trim();
  if (!session.description.trim() && description) patch.description = description;

  const narrative = (durable.approvedText ?? durable.editedText ?? "").trim();
  if (!(session.editedNarrative ?? "").trim() && narrative) patch.editedNarrative = narrative;

  if (!session.approvedAt && durable.approvedAt && durable.approvedText) {
    patch.approvedAt = durable.approvedAt;
    patch.approvedNarrative = durable.approvedText;
  }

  return Object.keys(patch).length ? patch : null;
}

/**
 * RE-CAPTURE: the contractor recorded the scope again somewhere else (the
 * Voice Capture screen writes `project_notes` directly). "Fill the blanks"
 * alone can never see that — the local session already has the OLD narration,
 * so the analyzer keeps replaying stale text and nothing new is ever persisted.
 *
 * Adoption is deliberately narrow: only when the DURABLE text itself changed
 * since this session last observed it. A local edit that has not been saved yet
 * leaves the durable text untouched, so it can never be clobbered here.
 *
 * New narration is new scope, so any wording/approval derived from the previous
 * narration is cleared and the scope regenerates for re-approval.
 */
export function planReCaptureAdoption(
  session: RemoteVisionSession,
  input: { previousDurableText: string | null; descriptionText: string },
): Partial<RemoteVisionSession> | null {
  const next = input.descriptionText.trim();
  const previous = (input.previousDurableText ?? "").trim();
  if (!next || previous === next) return null;
  if (next === session.description.trim()) return null;
  return {
    description: next,
    editedNarrative: null,
    approvedNarrative: null,
    approvedAt: null,
  };
}

