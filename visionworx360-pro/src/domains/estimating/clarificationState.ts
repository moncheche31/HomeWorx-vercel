/**
 * State-aware clarification/interview CTAs (contractor pilot).
 *
 * Completed work must look completed. Every surface that asks the contractor
 * clarification questions — Scope of Work "Answer Questions", the ballpark
 * assumptions and the Full Interview — derives its label from persisted
 * answer state through this one function, so wording can never drift between
 * screens or revert after a refresh.
 */

export type ClarificationStatus =
  /** Nothing answered yet: first-time wording. */
  | "unstarted"
  /** Answers exist and nothing is outstanding: review/revise wording. */
  | "completed"
  /** Answers exist AND scope produced genuinely new unanswered questions. */
  | "new";

export interface ClarificationState {
  status: ClarificationStatus;
  /** How many prior answers are persisted. */
  answeredCount: number;
  /** How many questions are still unanswered (new material only). */
  openCount: number;
  /** True once anything has been answered — survives refresh/navigation. */
  completed: boolean;
}

export interface ClarificationCounts {
  answeredCount: number;
  openCount: number;
}

export function deriveClarificationState({
  answeredCount,
  openCount,
}: ClarificationCounts): ClarificationState {
  const answered = Math.max(0, Math.trunc(answeredCount || 0));
  const open = Math.max(0, Math.trunc(openCount || 0));
  const status: ClarificationStatus =
    answered === 0 ? "unstarted" : open > 0 ? "new" : "completed";
  return { status, answeredCount: answered, openCount: open, completed: answered > 0 };
}

/** Count only real answers; blank strings are not answers. */
export function countAnsweredEntries(answers: Record<string, unknown> | null | undefined): number {
  if (!answers) return 0;
  return Object.values(answers).filter((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "object") {
      const status = (value as { status?: unknown }).status;
      if (typeof status === "string") return status === "answered";
      return true;
    }
    return true;
  }).length;
}

export interface ClarificationLabelKeys {
  /** First time: "Answer Questions". */
  unstarted: string;
  /** Completed: "Review / Revise Answers". */
  completed: string;
  /** New material questions: "Answer {{count}} New Questions". */
  fresh: string;
}

/**
 * The i18n key plus interpolation values for a clarification CTA. Callers
 * translate it; the branching never lives in a component.
 */
export function clarificationLabel(
  state: ClarificationState,
  keys: ClarificationLabelKeys,
): { key: string; count: number } {
  if (state.status === "unstarted") return { key: keys.unstarted, count: state.openCount };
  if (state.status === "new") return { key: keys.fresh, count: state.openCount };
  return { key: keys.completed, count: state.answeredCount };
}
