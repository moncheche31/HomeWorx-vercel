/**
 * Answer integrity: a transcript and its normalized value may never disagree.
 *
 * The interview keeps the contractor's own words next to the machine value it
 * parsed from them. Anything that later rewrites the value (an autosave race,
 * a stale server row, a measurement overlay) can leave "5'x11' bathroom"
 * stored as `none`, "36" stored as `20`, or "9.5" stored as `9`. A silently
 * contradicted answer then drives quantities and pricing.
 *
 * This module re-derives every transcript-backed answer from the transcript
 * itself, against the question that actually asked it:
 *
 *  - transcript re-reads to a different value  -> the transcript wins
 *  - transcript can no longer be read at all   -> the answer is held for review
 *  - no transcript (structured pick, measured)  -> untouched
 *
 * It is pure and idempotent, so it can run on every render.
 */

import { parseAnswer } from "./parse";
import type {
  BallparkAnswer,
  BallparkAnswers,
  BallparkInterviewSchema,
  BallparkLocale,
} from "./types";

export interface AnswerIntegrityConflict {
  questionId: string;
  transcript: string;
  storedValue: string | number | null;
  transcriptValue: string | number | null;
  /** `corrected` = transcript value restored; `review` = held as unknown. */
  resolution: "corrected" | "review";
}

const sameValue = (a: string | number | null, b: string | number | null) => {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
  return String(a ?? "") === String(b ?? "");
};

/**
 * Reconcile answers against their transcripts. Returns the corrected answers
 * plus the conflicts found, so the UI can surface what it had to change.
 */
export function reconcileAnswerIntegrity(
  schema: BallparkInterviewSchema,
  answers: BallparkAnswers,
  locale: BallparkLocale = "en-US",
): { answers: BallparkAnswers; conflicts: AnswerIntegrityConflict[] } {
  const byId = new Map(schema.questions.map((question) => [question.id, question]));
  const next: BallparkAnswers = { ...answers };
  const conflicts: AnswerIntegrityConflict[] = [];

  for (const [id, answer] of Object.entries(answers)) {
    const transcript = answer?.transcript?.trim();
    if (!answer || !transcript) continue;
    if (answer.status !== "answered") continue;
    const question = byId.get(id);
    if (!question) continue;

    const parsed = parseAnswer(question, transcript, locale);
    /* "I don't know" is a real state, already represented by status. */
    if (parsed.unknown) continue;
    const stored = (answer.value ?? null) as string | number | null;
    const fromTranscript = (parsed.value ?? null) as string | number | null;
    if (fromTranscript !== null && sameValue(stored, fromTranscript)) continue;

    if (fromTranscript !== null) {
      const corrected: BallparkAnswer = { status: "answered", value: fromTranscript, transcript };
      next[id] = corrected;
      conflicts.push({
        questionId: id,
        transcript,
        storedValue: stored,
        transcriptValue: fromTranscript,
        resolution: "corrected",
      });
      continue;
    }

    /* The words cannot be read for this question. Never keep a value the
       contractor never said: hold it for review instead. */
    next[id] = { status: "unknown", transcript };
    conflicts.push({
      questionId: id,
      transcript,
      storedValue: stored,
      transcriptValue: null,
      resolution: "review",
    });
  }

  return { answers: next, conflicts };
}

/** True when an answer carries the contractor's own words. */
export function isContractorStated(answer: BallparkAnswer | undefined): boolean {
  return Boolean(answer && answer.status === "answered" && (answer.transcript ?? "").trim());
}
