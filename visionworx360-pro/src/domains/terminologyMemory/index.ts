/**
 * CONTRACTOR TERMINOLOGY MEMORY — pure matching.
 *
 * When the app rewrites a contractor's words into vocabulary he never used
 * ("vinyl trim around the deck edge" -> "baseboard and casing trim"), he
 * corrects it once. That correction becomes a standing rule for his company,
 * and every later interpretation consults this memory BEFORE inventing its own
 * wording or picking a book category.
 *
 * Everything here is pure and deterministic: no I/O, no model call, no pricing.
 * A correction can only change WORDING and the interior/exterior CONTEXT of a
 * term. It can never create scope, change a quantity, or set a price.
 *
 * Over-application is the real risk with a memory like this, so a correction
 * only fires when ALL of the following agree:
 *  1. the wrong term the app produced matches the stored wrong term;
 *  2. the context (interior / exterior / any) is compatible;
 *  3. the trade, when the correction names one, is compatible;
 *  4. the trigger phrase, when the correction names one, is present in the
 *     contractor's own narration for THIS project.
 * The most specific surviving correction wins — never the newest.
 */

export const CORRECTION_CONTEXTS = ["any", "interior", "exterior"] as const;
export type CorrectionContext = (typeof CORRECTION_CONTEXTS)[number];

export const CORRECTION_CAPTURE_METHODS = [
  "explicit_correction",
  "scope_text_edit",
  "book_match_correction",
] as const;
export type CorrectionCaptureMethod = (typeof CORRECTION_CAPTURE_METHODS)[number];

export interface TerminologyCorrection {
  id: string;
  /** The wording the app produced that the contractor rejected. */
  wrongTerm: string;
  /** The wording he wants instead — his own words. */
  correctedTerm: string;
  /** Optional narration phrase that must be present for this to apply. */
  triggerPhrase: string | null;
  contextScope: CorrectionContext;
  tradeKey: string | null;
  captureMethod: CorrectionCaptureMethod;
  isActive: boolean;
}

export interface TerminologyLookup {
  /** The wording the app is about to show or match on. */
  candidateTerm: string;
  /** The contractor's own narration for the current project, when available. */
  narration?: string | null;
  context?: CorrectionContext;
  tradeKey?: string | null;
}

export interface TerminologyMatch {
  correction: TerminologyCorrection;
  correctedTerm: string;
  /** Why it applied — surfaced in the audit trail, never hidden. */
  reason: string;
  /** Higher wins: trigger phrase + trade + explicit context is most specific. */
  specificity: number;
}

export function normalizeTerm(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Interior and exterior corrections must never leak into each other. */
function contextCompatible(
  correction: CorrectionContext,
  asked: CorrectionContext | undefined,
): boolean {
  if (correction === "any") return true;
  if (!asked || asked === "any") return false; // a scoped rule needs a known context
  return correction === asked;
}

function tradeCompatible(correction: string | null, asked: string | null | undefined): boolean {
  if (!correction) return true;
  if (!asked) return false;
  return normalizeTerm(correction) === normalizeTerm(asked);
}

function termMatches(wrongTerm: string, candidate: string): boolean {
  const wrong = normalizeTerm(wrongTerm);
  const cand = normalizeTerm(candidate);
  if (!wrong || !cand) return false;
  if (wrong === cand) return true;
  /* Book descriptions and scope titles wrap the wrong term in extra words
     ("Install baseboard and casing trim (approximately 48 linear feet)"). */
  return cand.includes(wrong);
}

function triggerPresent(phrase: string | null, narration: string | null | undefined): boolean {
  if (!phrase) return true;
  const needle = normalizeTerm(phrase);
  if (!needle) return true;
  return normalizeTerm(narration).includes(needle);
}

/**
 * The correction that applies to this term, or null. Pure — the caller decides
 * whether to use it, and remains free to keep the contractor's own override.
 */
export function findTerminologyCorrection(
  corrections: readonly TerminologyCorrection[],
  lookup: TerminologyLookup,
): TerminologyMatch | null {
  const matches: TerminologyMatch[] = [];

  for (const correction of corrections) {
    if (!correction.isActive) continue;
    if (!termMatches(correction.wrongTerm, lookup.candidateTerm)) continue;
    if (!contextCompatible(correction.contextScope, lookup.context)) continue;
    if (!tradeCompatible(correction.tradeKey, lookup.tradeKey)) continue;
    if (!triggerPresent(correction.triggerPhrase, lookup.narration)) continue;

    const specificity =
      (correction.triggerPhrase ? 4 : 0) +
      (correction.tradeKey ? 2 : 0) +
      (correction.contextScope === "any" ? 0 : 1);

    const why = [
      `you corrected "${correction.wrongTerm}" to "${correction.correctedTerm}"`,
      correction.contextScope === "any" ? null : `for ${correction.contextScope} work`,
      correction.tradeKey ? `in ${correction.tradeKey}` : null,
      correction.triggerPhrase ? `when you say "${correction.triggerPhrase}"` : null,
    ]
      .filter(Boolean)
      .join(" ");

    matches.push({
      correction,
      correctedTerm: correction.correctedTerm,
      reason: `Applied your saved correction: ${why}.`,
      specificity,
    });
  }

  if (matches.length === 0) return null;
  matches.sort((a, b) => b.specificity - a.specificity);
  return matches[0]!;
}

/**
 * Rewrites a term through the memory. Returns the original term untouched when
 * no correction applies — this is a filter, never a generator.
 */
export function applyTerminologyMemory(
  corrections: readonly TerminologyCorrection[],
  lookup: TerminologyLookup,
): { term: string; match: TerminologyMatch | null } {
  const match = findTerminologyCorrection(corrections, lookup);
  if (!match) return { term: lookup.candidateTerm, match: null };
  const wrong = normalizeTerm(match.correction.wrongTerm);
  const cand = normalizeTerm(lookup.candidateTerm);
  /* Exact hit: replace outright. Embedded hit: swap the wrong words in place so
     the rest of his sentence survives. */
  if (wrong === cand) return { term: match.correctedTerm, match };
  const pattern = new RegExp(
    match.correction.wrongTerm.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"),
    "ig",
  );
  const rewritten = lookup.candidateTerm.replace(pattern, match.correctedTerm);
  return { term: rewritten, match };
}

/** Infers the envelope context from wording, for capture and lookup. */
const EXTERIOR_WORDS =
  /\b(exterior|outdoor|outside|deck|porch|patio|fascia|soffit|siding|roof|gutter|vinyl|pvc|azek|composite|hardie|fiber ?cement)\b/i;
const INTERIOR_WORDS =
  /\b(interior|indoor|baseboard|casing|crown|wainscot|closet|drywall|ceiling|bedroom|bathroom|kitchen)\b/i;

export function inferCorrectionContext(text: string | null | undefined): CorrectionContext {
  const value = String(text ?? "");
  const exterior = EXTERIOR_WORDS.test(value);
  const interior = INTERIOR_WORDS.test(value);
  if (exterior && !interior) return "exterior";
  if (interior && !exterior) return "interior";
  return "any";
}

/**
 * Guards a proposed correction before it is stored. A bad standing rule is
 * worse than no rule at all, so nonsense and self-referential entries are
 * refused rather than saved and quietly applied everywhere.
 */
export function validateProposedCorrection(input: {
  wrongTerm: string;
  correctedTerm: string;
}): { ok: true } | { ok: false; reason: string } {
  const wrong = normalizeTerm(input.wrongTerm);
  const right = normalizeTerm(input.correctedTerm);
  if (wrong.length < 3) return { ok: false, reason: "The wrong wording is too short to match on." };
  if (right.length < 2) return { ok: false, reason: "Enter the wording you want instead." };
  if (wrong === right) return { ok: false, reason: "The two wordings are the same." };
  if (right.includes(wrong)) {
    return { ok: false, reason: "The corrected wording still contains the wrong wording." };
  }
  return { ok: true };
}
