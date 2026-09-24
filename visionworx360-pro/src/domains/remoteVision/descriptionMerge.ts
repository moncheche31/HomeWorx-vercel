/**
 * ADDITIVE PROJECT DESCRIPTION.
 *
 * The project description note is the contractor's own record of the job. A
 * later capture (a photo/video session, a second walkthrough) ADDS to it; it
 * must never silently replace what was written before — that destroyed real
 * contractor content on a live project.
 *
 * Pure module: no React, no IO.
 */

const SEPARATOR = "\n\n";

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Merge newly captured text into the existing description.
 *
 * - Empty existing text -> the addition becomes the description.
 * - Addition already contained (verbatim or as a whole block) -> unchanged.
 * - Existing text contained inside the addition (a re-dictation that starts
 *   from the same words) -> the longer, newer text wins without data loss.
 * - Otherwise the addition is appended as a new paragraph.
 */
export function mergeDescriptionBody(existing: string, addition: string): string {
  const previous = (existing ?? "").trim();
  const next = (addition ?? "").trim();
  if (!next) return previous;
  if (!previous) return next;

  const a = normalize(previous);
  const b = normalize(next);
  if (a === b || a.includes(b)) return previous;
  if (b.includes(a)) return next;
  return `${previous}${SEPARATOR}${next}`;
}
