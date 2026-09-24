/**
 * Reusable room-count scaling.
 *
 * A catalog default is a PER-ROOM number. "New flooring throughout the house,
 * kitchen and two bathrooms" is not one room of flooring, but nothing in the
 * grounding pipeline used to say so — the single-room default was priced as if
 * it were the whole job.
 *
 * This module is deliberately trade-agnostic: it counts rooms and returns a
 * multiplier plus the evidence for it. Applying the multiplier (and disclosing
 * it) is the caller's job.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10,
};

/** Room nouns worth counting. Kept generic — not tied to the vision lexicon. */
const ROOM_NOUNS: Array<{ key: string; match: RegExp }> = [
  { key: "kitchen", match: /kitchens?|cocinas?/i },
  { key: "bathroom", match: /bath(?:room)?s?|powder rooms?|ba[nñ]os?/i },
  { key: "bedroom", match: /bedrooms?|rec[aá]maras?|dormitorios?/i },
  { key: "living_room", match: /living rooms?|family rooms?|salas?/i },
  { key: "dining_room", match: /dining rooms?|comedores?|comedor/i },
  { key: "hallway", match: /hallways?|corridors?|pasillos?/i },
  { key: "office", match: /offices?|dens?|studys?|oficinas?/i },
  { key: "laundry", match: /laundry rooms?|mud rooms?|lavander[ií]as?/i },
  { key: "basement", match: /basements?|s[oó]tanos?/i },
  { key: "garage", match: /garages?|cocheras?|garajes?/i },
  { key: "closet", match: /closets?|walk-?ins?/i },
];

/** Language that means "this applies to the whole area, not one room". */
const WHOLE_AREA =
  /\b(throughout|all|every|each|entire|whole (?:house|home|floor|unit)|house-?wide|toda la casa|todas? las?|cada)\b/i;

/**
 * The whole-house fallback may ONLY fire on wording that actually refers to the
 * dwelling. "The entire deck" / "all the railings" is one structure, not four
 * rooms — the looser WHOLE_AREA wording alone must never multiply anything.
 */
const WHOLE_DWELLING =
  /\b(throughout(?: the (?:house|home|unit|property))?|whole (?:house|home|floor|unit)|entire (?:house|home|floor|unit)|house-?wide|all (?:the )?rooms|every room|toda la casa)\b/i;

/**
 * A single exterior structure. Scope about one of these is one structure, so
 * room-count scaling is disabled entirely — it has no rooms to scale by.
 */
const EXTERIOR_SINGLE_STRUCTURE =
  /\b(deck|decks|porch|porches|patio|patios|shed|sheds|fence|fencing|railing|railings|driveway|walkway|pergola|gazebo|carport|terraza|porche)\b/i;


/** Never scale beyond a believable residential room count. */
export const MAX_ROOM_MULTIPLIER = 12;

/**
 * "Throughout the house" with no rooms named. Pricing one room would be plainly
 * wrong, so assume a deliberately modest whole-house footprint and disclose it
 * as an assumption for the contractor to correct.
 */
export const WHOLE_HOUSE_MULTIPLIER = 4;

export interface RoomScaling {
  /** Distinct rooms the contractor referred to, counted with quantities. */
  roomCount: number;
  /** Room keys detected, in order of first mention. */
  rooms: string[];
  /** Multiplier to apply to a PER-ROOM catalog default. 1 = do not scale. */
  multiplier: number;
  /** True when the contractor used whole-area language. */
  wholeArea: boolean;
  /** The phrase that justified the multiplier, for provenance. */
  evidence: string | null;
}

const NONE: RoomScaling = {
  roomCount: 0,
  rooms: [],
  multiplier: 1,
  wholeArea: false,
  evidence: null,
};

function countFor(text: string, match: RegExp): { count: number; evidence: string } | null {
  const source = match.source;
  // "(two|2|a couple of) bathrooms"
  const quantified = new RegExp(
    `\\b(\\d{1,2}|${Object.keys(NUMBER_WORDS).join("|")}|a couple(?: of)?|both|ambos|ambas)\\s+(?:${source})\\b`,
    "i",
  );
  const q = text.match(quantified);
  if (q) {
    const raw = q[1].toLowerCase();
    const n = /^\d+$/.test(raw)
      ? Number(raw)
      : raw.startsWith("a couple") || raw === "both" || raw === "ambos" || raw === "ambas"
        ? 2
        : (NUMBER_WORDS[raw] ?? 1);
    return { count: Math.min(Math.max(n, 1), MAX_ROOM_MULTIPLIER), evidence: q[0] };
  }
  const plain = text.match(new RegExp(`\\b(?:${source})\\b`, "i"));
  return plain ? { count: 1, evidence: plain[0] } : null;
}

/**
 * Count the rooms a description covers and decide whether a per-room default
 * should be multiplied.
 *
 * Conservative by design: a single named room never scales, and the result is
 * always a disclosed assumption rather than a measurement.
 */
export function detectRoomScaling(text: string | null | undefined): RoomScaling {
  const source = (text ?? "").trim();
  if (!source) return NONE;

  const rooms: string[] = [];
  const evidences: string[] = [];
  let total = 0;

  for (const noun of ROOM_NOUNS) {
    const hit = countFor(source, noun.match);
    if (!hit) continue;
    rooms.push(noun.key);
    evidences.push(hit.evidence);
    total += hit.count;
  }

  const wholeArea = WHOLE_AREA.test(source);
  const roomCount = Math.min(total, MAX_ROOM_MULTIPLIER);

  /*
   * A single exterior structure (one deck, one fence) has no rooms. "Rebuild
   * the entire deck" must never become a 4x whole-house multiplier.
   */
  if (roomCount <= 1 && EXTERIOR_SINGLE_STRUCTURE.test(source)) {
    return { roomCount, rooms, multiplier: 1, wholeArea, evidence: null };
  }

  /**
   * Whole-DWELLING language with no room named at all ("LVP throughout the
   * house") still covers more than one room, so fall back to the disclosed
   * whole-house assumption rather than silently pricing a single room.
   */
  if (roomCount <= 1 && WHOLE_DWELLING.test(source)) {
    const phrase = source.match(WHOLE_DWELLING)?.[0] ?? null;
    return {
      roomCount: Math.max(roomCount, WHOLE_HOUSE_MULTIPLIER),
      rooms,
      multiplier: WHOLE_HOUSE_MULTIPLIER,
      wholeArea,
      evidence: phrase,
    };
  }


  // More than one distinct room named IS explicit scope; it does not also need
  // whole-area wording to count.
  const shouldScale = roomCount > 1;

  return {
    roomCount,
    rooms,
    multiplier: shouldScale ? roomCount : 1,
    wholeArea,
    evidence: shouldScale ? evidences.join(", ") : null,
  };
}

/** Units that describe an area or a length, and therefore scale per room. */
const SCALABLE_UNITS = new Set(["square_foot", "linear_foot", "square_yard", "cubic_yard"]);

export function unitScalesPerRoom(unitKey: string | null | undefined): boolean {
  return Boolean(unitKey && SCALABLE_UNITS.has(unitKey));
}
