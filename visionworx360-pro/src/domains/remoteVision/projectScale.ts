/**
 * PROJECT SCALE INFERENCE.
 *
 * Root cause this module removes: every unmeasured quantity fell back to ONE
 * set of small interior allowances (120 SF, 8 LF), so a whole-house re-roof was
 * priced as 120 SF of roofing and whole-house fascia as 8 LF of trim.
 *
 * An estimator looking at a jobsite photo does not do that. He anchors scale
 * off objects whose size is effectively standard — a garage door is 16' wide
 * for two cars, an entry door 3' x 7', a car about 6' x 15' — and works out a
 * defensible whole-building number. This module encodes that reasoning.
 *
 * Everything produced here is an ASSUMPTION. Callers must keep the existing
 * `ballpark_allowance` / `needsReview` treatment: a scale-derived quantity is
 * never presented as a confirmed measurement.
 *
 * Bias: deliberately toward the HIGH end of the normal band. It is easier to
 * negotiate a ballpark down than to ask a client for more money later.
 *
 * Pure module: no React, no IO, no i18n.
 */

import type { FallbackUnitFamily } from "@/domains/estimating/genericTradeFallback";

/** How much of a building one line of work covers. */
export type ScaleTier =
  /** One component / one wall / one feature inside a room. */
  | "component"
  /** One whole room. */
  | "room"
  /** The whole building envelope or the whole lot. */
  | "structure";

export interface StructureScale {
  /** Ground-floor footprint in SF. */
  footprintSf: number;
  stories: number;
  /** Exterior wall perimeter in LF (also fascia / gutter run). */
  perimeterLf: number;
  /** Roof surface in SF, including pitch and overhang. */
  roofSf: number;
  /** Exterior wall (siding / exterior paint) area in SF. */
  wallSf: number;
  /** Landscaped ground area in SF. */
  lotSf: number;
  /** Where the size came from — always disclosed with the number. */
  basis: "stated_area" | "photo_reference" | "default_average";
  /** Human-readable justification for the assumption. */
  note: string;
}

/**
 * Standard-object anchors used to eyeball a building from a photo.
 * Sizes are nominal US residential dimensions.
 */
export const EXTERIOR_SCALE_ANCHORS = {
  /** Single garage door: 9' wide x 7' tall. */
  singleGarageDoorFt: 9,
  /** Double (two-car) garage door: 16' wide x 7' tall. */
  doubleGarageDoorFt: 16,
  /** Standard entry door: 3' wide x 7' tall. */
  entryDoorFt: 3,
  /** A passenger car: about 6' wide x 15' long. */
  carLengthFt: 15,
  /** Floor-to-floor height used to turn perimeter into wall area. */
  storyHeightFt: 10,
} as const;

/** Whole-structure defaults when nothing at all is known (biased high). */
export const DEFAULT_STRUCTURE = {
  /** Average conditioned area of a US single-family home. */
  livingAreaSf: 1800,
  stories: 1,
  /** Pitch + overhang multiplier applied to footprint to get roof area. */
  roofPitchFactor: 1.25,
  /** Perimeter is longer than a perfect square: houses have wings and bays. */
  perimeterIrregularity: 1.05,
  /** Landscaped ground relative to footprint. */
  lotFactor: 1.5,
} as const;

const round = (n: number) => Math.round(n);

/** Build the derived envelope numbers from a footprint + story count. */
export function structureFromFootprint(
  footprintSf: number,
  stories: number,
  basis: StructureScale["basis"],
  note: string,
): StructureScale {
  const footprint = Math.max(400, Math.round(footprintSf));
  const levels = Math.max(1, Math.round(stories));
  const perimeterLf = round(
    4 * Math.sqrt(footprint) * DEFAULT_STRUCTURE.perimeterIrregularity,
  );
  return {
    footprintSf: footprint,
    stories: levels,
    perimeterLf,
    roofSf: round(footprint * DEFAULT_STRUCTURE.roofPitchFactor),
    wallSf: round(perimeterLf * EXTERIOR_SCALE_ANCHORS.storyHeightFt * levels),
    lotSf: round(footprint * DEFAULT_STRUCTURE.lotFactor),
    basis,
    note,
  };
}

export interface ScaleEvidence {
  /** Everything the contractor said or typed about the project. */
  text?: string | null;
  /** Labels of objects seen in project photos (visual observations). */
  observations?: readonly string[];
}

const STATED_AREA =
  /\b([\d][\d,]{2,6})\s*(?:sq\.?\s?ft\.?|square\s+(?:feet|foot)|sf)\b/i;

const STORIES: Array<[RegExp, number]> = [
  [/\b(three|3)[-\s]?stor(y|ies|ey)\b/i, 3],
  [/\b(two|2)[-\s]?stor(y|ies|ey)\b|\bsecond floor\b|\bupstairs\b/i, 2],
  [/\b(one|1|single)[-\s]?stor(y|ies|ey)\b|\branch\b/i, 1],
];

const DOUBLE_GARAGE = /\b(two|2|double)[-\s]?car\s+garage\b|\bdouble\s+garage\b/i;
const SINGLE_GARAGE = /\bgarage\b/i;

/**
 * Approximate street frontage anchored off a garage door seen in a photo or
 * named by the contractor. A two-car garage occupies roughly a third of a
 * typical facade; a one-car garage roughly a quarter.
 */
function frontageFromAnchors(haystack: string): { frontageFt: number; note: string } | null {
  if (DOUBLE_GARAGE.test(haystack)) {
    return {
      frontageFt: EXTERIOR_SCALE_ANCHORS.doubleGarageDoorFt * 2.8,
      note: "Sized from a two-car garage door (16 ft) visible as a scale reference.",
    };
  }
  if (SINGLE_GARAGE.test(haystack)) {
    return {
      frontageFt: EXTERIOR_SCALE_ANCHORS.singleGarageDoorFt * 3.5,
      note: "Sized from a single garage door (9 ft) visible as a scale reference.",
    };
  }
  return null;
}

/** Typical front-to-back depth of a single-family home. */
const TYPICAL_DEPTH_FT = 32;

/**
 * The whole-building scale to use for unmeasured exterior work.
 * Order of authority: stated area > photo/anchor reference > average home.
 */
export function inferStructureScale(evidence: ScaleEvidence = {}): StructureScale {
  const text = evidence.text ?? "";
  const haystack = [text, ...(evidence.observations ?? [])].join(" \n ");

  let stories: number = DEFAULT_STRUCTURE.stories;
  for (const [pattern, value] of STORIES) {
    if (pattern.test(haystack)) {
      stories = value;
      break;
    }
  }

  const stated = haystack.match(STATED_AREA);
  if (stated) {
    const livingSf = Number(stated[1].replace(/,/g, ""));
    if (Number.isFinite(livingSf) && livingSf >= 300) {
      return structureFromFootprint(
        livingSf / stories,
        stories,
        "stated_area",
        `Sized from the stated ${livingSf.toLocaleString()} SF of living area.`,
      );
    }
  }

  const anchor = frontageFromAnchors(haystack);
  if (anchor) {
    return structureFromFootprint(
      anchor.frontageFt * TYPICAL_DEPTH_FT,
      stories,
      "photo_reference",
      anchor.note,
    );
  }

  return structureFromFootprint(
    DEFAULT_STRUCTURE.livingAreaSf / stories,
    stories,
    "default_average",
    "No stated size or photo reference: sized from an average single-family home.",
  );
}

/* ------------------------------------------------------------------ *
 * Which work is whole-structure work
 * ------------------------------------------------------------------ */

/**
 * Feature families whose unmeasured extent is a BUILDING dimension, not a
 * room dimension. A roof, a siding job or a fascia run covers the envelope.
 */
const STRUCTURE_SCALE_FEATURES: Array<{
  match: RegExp;
  /** Which envelope dimension the work is sold by, per unit family. */
  quantity: (scale: StructureScale, family: FallbackUnitFamily) => number | null;
}> = [
  {
    match: /^roofing\./,
    quantity: (s, f) => (f === "area" ? s.roofSf : f === "linear" ? s.perimeterLf : null),
  },
  {
    match: /^siding\./,
    quantity: (s, f) => (f === "area" ? s.wallSf : f === "linear" ? s.perimeterLf : null),
  },
  {
    match: /^fascia\.|^soffit\./,
    quantity: (s, f) => (f === "linear" ? s.perimeterLf : f === "area" ? s.perimeterLf * 2 : null),
  },
  {
    match: /^gutters\./,
    quantity: (s, f) => (f === "linear" ? s.perimeterLf : null),
  },
  {
    match: /^landscaping\./,
    quantity: (s, f) => (f === "area" ? s.lotSf : f === "linear" ? s.perimeterLf : null),
  },
  {
    match: /^paint\.exterior/,
    quantity: (s, f) => (f === "area" ? s.wallSf : f === "linear" ? s.perimeterLf : null),
  },
];

/**
 * Wording that pulls whole-structure work back down to one localized area.
 * "the front fascia" or "one side of siding" is not the whole envelope.
 */
const LOCALIZED_WORDING =
  /\b(front|back|rear|one side|a section|section of|a piece of|corner|above the (garage|porch|door)|porch ceiling|only the)\b/i;

/** Fraction of the envelope a localized mention covers. */
export const LOCALIZED_ENVELOPE_FRACTION = 0.35;

export interface ScaleAllowanceContext {
  scale?: StructureScale | null;
  /** The contractor's own wording for this item. */
  wording?: string | null;
}

export interface ScaleAllowance {
  quantity: number;
  tier: ScaleTier;
  /** Why this number: passed through to the contractor as disclosure. */
  note: string;
}

/**
 * The whole-building allowance for a size-less exterior line, or null when the
 * feature is not envelope work (interior allowances then apply as before).
 */
export function structureScaleAllowance(
  featureKey: string,
  unitFamilyKey: FallbackUnitFamily,
  context: ScaleAllowanceContext = {},
): ScaleAllowance | null {
  const rule = STRUCTURE_SCALE_FEATURES.find((r) => r.match.test(featureKey));
  if (!rule) return null;
  const scale = context.scale ?? inferStructureScale();
  const base = rule.quantity(scale, unitFamilyKey);
  if (base == null || !Number.isFinite(base) || base <= 0) return null;

  const localized = LOCALIZED_WORDING.test(context.wording ?? "");
  const quantity = Math.round(localized ? base * LOCALIZED_ENVELOPE_FRACTION : base);
  if (quantity <= 0) return null;

  return {
    quantity,
    tier: localized ? "component" : "structure",
    note: localized
      ? `Assumed a localized portion of the building envelope. ${scale.note}`
      : scale.note,
  };
}
