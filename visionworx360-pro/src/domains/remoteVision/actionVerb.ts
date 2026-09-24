/**
 * Action-verb resolution.
 *
 * A lexicon rule carries a default verb for the trade, not for the job. When a
 * contractor says "add a bank of cabinets on the back wall", pricing and the
 * scope of work must say ADD/INSTALL — never REPLACE, which implies demolition
 * and disposal nobody quoted. The contractor's own wording always wins; the
 * rule default is only the fallback when the sentence states no action.
 */

type Verb = "install" | "replace" | "remove" | "repair" | "modify" | "paint" | "build";

interface VerbRule {
  verb: Verb;
  match: RegExp;
}

/** Ordered: the first rule that matches the sentence wins. */
const VERB_RULES: VerbRule[] = [
  // "tear out and replace", "rip out the old ... and install new" — a swap.
  {
    verb: "replace",
    match:
      /\b(replace|replacing|replacement|swap(ped|ping)?\s+out|reemplaz\w+|sustitu\w+)\b|\b(tear|rip|take|pull)\s+out\b[^.]*\b(and|then)\b[^.]*\b(new|install)\b/i,
  },
  { verb: "paint", match: /\b(paint(ing)?|repaint|refinish|pintar|repintar)\b/i },
  { verb: "modify", match: /\b(move|moving|relocat\w+|reroute|mover|reubicar)\b/i },
  { verb: "repair", match: /\b(repair|patch|fix)\b|\b(reparar|arreglar)\b/i },
  {
    verb: "remove",
    match: /\b(remove|removal|demo|demolish|demolition|tear\s+out|rip\s+out|quitar|demoler)\b/i,
  },
  { verb: "build", match: /\b(build|framing|frame|construct|construir)\b/i },
  {
    verb: "install",
    match:
      /\b(add|adding|install\w*|new|put\s+in|hang|agregar|añadir|instalar|nuevo|nueva)\b/i,
  },
];

/**
 * The verb the contractor actually used for this feature's sentence, falling
 * back to the lexicon default when the sentence is descriptive rather than
 * instructional.
 */
export function resolveActionKey(sentence: string, ruleDefault: string): string {
  const text = sentence ?? "";
  if (!text.trim()) return ruleDefault;
  for (const rule of VERB_RULES) {
    if (rule.match.test(text)) return rule.verb;
  }
  return ruleDefault;
}
