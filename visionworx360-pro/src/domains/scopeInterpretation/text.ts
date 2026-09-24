/**
 * Shared text normalisation for narrative ↔ structured scope comparison.
 * Pure: no React, no network, no i18n.
 */

import { splitUtterances } from "@/domains/voiceCapture";

export const norm = (text: string) =>
  (text ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

const STOP = new Set([
  "the", "a", "an", "of", "to", "in", "on", "for", "with", "and", "all", "new",
  "we", "will", "is", "are", "be", "at", "existing", "el", "la", "los", "las",
  "un", "una", "de", "del", "en", "y", "con", "para",
]);

export const tokens = (text: string) => norm(text).split(" ").filter((w) => w && !STOP.has(w));

export function similarity(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  A.forEach((w) => { if (B.has(w)) shared += 1; });
  return shared / Math.max(A.size, B.size);
}

export function sentences(text: string): string[] {
  return splitUtterances(text ?? "")
    .flatMap((s) => s.split(/\n+/))
    .map((s) => s.replace(/^[\s•\u2013\-]+/, "").trim())
    .filter((s) => s.length > 0);
}
