import { parseLengthToFeet } from "@/domains/measurement";
import type { ZoneGeometry } from "./types";

/**
 * Trade-agnostic geometry extraction and derivation.
 *
 * "12x16 deck", "the room is 12 by 14 with 8 foot ceilings", "1,500 sq ft
 * roof" — all of them become the same `ZoneGeometry`, and every trade formula
 * (floor area, wall area, perimeter, roof area, volume) reads from it. No
 * trade re-parses the transcript for its own numbers.
 */

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const UNIT = String.raw`(?:\s*(?:'|ft\.?|feet|foot|"|in\.?|inch(?:es)?))?`;

/** `12x16`, `12 x 16`, `12 by 16`, `12' x 16'`, and the 3-number room form. */
const DIMENSION = new RegExp(
  `${NUM}${UNIT}\\s*(?:x|by|×)\\s*${NUM}${UNIT}(?:\\s*(?:x|by|×)\\s*${NUM}${UNIT})?`,
  "gi",
);

/** `192 sq ft`, `1,500 square feet`, `18 SF`. */
const STATED_AREA = /(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*(?:ft|feet)|square\s*(?:ft|feet|foot)|sf)\b/gi;

/** `8 foot ceilings`, `ceiling height 9 ft`, `9' ceilings`. */
const CEILING_HEIGHT =
  /(?:(\d+(?:\.\d+)?)\s*(?:'|ft\.?|feet|foot)[- ]?(?:tall\s+)?ceilings?)|(?:ceilings?\s*(?:height\s*)?(?:is|are|at|of)?\s*(\d+(?:\.\d+)?)\s*(?:'|ft\.?|feet|foot))/gi;

const ZONE_NOUNS: Array<{ key: string; label: string; match: RegExp }> = [
  { key: "kitchen", label: "Kitchen", match: /kitchen/i },
  { key: "bathroom", label: "Bathroom", match: /bath(?:room)?|powder room/i },
  { key: "bedroom", label: "Bedroom", match: /bedroom|primary suite|master/i },
  { key: "living_room", label: "Living room", match: /living room|family room|great room/i },
  { key: "dining_room", label: "Dining room", match: /dining room|dining/i },
  { key: "basement", label: "Basement", match: /basement|lower level/i },
  { key: "garage", label: "Garage", match: /garage/i },
  { key: "deck", label: "Deck", match: /deck|porch|patio/i },
  { key: "footprint", label: "House footprint", match: /footprint|house/i },
  { key: "roof", label: "Roof", match: /roof/i },
  { key: "hallway", label: "Hallway", match: /hallway|hall|corridor/i },
  { key: "office", label: "Office", match: /office|den|study/i },
  { key: "laundry", label: "Laundry", match: /laundry|mud ?room/i },
  { key: "closet", label: "Closet", match: /closet/i },
  { key: "room", label: "Room", match: /\broom\b/i },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

function feetFromToken(value: string, raw: string): number {
  const parsed = parseLengthToFeet(raw.trim());
  if (parsed !== null && parsed > 0) return round2(parsed);
  return round2(Number(value));
}

/** The zone noun nearest to `index`, preferring the words just before it. */
function zoneAt(text: string, index: number): { key: string; label: string; named: boolean } {
  const before = text.slice(Math.max(0, index - 60), index).toLowerCase();
  const after = text.slice(index, Math.min(text.length, index + 40)).toLowerCase();

  let best: { key: string; label: string; distance: number } | null = null;
  for (const noun of ZONE_NOUNS) {
    let distance: number | null = null;
    const beforeHits = [...before.matchAll(new RegExp(noun.match.source, "gi"))];
    if (beforeHits.length) {
      distance = before.length - (beforeHits[beforeHits.length - 1].index ?? 0);
    } else {
      const ahead = after.search(new RegExp(noun.match.source, "i"));
      if (ahead !== -1) distance = ahead + before.length;
    }
    if (distance === null) continue;
    if (!best || distance < best.distance) best = { ...noun, distance };
  }
  return best
    ? { key: best.key, label: best.label, named: true }
    : { key: "area", label: "Work area", named: false };
}

/**
 * Smallest side a room/zone can plausibly have. Anything smaller is a COMPONENT
 * dimension, not geometry to price a room from.
 */
export const MIN_ZONE_DIMENSION_FT = 3;

/** Largest side a bare, unnamed, unitless pair may have before it is nominal lumber. */
const NOMINAL_LUMBER_MAX = 12;

/**
 * Rule 9: component dimensions are never room geometry.
 *
 * `1x6` fascia, `1x2` shadow board, `1x4` lumber, a `4x8` sheet of plywood and
 * a `19 inches by 42 inches` access door are all components. A pair only
 * becomes a zone when it is room-scale AND either carries a foot/inch unit or
 * sits next to a room noun the contractor named.
 */
function isRoomScaleDimension(
  widthFt: number,
  lengthFt: number,
  raw: string,
  named: boolean,
): boolean {
  if (!(widthFt >= MIN_ZONE_DIMENSION_FT && lengthFt >= MIN_ZONE_DIMENSION_FT)) return false;
  const hasUnit = /['"]|\bft\b|\bfeet\b|\bfoot\b|\binch(es)?\b|\bin\.?\b/i.test(raw);
  if (hasUnit || named) return true;
  /* Bare "1x6" / "4x8" style pairs with no room noun are stock material sizes. */
  return !(widthFt <= NOMINAL_LUMBER_MAX && lengthFt <= NOMINAL_LUMBER_MAX);
}

/**
 * Words that prove a SECOND physical instance of the same feature, e.g.
 * "the second 12x12 bedroom", "another 14x16 deck", "two 10x10 sheds".
 * Without one of these, a repeated identical dimension for the same zone noun
 * is the contractor re-describing the SAME feature, not a new one.
 */
const SECOND_INSTANCE_MARKER =
  /\b(second|2nd|third|3rd|another|other|additional|each|both|two|three|four|upper|lower|front|rear|back|side|left|right|north|south|east|west)\b/i;

/** Wording that means the repeat is the SAME feature being rebuilt in place. */
const REPLACEMENT_CONTEXT =
  /\b(re-?build(s|ing)?|rebuilt|re-?construct(s|ing)?|same\s+(spot|place|location|footprint|size)|in\s+its\s+place|instead|to\s+recap|replace(s|d|ment)?)\b/i;

/**
 * Repeated mentions of one feature must not multiply its area.
 *
 * "Rebuild the 14x16 deck ... rebuild the 14x16 deck framing" is ONE 224 sq ft
 * deck. A duplicate is collapsed unless the words right before the repeat name
 * a distinct instance.
 */
function isRepeatOfSameFeature(
  zones: ZoneGeometry[],
  candidate: ZoneGeometry,
  source: string,
  index: number,
): boolean {
  const twin = zones.find(
    (z) =>
      z.key === candidate.key &&
      z.widthFt === candidate.widthFt &&
      z.lengthFt === candidate.lengthFt &&
      z.areaSf === candidate.areaSf,
  );
  if (!twin) return false;
  const before = source.slice(Math.max(0, index - 40), index);
  if (!SECOND_INSTANCE_MARKER.test(before)) return true;
  /* A fresh construction verb right before the instance word means a genuinely
     additional feature ("...and build another 14x16 deck out back"). */
  if (/\b(build|builds|building|add|adding|install\w*|put\s+in|construct\w*|pour|frame|framing)\b/i.test(before)) {
    return false;
  }
  /* Otherwise "another 10 by 14 deck ... in the same spot" is the SAME deck
     being rebuilt: replacement language beats the bare instance word. */
  const around = source.slice(Math.max(0, index - 120), index + 160);
  return REPLACEMENT_CONTEXT.test(around);
}

/**
 * Every zone the contractor gave geometry for.
 *
 * A dimension pair is an area source (`12x16`); a triple adds the ceiling
 * height (`12x14x8`). A stated area with no pair still produces a zone so a
 * trade can price from it.
 */
export function extractZones(text: string | null | undefined): ZoneGeometry[] {
  const source = (text ?? "").trim();
  if (!source) return [];
  const zones: ZoneGeometry[] = [];
  const claimed: Array<[number, number]> = [];



  for (const m of source.matchAll(DIMENSION)) {
    const index = m.index ?? 0;
    claimed.push([index, index + m[0].length]);
    const a = feetFromToken(m[1], m[0].split(/x|by|×/i)[0] ?? m[1]);
    const b = feetFromToken(m[2], m[0].split(/x|by|×/i)[1] ?? m[2]);
    const c = m[3] ? Number(m[3]) : null;
    if (!(a > 0 && b > 0)) continue;
    const zone = zoneAt(source, index);
    if (!isRoomScaleDimension(a, b, m[0], zone.named)) continue;
    const candidate: ZoneGeometry = {
      id: `zone:${zones.length}:${zone.key}`,
      key: zone.key,
      label: zone.label,
      widthFt: a,
      lengthFt: b,
      heightFt: c && c > 0 ? c : null,
      areaSf: round2(a * b),
      perimeterLf: round2(2 * (a + b)),
      evidence: m[0].trim(),
      source: "spoken_measurement",
    };
    if (isRepeatOfSameFeature(zones, candidate, source, index)) continue;
    zones.push(candidate);
  }



  for (const m of source.matchAll(STATED_AREA)) {
    const index = m.index ?? 0;
    if (claimed.some(([s, e]) => index < e && index + m[0].length > s)) continue;
    const areaSf = Number(m[1].replace(/,/g, ""));
    if (!(areaSf > 0)) continue;
    const zone = zoneAt(source, index);
    const candidate: ZoneGeometry = {
      id: `zone:${zones.length}:${zone.key}`,
      key: zone.key,
      label: zone.label,
      widthFt: null,
      lengthFt: null,
      heightFt: null,
      areaSf: round2(areaSf),
      // A stated area alone cannot produce a perimeter; assuming a square
      // would be inventing geometry.
      perimeterLf: null,
      evidence: m[0].trim(),
      source: "spoken_measurement",
    };
    if (isRepeatOfSameFeature(zones, candidate, source, index)) continue;
    zones.push(candidate);
  }


  /* A stated ceiling height applies to the zone it was said in. */
  for (const m of source.matchAll(CEILING_HEIGHT)) {
    const height = Number(m[1] ?? m[2]);
    if (!(height > 0)) continue;
    const index = m.index ?? 0;
    const zone = zoneAt(source, index);
    const target =
      zones.find((z) => z.key === zone.key && z.heightFt === null) ??
      zones.find((z) => z.heightFt === null);
    if (target) target.heightFt = height;
  }

  return zones;
}

/* ---------------------------------------------------------- derivations */

export const DEFAULT_CEILING_HEIGHT_FT = 8;
/** Doors and windows removed from a paintable wall when none were measured. */
export const OPENING_ALLOWANCE_PCT = 0.1;
/** Footprint -> roof area for a common residential pitch (about 6/12). */
export const ROOF_PITCH_FACTOR = 1.3;

export function floorArea(zone: ZoneGeometry): number | null {
  return zone.areaSf ?? null;
}

export function perimeter(zone: ZoneGeometry): number | null {
  return zone.perimeterLf ?? null;
}

/**
 * Paintable wall area: perimeter x ceiling height, less an opening allowance.
 * Returns null when the perimeter is unknown — an area alone is not enough.
 */
export function wallArea(
  zone: ZoneGeometry,
  options: { openingAllowancePct?: number; fallbackHeightFt?: number } = {},
): { areaSf: number; heightFt: number; heightAssumed: boolean; allowancePct: number } | null {
  const p = perimeter(zone);
  if (p === null) return null;
  const allowancePct = options.openingAllowancePct ?? OPENING_ALLOWANCE_PCT;
  const heightAssumed = zone.heightFt === null;
  const heightFt = zone.heightFt ?? options.fallbackHeightFt ?? DEFAULT_CEILING_HEIGHT_FT;
  const gross = p * heightFt;
  return {
    areaSf: round2(gross * (1 - allowancePct)),
    heightFt,
    heightAssumed,
    allowancePct,
  };
}

/** Roof area from a stated roof area, or derived from the house footprint. */
export function roofArea(zone: ZoneGeometry): { areaSf: number; derived: boolean } | null {
  const area = zone.areaSf;
  if (area === null) return null;
  // A stated ROOF area is already the sloped area; a footprint is not.
  if (zone.key === "roof") return { areaSf: area, derived: false };
  return { areaSf: round2(area * ROOF_PITCH_FACTOR), derived: true };
}

export function volumeCubicYards(areaSf: number, depthInches: number): number {
  return round2((areaSf * (depthInches / 12)) / 27);
}

/** Waste is a PRICING factor. It never changes the measured quantity. */
export function withWaste(quantity: number, wastePct: number): number {
  return round2(quantity * (1 + wastePct));
}
