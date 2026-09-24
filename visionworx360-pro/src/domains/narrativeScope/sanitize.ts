/**
 * The visible Scope of Work is a construction document, not an activity log.
 *
 * Clarification answers and Estimate Review decisions are canonical facts
 * (`review.<itemKey>`, interview answers). They used to be appended verbatim
 * to the generated narrative, which produced orphaned runs of
 * "Approved / Accepted / Removed" with no referent — and once a contractor
 * edited the wording, those tokens were baked into the durable `editedText`
 * and survived every later save. This module is the single place that decides
 * what counts as a decision token, so both the generator and the saved
 * wording are cleaned by exactly the same rule.
 *
 * The decisions themselves are never deleted: they stay in the durable
 * `answers` map and drive suppression, pricing and the history surfaces.
 */

/** Bare decision statuses, EN and ES, with or without trailing punctuation. */
const DECISION_TOKEN =
  /^(accepted|approved|removed|rejected|declined|dismissed|pending|skipped|kept|included|excluded|yes|no|n\/a|aceptado|aceptada|aprobado|aprobada|eliminado|eliminada|retirado|retirada|rechazado|rechazada|omitido|omitida|pendiente|incluido|incluida|excluido|excluida|sí|si)$/i;

/** Canonical fact namespaces that are decisions, never prose. */
const DECISION_KEY_PREFIXES = ["review."];

function normalize(value: string): string {
  return value
    .trim()
    .replace(/^[-•*\d.\s)]+/, "")
    .replace(/[.!;,]+$/, "")
    .trim();
}

/** True when this answer is a decision status rather than contractor prose. */
export function isDecisionAnswer(key: string, value: string): boolean {
  if (DECISION_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
  return DECISION_TOKEN.test(normalize(value));
}

/** True when this narrative line is an orphaned decision token. */
export function isDecisionLine(line: string): boolean {
  const trimmed = normalize(line);
  if (!trimmed) return false;
  return DECISION_TOKEN.test(trimmed);
}

/**
 * Remove orphaned decision tokens from narrative text, collapsing the blank
 * space they leave behind. Meaningful wording is never touched.
 */
export function stripDecisionLines(text: string): string {
  if (!text) return text;
  const kept = text.split("\n").filter((line) => !isDecisionLine(line));
  return kept
    .filter((line, index, all) => !(line.trim() === "" && (all[index - 1] ?? "").trim() === ""))
    .join("\n")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Legacy artifact scrubbing                                           */
/* ------------------------------------------------------------------ */

function fingerprint(line: string): string {
  return normalize(line)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

const NOTE_PREFIX = /^(note|nota)\s*:\s*/i;

/**
 * Remove everything that is not construction prose from a persisted narrative:
 *
 *  - bare decision statuses (Approved / Accepted / Removed, EN + ES)
 *  - orphan raw answer fragments ("Hardwood.", "Through the wall.") — matched
 *    exactly against the durable answer map so real scope lines are never hit
 *  - `Note:` lines that merely restate wording already present in the scope
 *
 * Answers themselves are untouched: they stay canonical and drive the
 * translated statements plus the Decision History surface.
 */
export function stripScopeArtifacts(
  text: string,
  rawAnswerFragments?: ReadonlySet<string>,
): string {
  if (!text) return text;
  const lines = text.split("\n");
  const bodyPrints = new Set(
    lines.filter((l) => !NOTE_PREFIX.test(l.trim())).map(fingerprint).filter(Boolean),
  );
  const keptNotes = new Set<string>();

  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (isDecisionLine(trimmed)) return false;

    const print = fingerprint(trimmed);
    if (rawAnswerFragments?.has(print)) return false;

    if (NOTE_PREFIX.test(trimmed)) {
      const body = fingerprint(trimmed.replace(NOTE_PREFIX, ""));
      if (!body) return false;
      if (keptNotes.has(body)) return false;
      /* Dropped when an ordinary scope line already says the same thing. */
      if ([...bodyPrints].some((p) => p.includes(body))) return false;
      keptNotes.add(body);
    }
    return true;
  });

  return kept
    .filter((line, index, all) => !(line.trim() === "" && (all[index - 1] ?? "").trim() === ""))
    .join("\n")
    .trim();
}

export interface DecisionSummary {
  accepted: number;
  removed: number;
  total: number;
}

/** Counts for the secondary history surface — never injected into the scope. */
export function summarizeDecisions(
  answers: Record<string, string> | null | undefined,
): DecisionSummary {
  let accepted = 0;
  let removed = 0;
  for (const [key, value] of Object.entries(answers ?? {})) {
    if (!key.startsWith("review.")) continue;
    if (value === "accepted") accepted += 1;
    else if (value === "removed") removed += 1;
  }
  return { accepted, removed, total: accepted + removed };
}
