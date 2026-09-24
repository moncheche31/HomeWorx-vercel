/**
 * Minimal automatic quantity engine (Pricing Integrity, Phase 1).
 *
 * Deterministic and conservative: it only derives a quantity when the
 * contractor's own words contain explicit dimensions (16' x 18' → 288 sq ft).
 * It never guesses a room size, never invents a default, and always reports
 * where the number came from so the contractor can reject it.
 *
 * Pure functions only — no React, no Supabase, no i18n, no IO.
 */

export type DerivedQuantityUnit = "square_foot" | "linear_foot";

export interface ParsedDimensions {
  /** Longer side, in feet. */
  lengthFt: number;
  /** Shorter side, in feet. */
  widthFt: number;
  /** The exact text the dimensions were read from. */
  raw: string;
}

export interface DerivedQuantity {
  quantity: number;
  unitKey: DerivedQuantityUnit;
  method: "area_from_dimensions" | "perimeter_from_dimensions";
  /** Human-readable derivation, e.g. "16 ft × 18 ft". */
  formula: string;
  dimensions: ParsedDimensions;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Nominal lumber pairs. "2 x 8 lumber" is a material spec, not a room size, so
 * a dimension pair matching one of these is only accepted when the text marks
 * the numbers as feet.
 */
const LUMBER_PAIRS = new Set([
  "1x2", "1x3", "1x4", "1x6", "1x8", "1x10", "1x12",
  "2x2", "2x3", "2x4", "2x6", "2x8", "2x10", "2x12",
  "4x4", "4x6", "6x6", "8x8",
]);

/** `16`, `16'`, `16 ft`, `16.5 feet`, `16' 6"` → feet as a number. */
const SIDE = String.raw`(\d+(?:\.\d+)?)\s*(?:'|’|\u2032|ft\b|feet\b|foot\b)?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|”|\u2033|in\b|inch(?:es)?\b))?`;
const SEPARATOR = String.raw`\s*(?:x|×|by)\s*`;
const DIMENSION_RE = new RegExp(`${SIDE}${SEPARATOR}${SIDE}`, "i");
const FOOT_MARKER_RE = /(?:'|’|\u2032|\bft\b|\bfeet\b|\bfoot\b)/i;

const toFeet = (feet: string | undefined, inches: string | undefined): number => {
  const f = Number(feet ?? 0);
  const i = Number(inches ?? 0);
  if (!Number.isFinite(f) || f <= 0) return 0;
  return round2(f + (Number.isFinite(i) ? i / 12 : 0));
};

/**
 * Read a dimension pair out of free text. Returns null unless the reading is
 * unambiguous — an unmarked nominal lumber pair is deliberately rejected.
 */
export function parseDimensions(text: string | null | undefined): ParsedDimensions | null {
  const source = String(text ?? "");
  const match = DIMENSION_RE.exec(source);
  if (!match) return null;

  const raw = match[0].trim();
  const a = toFeet(match[1], match[2]);
  const b = toFeet(match[3], match[4]);
  if (a <= 0 || b <= 0) return null;

  const marked = FOOT_MARKER_RE.test(raw);
  if (!marked) {
    const nominal = `${match[1]}x${match[3]}`.replace(/\.0+/g, "");
    if (LUMBER_PAIRS.has(nominal)) return null;
    /* Without a foot marker, only plausible room dimensions are trusted. */
    if (a < 6 || b < 6) return null;
  }

  return { lengthFt: Math.max(a, b), widthFt: Math.min(a, b), raw };
}

/** Floor / ceiling / wall-face area in square feet. */
export function deriveAreaSquareFeet(text: string | null | undefined): DerivedQuantity | null {
  const dims = parseDimensions(text);
  if (!dims) return null;
  return {
    quantity: round2(dims.lengthFt * dims.widthFt),
    unitKey: "square_foot",
    method: "area_from_dimensions",
    formula: `${dims.lengthFt} ft × ${dims.widthFt} ft`,
    dimensions: dims,
  };
}

/** Perimeter in linear feet — used for wall framing and base trim. */
export function derivePerimeterLinearFeet(
  text: string | null | undefined,
): DerivedQuantity | null {
  const dims = parseDimensions(text);
  if (!dims) return null;
  return {
    quantity: round2(2 * (dims.lengthFt + dims.widthFt)),
    unitKey: "linear_foot",
    method: "perimeter_from_dimensions",
    formula: `2 × (${dims.lengthFt} ft + ${dims.widthFt} ft)`,
    dimensions: dims,
  };
}

/**
 * Suggest a quantity for one estimate line.
 *
 * The line's unit decides which derivation applies; anything else returns null
 * rather than a number the contractor would have to un-guess.
 */
export function suggestQuantityForLine(input: {
  description: string | null | undefined;
  unitKey: string | null | undefined;
}): DerivedQuantity | null {
  if (input.unitKey === "square_foot" || input.unitKey == null) {
    return deriveAreaSquareFeet(input.description);
  }
  if (input.unitKey === "linear_foot") {
    return derivePerimeterLinearFeet(input.description);
  }
  return null;
}
