/**
 * The "Improve accuracy" clarification set.
 *
 * ONE definition, shared by the estimate card (which advertises the count) and
 * the ballpark page (which asks the questions). The card used to compute a
 * budgeted high-value subset while the page re-opened the WHOLE schema, so
 * "2 key details missing" led into a long hidden series of questions.
 *
 * Pure: no React, no network, no i18n.
 */

import type { RoomGeometryInput } from "@/domains/geometry";
import { selectBallparkClarifications } from "@/domains/estimating/modes";
import { mergeMeasuredGeometry } from "./continuity";
import { HIGH_VALUE_INPUTS } from "./intake";
import { visibleQuestions } from "./questions";
import { unresolvedQuestions, type WorkDomain } from "./scopeProfile";
import type { BallparkAnswers, BallparkInterviewSchema, BallparkQuestion } from "./types";

/**
 * The ONE answer basis the clarification count is computed from.
 *
 * The estimate card and the ballpark page previously each built their own view
 * of "what is already known" (one domain-filtered, one not; one ignoring the
 * saved schema key, one honouring it). Different bases mean different counts,
 * which is exactly how "2 key details" opened a longer series of cards. Both
 * callers must derive their basis here.
 */
export function improveAccuracySelectionAnswers(input: {
  /** Answers as persisted for this estimate's session. */
  savedAnswers: BallparkAnswers | null | undefined;
  /** Schema key the saved answers were captured under, if known. */
  savedSchemaKey?: string | null;
  /** Schema key in effect now. A mismatch means the saved answers are stale. */
  schemaKey: string;
  measured?: Partial<RoomGeometryInput> | null;
  domains?: WorkDomain[];
}): BallparkAnswers {
  const stale =
    input.savedSchemaKey != null && input.savedSchemaKey !== input.schemaKey;
  const base = stale ? {} : (input.savedAnswers ?? {});
  return mergeMeasuredGeometry(base, input.measured ?? null, input.domains ?? []);
}

/**
 * Genuinely high-value facts this project still has not resolved, in schema
 * order and never more than the ballpark question budget.
 */
export function selectImproveAccuracyQuestions(
  schema: BallparkInterviewSchema,
  answers: BallparkAnswers,
): BallparkQuestion[] {
  const askable = new Set(unresolvedQuestions(schema, answers).map((q) => q.id));
  return selectBallparkClarifications(
    visibleQuestions(schema, answers).filter(
      (q) =>
        askable.has(q.id) &&
        HIGH_VALUE_INPUTS.includes(q.id) &&
        answers[q.id]?.status !== "answered",
    ),
  );
}

/** Ids of the same set, for freezing an interview to exactly those cards. */
export function improveAccuracyQuestionIds(
  schema: BallparkInterviewSchema,
  answers: BallparkAnswers,
): string[] {
  return selectImproveAccuracyQuestions(schema, answers).map((q) => q.id);
}
