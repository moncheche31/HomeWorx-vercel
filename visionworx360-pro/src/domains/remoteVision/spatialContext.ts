/**
 * SPATIAL CONTEXT IS NOT SCOPE.
 *
 * "removing those closets ... on the backside of that range hood" is a
 * LOCATION. The old lexicon matched the bare noun "hood" and generated
 * `appliances.install` — four appliances the contractor never sold.
 *
 * Rather than special-casing one phrase, this module strips locating
 * prepositional phrases from a sentence before the work lexicon is matched
 * against it. Anything that only survives inside a locating phrase is context,
 * not work. The original sentence is still what gets stored as evidence and
 * still what quantities are read from.
 *
 * Pure module: no React, no IO.
 */

/** Prepositions that locate work relative to something else. */
const LOCATORS = [
  "behind",
  "back ?side of",
  "backside of",
  "in back of",
  "in front of",
  "next to",
  "beside",
  "alongside",
  "adjacent to",
  "near",
  "nearest",
  "across from",
  "opposite",
  "above",
  "over",
  "below",
  "beneath",
  "underneath",
  "under",
  "between",
  /* Spanish */
  "detr[aá]s de",
  "al lado de",
  "junto a",
  "frente a",
  "arriba de",
  "debajo de",
  "cerca de",
  "entre",
];

/**
 * `<locator> [the|that|this|those|these|a|an|los|las|el|la] <up to 4 words>`
 * Bounded on purpose: it removes "behind the range hood", never the rest of
 * the sentence.
 */
const LOCATING_PHRASE = new RegExp(
  `\\b(?:${LOCATORS.join("|")})\\s+(?:the|that|this|those|these|a|an|el|la|los|las|un|una)?\\s*(?:[a-zá-ú][\\w'-]*\\s*){1,4}`,
  "gi",
);

/**
 * Remove locating phrases so lexicon matching sees only the work itself.
 * Used for MATCHING ONLY — evidence and quantities read the original text.
 */
export function stripSpatialContext(sentence: string): string {
  if (!sentence) return sentence;
  const stripped = sentence.replace(LOCATING_PHRASE, " ");
  /* Never strip a sentence down to nothing — that would hide real work. */
  return stripped.trim().length >= 3 ? stripped : sentence;
}

/**
 * True when a rule only matches because of a locating phrase, i.e. the noun it
 * keyed on is context. Used to reject inferred work like "install appliances"
 * from "the wall behind the refrigerator".
 */
export function isSpatialContextOnly(sentence: string, match: RegExp): boolean {
  if (!match.test(sentence)) return false;
  return !match.test(stripSpatialContext(sentence));
}
