import { INCHES_PER_FOOT, feetFromInches, formatInches } from "@/domains/measurement";
import type { DimensionFact, QuantitySource } from "./types";

/**
 * Unit-safe measurement extraction.
 *
 * The estimator's worst failure mode was reading a bare number out of a
 * sentence and treating it as whatever unit the assembly happened to use
 * (94 inches -> "94", then a 24 LF cabinet default). Here a number is only
 * ever a measurement when it is written WITH a unit, and it is normalized to
 * inches immediately.
 */

export interface MeasurementMention {
  inches: number;
  /** Verbatim text of the measurement, e.g. `94 inches`. */
  raw: string;
  /** Sentence the measurement was found in. */
  sentence: string;
  /** Word immediately following, e.g. `wide`, `tall`, `deep`. */
  dimensionHint: "width" | "height" | "depth" | "length" | null;
  /** Best-guess subject noun, e.g. `wall`, `cabinet`. */
  subject: string | null;
  index: number;
}

const FEET_INCHES =
  /(\d+(?:\.\d+)?)\s*(?:'|ft\.?|feet|foot)\s*(\d+(?:\.\d+)?)?\s*(?:"|in\.?|inch(?:es)?)?/gi;
const INCHES_ONLY = /(\d+(?:\.\d+)?)\s*(?:-\s*)?(?:"|inch(?:es)?|in\.?)\b/gi;
const FEET_ONLY = /(\d+(?:\.\d+)?)\s*(?:'|ft\.?|feet|foot)\b/gi;

const SUBJECT_WORDS = [
  "wall",
  "cabinet",
  "cabinets",
  "countertop",
  "counter",
  "run",
  "island",
  "room",
  "opening",
  "ceiling",
  "floor",
  "window",
  "shower",
  "vanity",
];

function hintFor(after: string): MeasurementMention["dimensionHint"] {
  const word = after.replace(/^[^a-zA-Z]+/, "").toLowerCase();
  if (/^wide\b|^width\b/.test(word)) return "width";
  if (/^tall\b|^high\b|^height\b/.test(word)) return "height";
  if (/^deep\b|^depth\b/.test(word)) return "depth";
  if (/^long\b|^length\b/.test(word)) return "length";
  return null;
}

/**
 * The noun this number describes.
 *
 * A ±40 character window used to be scanned for any subject word, which let the
 * word "wall" from a previous sentence attach itself to a cabinet width — and a
 * 30" cabinet then became the wall the whole run was measured from. The subject
 * must therefore come from the number's OWN clause, and the nearest preceding
 * noun wins over anything further away.
 */
const CLAUSE_BREAK = /[.;:,\n]/g;

export function clauseBounds(sentence: string, at: number): [number, number] {
  let start = 0;
  for (const m of sentence.slice(0, at).matchAll(CLAUSE_BREAK)) {
    start = (m.index ?? 0) + 1;
  }
  const rest = sentence.slice(at).search(/[.;:,\n]/);
  const end = rest === -1 ? sentence.length : at + rest;
  return [start, end];
}

function subjectFor(sentence: string, at: number): string | null {
  const [start, end] = clauseBounds(sentence, at);
  const before = sentence.slice(start, at).toLowerCase();
  const after = sentence.slice(at, end).toLowerCase();

  let best: { word: string; distance: number } | null = null;
  for (const word of SUBJECT_WORDS) {
    let distance: number | null = null;
    for (const m of before.matchAll(new RegExp(`\\b${word}\\b`, "g"))) {
      distance = before.length - (m.index ?? 0);
    }
    if (distance === null) {
      const ahead = after.search(new RegExp(`\\b${word}\\b`));
      if (ahead !== -1) distance = ahead + before.length;
    }
    if (distance === null) continue;
    if (!best || distance < best.distance) best = { word, distance };
  }
  return best?.word ?? null;
}


/** All measurements in a block of text, normalized to inches. */
export function extractMeasurements(text: string): MeasurementMention[] {
  const out: MeasurementMention[] = [];
  const seen = new Set<string>();

  const push = (inches: number, raw: string, index: number) => {
    if (!Number.isFinite(inches) || inches <= 0) return;
    const key = `${index}:${raw}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      inches,
      raw: raw.trim(),
      sentence: text,
      dimensionHint: hintFor(text.slice(index + raw.length, index + raw.length + 12)),
      subject: subjectFor(text, index),
      index,
    });
  };

  for (const m of text.matchAll(FEET_INCHES)) {
    const feet = Number(m[1]);
    const inches = m[2] ? Number(m[2]) : 0;
    push(feet * INCHES_PER_FOOT + inches, m[0], m.index ?? 0);
  }
  const claimed = out.map((o) => [o.index, o.index + o.raw.length] as const);
  const overlaps = (start: number, end: number) =>
    claimed.some(([a, b]) => start < b && end > a);

  for (const m of text.matchAll(INCHES_ONLY)) {
    const start = m.index ?? 0;
    if (overlaps(start, start + m[0].length)) continue;
    push(Number(m[1]), m[0], start);
  }
  for (const m of text.matchAll(FEET_ONLY)) {
    const start = m.index ?? 0;
    if (overlaps(start, start + m[0].length)) continue;
    push(Number(m[1]) * INCHES_PER_FOOT, m[0], start);
  }

  return out.sort((a, b) => a.index - b.index);
}

/** Contractor-facing dimension facts, one per measurement mention. */
export function toDimensionFacts(
  mentions: MeasurementMention[],
  source: QuantitySource = "spoken_measurement",
): DimensionFact[] {
  return mentions.map((m, i) => ({
    id: `dim:${i}:${Math.round(m.inches * 100)}`,
    subject: m.subject ?? "measurement",
    inches: m.inches,
    display: formatInches(m.inches),
    feet: feetFromInches(m.inches),
    evidence: m.raw,
    source,
  }));
}

/** `94` -> `7.83`. Never rounds up to a whole foot. */
export function inchesToFeet(inches: number): number {
  return Math.round(feetFromInches(inches) * 1000) / 1000;
}
