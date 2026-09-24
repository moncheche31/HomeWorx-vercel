/**
 * Turning a save failure into something a contractor can act on.
 *
 * The old code showed one generic "We could not save that." for every cause —
 * a locked estimate, an expired session and a database fault all looked the
 * same, and nothing about the real error survived to be diagnosed. Every
 * failure now gets a category plus a short reference id that is logged with
 * the underlying cause (never shown raw, never carrying payload data).
 */

export type BallparkSaveCategory =
  | "offline"
  | "auth"
  | "locked"
  | "notFound"
  | "invalidSnapshot"
  | "validation"
  | "server";

export interface BallparkSaveFailure {
  category: BallparkSaveCategory;
  /** Short, non-sensitive id repeated in the toast and the log line. */
  reference: string;
  /** Underlying message, for logs only. */
  cause: string;
}

function reference(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "unknown_error";
}

export function categorizeBallparkSaveError(error: unknown): BallparkSaveFailure {
  const cause = messageOf(error);
  const text = cause.toLowerCase();
  let category: BallparkSaveCategory = "server";
  if (typeof navigator !== "undefined" && navigator.onLine === false) category = "offline";
  else if (text.includes("unauthorized") || text.includes("jwt") || text.includes("401")) category = "auth";
  else if (text.includes("estimate_locked")) category = "locked";
  else if (text.includes("not_found")) category = "notFound";
  else if (text.includes("invalid_ballpark_snapshot")) category = "invalidSnapshot";
  else if (
    text.includes("invalid_intake_source") ||
    text.includes("invalid_ballpark_stage") ||
    text.includes("invalid_interview_type") ||
    text.includes("invalid_frozen_question_ids") ||
    text.includes("validation") ||
    text.includes("expected")
  )
    category = "validation";
  return { category, reference: reference(), cause };
}
