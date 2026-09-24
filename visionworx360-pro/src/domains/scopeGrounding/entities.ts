/**
 * Context-aware entity disambiguation.
 *
 * A keyword is not a scope item. "glass doors" on a cabinet is cabinetry;
 * "floor level" is a height reference, not flooring work; "a couple pieces of
 * baseboard" is incidental trim removal, not a room demolition.
 */

export interface EntityVerdict {
  /** Can this keyword hit become priced scope at all? */
  admit: boolean;
  /** Why it was rejected (internal trace + contractor-facing observation). */
  reason: string;
  /** When rejected but worth surfacing, a concise question to ask instead. */
  question?: string;
}

const ADMIT: EntityVerdict = { admit: true, reason: "explicitly stated" };

/** Words that make a "door" mention a cabinet component, not an opening. */
const CABINET_DOOR_CONTEXT =
  /\b(cabinet|cabinets|cabinetry|upper|uppers|base|bread\s?box|wine|glass|raised[- ]panel|slab|shaker|drawer|door style|pantry)\b/i;

/** An architectural door needs an action AND an opening context. */
const ARCHITECTURAL_DOOR_CONTEXT =
  /\b(interior|exterior|entry|entrance|bedroom|closet|patio|slider|sliding|french|pocket|barn|garage|prehung|pre-hung|jamb|casing|swing|doorway|door opening)\b/i;

const DOOR_ACTION =
  /\b(install|replace|hang|add|new|remove|swap|order|change out)\b/i;

/** "floor level", "on the floor", "floor plan" are references, not flooring. */
const FLOOR_REFERENCE =
  /\bfloor\s*(level|height|plan|joist|outlet|receptacle|line|space)\b|\b(from|at|near|above|below|off)\s+(the\s+)?floor\b/i;

const FLOORING_ACTION =
  /\b(replace|install|new|lay|refinish|remove|demo|rip out|resurface|tear out)\b[^.]{0,40}\b(floor(ing)?|lvp|hardwood|carpet|tile floor)\b|\b(floor(ing)?|lvp|hardwood|carpet)\b[^.]{0,25}\b(replace|install|refinish|new)\b/i;

const COUNTERTOP_WORDS = /\bcounter\s?top(s)?\b|\bencimera/i;

const APPLIANCE_FALSE_FRIENDS =
  /\b(wine cabinet|bread\s?box|microwave shelf|appliance garage)\b/i;

/**
 * An appliance noun used only to locate other work ("the wall behind that
 * range hood") is not appliance scope. Buying/installing appliances needs an
 * actual verb, otherwise the mention is a landmark.
 */
const APPLIANCE_ACTION =
  /\b(install|installing|instal+|set|setting|replace|replacing|new|add|adding|supply|supplying|swap|hook ?up|connect|reconnect|order|purchase|remove|removing|demo)\b/i;


const DEMO_LIMITER =
  /\bno\b[^.]{0,20}\bdemo(lition)?\b|\bminimal demo\b|\bexcept\b[^.]{0,40}\bbaseboard\b/i;

/**
 * Decide whether a lexicon hit in `sentence` is really that entity.
 * `fullText` is used only for sentence-independent context (e.g. the whole
 * note is about cabinets).
 */
export function classifyEntity(
  featureKey: string,
  sentence: string,
  fullText: string,
): EntityVerdict {
  switch (featureKey) {
    case "doors.replace": {
      if (!/\bdoor(s)?\b|\bpuerta/i.test(sentence)) return ADMIT;
      if (CABINET_DOOR_CONTEXT.test(sentence)) {
        return {
          admit: false,
          reason: "cabinet door style, not an architectural door",
        };
      }
      if (!ARCHITECTURAL_DOOR_CONTEXT.test(sentence) || !DOOR_ACTION.test(sentence)) {
        return {
          admit: false,
          reason: "no stated door replacement work",
          question: "Are any room doors included in this job?",
        };
      }
      return ADMIT;
    }

    case "flooring.replace": {
      if (FLOOR_REFERENCE.test(sentence) && !FLOORING_ACTION.test(sentence)) {
        return { admit: false, reason: "\"floor\" used as a height reference, not flooring work" };
      }
      if (COUNTERTOP_WORDS.test(sentence) && !/\bfloor/i.test(sentence)) {
        return { admit: false, reason: "countertop is not flooring" };
      }
      if (!FLOORING_ACTION.test(sentence)) {
        return {
          admit: false,
          reason: "flooring mentioned but no flooring work requested",
          question: "Is any flooring being replaced?",
        };
      }
      return ADMIT;
    }

    case "appliances.install": {
      if (APPLIANCE_FALSE_FRIENDS.test(sentence)) {
        return { admit: false, reason: "cabinet accessory, not an appliance" };
      }
      if (!APPLIANCE_ACTION.test(sentence)) {
        return {
          admit: false,
          reason: "appliance named as a location reference, not appliance work",
          question: "Are any appliances being supplied or installed on this job?",
        };
      }
      return ADMIT;
    }


    case "structural.wall_removal": {
      if (DEMO_LIMITER.test(sentence) || DEMO_LIMITER.test(fullText)) {
        return { admit: false, reason: "contractor stated there is no demolition" };
      }
      return ADMIT;
    }

    case "trim.replace": {
      if (/\bno\b[^.]{0,20}\bdemo/i.test(sentence) || /couple pieces/i.test(sentence)) {
        return { admit: true, reason: "minor baseboard work stated as an exception" };
      }
      return ADMIT;
    }

    default:
      return ADMIT;
  }
}

/** Sentences that exclude work rather than request it. */
export interface NegationVerdict {
  negated: boolean;
  /** Text after "except", which is still in scope. */
  exceptClause: string | null;
}

const NEGATION =
  /^\s*(no|none|not|without|skip|omit)\b|\bno\s+(demo(lition)?|permits?|painting|plumbing|electrical|flooring|doors?)\b|\bnot\s+(included|doing|replacing)\b|\bwithout\b/i;

export function detectNegation(sentence: string): NegationVerdict {
  if (!NEGATION.test(sentence)) return { negated: false, exceptClause: null };
  const except = sentence.match(/\b(?:except|other than|besides|aside from)\b(.*)$/i);
  return { negated: true, exceptClause: except ? except[1].trim() : null };
}

/**
 * "Just cabinet install." / "Only the cabinets." — an explicit scope fence.
 * Returns the limiter phrase, or null.
 */
export function detectScopeFence(text: string): string | null {
  const m = text.match(/\b(just|only|nothing but|strictly)\b\s+([^.!?\n]{3,60})/i);
  return m ? m[0].trim() : null;
}
