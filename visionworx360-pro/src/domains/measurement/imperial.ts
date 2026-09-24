/**
 * Imperial length: one parser, one canonical unit, one formatter.
 *
 * ROOT CAUSE this module fixes: every measurement field in the app read its
 * raw input with `Number(value)` and treated the result as FEET. A contractor
 * typing the perfectly normal US measurement `94 in` therefore recorded a
 * 94-FOOT wall, and the only "safe" way to enter 94 inches was to do the
 * division by hand and type 7.83. Feet-only was never a product decision; it
 * was an accident of `Number()` parsing spread across a dozen components.
 *
 * CANONICAL UNIT: total INCHES. Inches is the finest unit US construction
 * actually uses, every accepted format converts into it without loss, and
 * common fractions (1/2, 1/4, 1/8, 1/16) stay exact in binary floating point.
 * Feet are a *view* of that value (and the legacy storage unit — see
 * `feetFromInches`), never the parse target.
 */

/** Snap to 1/64" so accumulated float noise can't print "9 15/16 + ε". */
const SNAP = 64;
const EPS = 1e-9;

export const INCHES_PER_FOOT = 12;

export interface ImperialLength {
  /** Canonical value: total inches. */
  inches: number;
  /** Same measurement in feet, for legacy `*_ft` storage columns. */
  feet: number;
  /** How the text was read, so callers can explain what they understood. */
  source: "inches" | "feet" | "feet_inches" | "bare";
}

export interface ParseOptions {
  /**
   * What a bare number means. US construction says a bare number in a field
   * labelled "Length (ft)" is feet — that is also what every saved record
   * already means, so it is the default and backward compatibility is free.
   */
  bareUnit?: "ft" | "in";
  /** Reject non-positive values (lengths) or allow 0 (offsets, waste). */
  allowZero?: boolean;
}

/** Round to the nearest 1/64", then strip float noise. */
function snap(inches: number): number {
  return Math.round(inches * SNAP + (inches >= 0 ? EPS : -EPS)) / SNAP;
}

/** Total inches -> feet for the existing `lengthFt`/`widthFt` columns. */
export function feetFromInches(inches: number): number {
  return Math.round((inches / INCHES_PER_FOOT) * 1e6) / 1e6;
}

/** Feet (including legacy decimal feet) -> canonical inches. */
export function inchesFromFeet(feet: number): number {
  return snap(feet * INCHES_PER_FOOT);
}

const NUM = String.raw`\d+(?:\.\d+)?`;
const FRACTION = String.raw`(?:\s+|-)?(\d+)\s*\/\s*(\d+)`;
const FT_MARK = String.raw`(?:'|ft\.?|feet|foot|pies?)`;
const IN_MARK = String.raw`(?:"|in\.?|ins|inch|inches|pulgadas?)`;

/** Normalize the typographic quotes phones love to insert. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** "10 1/2" -> 10.5, keeping construction fractions exact. */
function withFraction(whole: string | undefined, num?: string, den?: string): number | null {
  const base = whole === undefined || whole === "" ? 0 : Number(whole);
  if (!Number.isFinite(base)) return null;
  if (num === undefined || den === undefined) return base;
  const n = Number(num);
  const d = Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return base + n / d;
}

const RE_FEET_INCHES = new RegExp(
  String.raw`^(${NUM})\s*${FT_MARK}\s*(?:(?:and|y)\s+)?(${NUM})?(?:${FRACTION})?\s*(?:${IN_MARK})?$`,
);
const RE_INCHES = new RegExp(String.raw`^(${NUM})?(?:${FRACTION})?\s*${IN_MARK}$`);
const RE_FEET = new RegExp(String.raw`^(${NUM})(?:${FRACTION})?\s*${FT_MARK}$`);
const RE_BARE = new RegExp(String.raw`^(${NUM})(?:${FRACTION})?$`);

/**
 * Read any US construction length: `94 in`, `8 ft`, `7 ft 10 in`, `7' 10"`,
 * `7'10"`, `7' 10 1/2"`, `10 1/2"`, or a bare `7.5` (decimal feet).
 */
export function parseImperialLength(
  text: string | null | undefined,
  options: ParseOptions = {},
): ImperialLength | null {
  const { bareUnit = "ft", allowZero = false } = options;
  const src = normalize(String(text ?? ""));
  if (!src) return null;

  let inches: number | null = null;
  let source: ImperialLength["source"] | null = null;

  const fi = RE_FEET_INCHES.exec(src);
  if (fi) {
    const feet = Number(fi[1]);
    const inchPart = withFraction(fi[2] ?? "", fi[3], fi[4]);
    if (Number.isFinite(feet) && inchPart !== null) {
      // A stray "7' 18"" is a typo, not a 8'6" wall — refuse rather than guess.
      if (inchPart >= INCHES_PER_FOOT && (fi[2] ?? "") !== "") return null;
      inches = feet * INCHES_PER_FOOT + inchPart;
      source = inchPart > 0 ? "feet_inches" : "feet";
    }
  }

  if (inches === null) {
    const only = RE_INCHES.exec(src);
    if (only && (only[1] !== undefined || only[2] !== undefined)) {
      const value = withFraction(only[1], only[2], only[3]);
      if (value !== null) {
        inches = value;
        source = "inches";
      }
    }
  }

  if (inches === null) {
    const feetOnly = RE_FEET.exec(src);
    if (feetOnly) {
      const value = withFraction(feetOnly[1], feetOnly[2], feetOnly[3]);
      if (value !== null) {
        inches = value * INCHES_PER_FOOT;
        source = "feet";
      }
    }
  }

  if (inches === null) {
    const bare = RE_BARE.exec(src);
    if (bare) {
      const value = withFraction(bare[1], bare[2], bare[3]);
      if (value !== null) {
        inches = bareUnit === "in" ? value : value * INCHES_PER_FOOT;
        source = "bare";
      }
    }
  }

  if (inches === null || source === null) return null;
  const canonical = snap(inches);
  if (canonical < 0) return null;
  if (canonical === 0 && !allowZero) return null;
  return { inches: canonical, feet: feetFromInches(canonical), source };
}

/** Convenience for the legacy `*_ft` model: returns feet, or null. */
export function parseLengthToFeet(
  text: string | null | undefined,
  options: ParseOptions = {},
): number | null {
  return parseImperialLength(text, options)?.feet ?? null;
}

const FRACTION_DENOMINATOR = 16;

function fractionLabel(numerator: number, denominator: number): string {
  let n = numerator;
  let d = denominator;
  while (n % 2 === 0 && d % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  return `${n}/${d}`;
}

export interface FormatOptions {
  /** Use `7 ft 10 in` instead of `7' 10"` (screen readers, print). */
  words?: boolean;
}

/**
 * Contractor-readable output: 94 -> `7' 10"`, never `8'` and never `7.83'`.
 * Remaining inches snap to the nearest 1/16" — the finest fraction a tape
 * measure shows — so entered precision survives the round trip.
 */
export function formatInches(
  inches: number | null | undefined,
  options: FormatOptions = {},
): string {
  if (inches === null || inches === undefined || !Number.isFinite(inches)) return "";
  const total = snap(Math.abs(inches));
  const sign = inches < 0 ? "-" : "";
  const ftMark = options.words ? " ft" : "'";
  const inMark = options.words ? " in" : '"';

  let feet = Math.floor(total / INCHES_PER_FOOT);
  let rest = total - feet * INCHES_PER_FOOT;

  const whole = Math.floor(rest + EPS);
  const numerator = Math.round((rest - whole) * FRACTION_DENOMINATOR);
  let inchWhole = whole;
  let frac = numerator;
  if (frac === FRACTION_DENOMINATOR) {
    inchWhole += 1;
    frac = 0;
  }
  if (inchWhole >= INCHES_PER_FOOT) {
    feet += Math.floor(inchWhole / INCHES_PER_FOOT);
    inchWhole = inchWhole % INCHES_PER_FOOT;
  }
  rest = inchWhole;

  const inchText =
    frac > 0
      ? `${inchWhole > 0 ? `${inchWhole} ` : ""}${fractionLabel(frac, FRACTION_DENOMINATOR)}${inMark}`
      : inchWhole > 0
        ? `${inchWhole}${inMark}`
        : "";

  if (feet === 0) return `${sign}${inchText || `0${inMark}`}`;
  if (!inchText) return `${sign}${feet}${ftMark}`;
  return `${sign}${feet}${ftMark} ${inchText}`;
}

/**
 * Plain inches, never converted to feet: `30"`, `4"`, `15 1/2"`.
 *
 * Cabinet component widths, filler strips and other shop dimensions are spoken,
 * ordered and installed in inches. Printing a 30" cabinet as `2' 6"` is not a
 * different notation, it is the wrong unit for the trade — so component-level
 * dimensions use this formatter and only wall/run lengths use `formatInches`.
 */
export function formatInchesOnly(
  inches: number | null | undefined,
  options: FormatOptions = {},
): string {
  if (inches === null || inches === undefined || !Number.isFinite(inches)) return "";
  const inMark = options.words ? " in" : '"';
  const total = snap(Math.abs(inches));
  const sign = inches < 0 ? "-" : "";
  let whole = Math.floor(total + EPS);
  let frac = Math.round((total - whole) * FRACTION_DENOMINATOR);
  if (frac === FRACTION_DENOMINATOR) {
    whole += 1;
    frac = 0;
  }
  if (frac > 0) {
    const fractionText = fractionLabel(frac, FRACTION_DENOMINATOR);
    return `${sign}${whole > 0 ? `${whole} ` : ""}${fractionText}${inMark}`;
  }
  return `${sign}${whole}${inMark}`;
}

/** Same output for a value already stored in feet (legacy records). */

export function formatFeet(feet: number | null | undefined, options: FormatOptions = {}): string {
  if (feet === null || feet === undefined || !Number.isFinite(feet)) return "";
  return formatInches(inchesFromFeet(feet), options);
}
