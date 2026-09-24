import type { UnitFamily } from "./types";

/**
 * Unit families and the sanity bounds that go with them.
 *
 * Bounds scale with the size of the project instead of being flat single-room
 * caps: a 4,000 sq ft whole-house remodel and a 60 sq ft powder room cannot
 * share one ceiling.
 */

const UNIT_FAMILY: Record<string, UnitFamily> = {
  square_foot: "area",
  square_yard: "area",
  square: "area",
  roofing_square: "area",
  linear_foot: "length",
  foot: "length",
  each: "count",
  cubic_yard: "volume",
  cubic_foot: "volume",
  room: "room_zone",
  zone: "room_zone",
  opening: "opening",
  device: "circuit_device",
  circuit: "circuit_device",
  fixture: "fixture",
  lump_sum: "assembly",
  hour: "assembly",
  day: "assembly",
  allowance: "assembly",
};

/* ---------------------------------------------- unit conversion policy */

/** Area units expressed in square feet. */
const AREA_TO_SF: Record<string, number> = {
  square_foot: 1,
  square_yard: 9,
  roofing_square: 100,
  square: 100,
};
/** Length units expressed in feet. */
const LENGTH_TO_FT: Record<string, number> = { linear_foot: 1, foot: 1 };
/** Volume units expressed in cubic feet. */
const VOLUME_TO_CF: Record<string, number> = { cubic_yard: 27, cubic_foot: 1 };

const SCALES = [AREA_TO_SF, LENGTH_TO_FT, VOLUME_TO_CF];

/**
 * Convert an exact quantity between units of the same family.
 * Returns null when the units are not convertible — the caller must never
 * silently price square feet as roofing squares.
 */
export function convertBetweenUnits(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  if (fromUnit === toUnit) return quantity;
  for (const scale of SCALES) {
    const from = scale[fromUnit];
    const to = scale[toUnit];
    if (from && to) return Math.round((quantity * from) / to * 10000) / 10000;
  }
  return null;
}

/** How many base units (SF / FT / CF) one unit of `unitKey` represents. */
export function unitScale(unitKey: string): number {
  for (const scale of SCALES) {
    if (scale[unitKey]) return scale[unitKey];
  }
  return 1;
}

export function unitFamily(unitKey: string | null | undefined): UnitFamily {
  if (!unitKey) return "assembly";
  return UNIT_FAMILY[unitKey] ?? "assembly";
}

export function isKnownUnit(unitKey: string): boolean {
  return unitKey in UNIT_FAMILY;
}

/** Every unit key the estimator is allowed to emit. */
export const KNOWN_UNIT_KEYS = Object.keys(UNIT_FAMILY);

/**
 * Rounding rules per family. Pricing may round; geometry never does.
 * Length and area round UP (you buy whole feet and whole boards); counts are
 * whole numbers; volume rounds up to a quarter yard.
 */
export function roundPricingQuantity(quantity: number, family: UnitFamily): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  switch (family) {
    case "length":
      return Math.max(1, Math.ceil(quantity - 1e-6));
    case "area":
      return Math.max(1, Math.ceil(quantity - 1e-6));
    case "count":
    case "opening":
    case "circuit_device":
    case "fixture":
    case "room_zone":
      return Math.max(1, Math.round(quantity));
    case "volume":
      return Math.max(0.25, Math.ceil(quantity * 4 - 1e-6) / 4);
    case "assembly":
      return Math.round(quantity * 100) / 100;
  }
}

/**
 * Plausible ceiling for one line item, given the size of the job.
 *
 * `projectAreaSf` is the largest authoritative area the contractor established
 * (room, footprint, deck). When nothing is known, a conservative residential
 * envelope is used so an obviously absurd number is still caught.
 */
export interface PlausibilityBounds {
  max: number;
  /** Why this ceiling applies, for the finding message. */
  basis: string;
}

const FALLBACK_PROJECT_AREA_SF = 2500;

export function plausibleMax(
  family: UnitFamily,
  projectAreaSf: number | null,
  unitKey?: string,
): PlausibilityBounds {
  /* Bounds are reasoned in base units (SF/FT/CF), then expressed in the
     trade's own unit, so 21 roofing squares is not compared against a
     square-foot ceiling. */
  const scale = unitKey ? unitScale(unitKey) : 1;
  const area = projectAreaSf && projectAreaSf > 0 ? projectAreaSf : FALLBACK_PROJECT_AREA_SF;
  const basis = projectAreaSf
    ? `the ${Math.round(projectAreaSf)} sq ft established for this job`
    : "a typical residential project envelope";

  const scaled = (max: number) => ({ max: max / scale, basis });

  switch (family) {
    case "area":
      // Walls + ceilings of a space run about 4x its floor area; 6x is slack.
      return scaled(area * 6);
    case "length":
      // Perimeter of a square of `area`, times a generous multi-run factor.
      return scaled(Math.max(40, Math.sqrt(area) * 4 * 3));
    case "volume":
      return scaled(Math.max(4, (area * 0.5) / 27 + 10) * 27);
    case "count":
    case "opening":
    case "fixture":
      // Roughly one opening/fixture per 40 sq ft is already generous.
      return { max: Math.max(8, Math.ceil(area / 40)), basis };
    case "circuit_device":
      return { max: Math.max(12, Math.ceil(area / 25)), basis };
    case "room_zone":
      return { max: 20, basis };
    case "assembly":
      return { max: Number.POSITIVE_INFINITY, basis };
  }
}
