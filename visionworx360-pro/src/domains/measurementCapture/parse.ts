/**
 * Bulk measurement parsing for dictated, typed and plan-extracted text.
 *
 * A contractor walking a house says one long paragraph:
 *
 *   "Bedroom is 12 by 14 with 8 foot ceiling. Bathroom is 5 by 9. Back
 *    kitchen wall is 94 inches. Vanity is 60 inches. Window one is 36 by 48."
 *
 * That must become five separate reviewable measurements, and `94 inches`
 * must stay 7' 10" — never 94 feet. Unit safety is delegated to
 * `@/domains/measurement` (canonical inches) and the scale rules below follow
 * the same ADR-057 principle: when a bare number could plausibly be either
 * unit, we do NOT guess silently — we flag the item for review.
 */

import {
  INCHES_PER_FOOT,
  formatInches,
  parseImperialLength,
} from "@/domains/measurement";
import type {
  MeasurementFlag,
  MeasurementItem,
  MeasurementSource,
  MeasurementStatus,
} from "./types";

/** Subjects measured in inches in the trades (a "30 vanity" is 30 inches). */
const INCH_SCALE = [
  "vanity",
  "cabinet",
  "cabinets",
  "window",
  "door",
  "sink",
  "counter",
  "countertop",
  "backsplash",
  "tile",
  "shower",
  "tub",
  "island",
  "range",
  "fridge",
  "refrigerator",
  "appliance",
  "riser",
  "tread",
];

/** Subjects measured in feet (rooms and building surfaces). */
const ROOM_SCALE = [
  "bedroom",
  "bathroom",
  "bath",
  "kitchen",
  "room",
  "garage",
  "living",
  "dining",
  "office",
  "hall",
  "hallway",
  "closet",
  "basement",
  "attic",
  "deck",
  "patio",
  "porch",
  "laundry",
  "area",
  "wall",
  "ceiling",
  "floor",
  "roof",
  "fence",
  "driveway",
];

const CEILING = /\bceiling(?:\s+height)?\b|\bheight\b/;

const NUM = String.raw`\d+(?:\.\d+)?`;
const TOKEN = String.raw`${NUM}(?:\s*\/\s*\d+)?(?:\s*(?:'|"|ft\.?|feet|foot|in\.?|inch(?:es)?))?(?:\s*${NUM}(?:\s*\/\s*\d+)?\s*(?:"|in\.?|inch(?:es)?))?`;
const RE_PAIR = new RegExp(String.raw`(${TOKEN})\s*(?:by|x|×)\s*(${TOKEN})`, "i");
const RE_SINGLE = new RegExp(`(${TOKEN})`, "i");

function normalizeSubject(text: string): string | null {
  const lower = text.toLowerCase();
  for (const word of [...INCH_SCALE, ...ROOM_SCALE]) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return word;
  }
  return null;
}

function scaleFor(subject: string | null): "in" | "ft" | "unknown" {
  if (!subject) return "unknown";
  if (ROOM_SCALE.includes(subject)) return "ft";
  if (INCH_SCALE.includes(subject)) return "in";
  return "unknown";
}

function hasUnit(text: string): boolean {
  return /['"]|\b(?:ft|feet|foot|in|ins|inch|inches)\b|\bin\./i.test(text);
}

interface ParsedValue {
  inches: number;
  /** True when the number carried no unit and we had to apply a scale rule. */
  bare: boolean;
}

function readValue(text: string, subject: string | null): ParsedValue | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const explicit = hasUnit(trimmed);
  const scale = scaleFor(subject);
  const bareUnit: "ft" | "in" = !explicit && scale === "in" ? "in" : "ft";
  const parsed = parseImperialLength(trimmed, { bareUnit });
  if (!parsed) return null;
  return { inches: parsed.inches, bare: !explicit };
}

function labelFor(clause: string, fallback: string): string {
  const beforeVerb = clause.split(/\b(?:is|are|measures|measured|runs|:|=)\b/i)[0] ?? "";
  const cleaned = beforeVerb
    .replace(/^(?:the|a|an|and|with|el|la|los|las)\b/i, "")
    // A trailing clause like "with 8 foot ceiling" is a value, not a label:
    // strip the numbers/units so it falls back to the room it belongs to.
    .replace(new RegExp(TOKEN, "gi"), " ")
    .replace(/\b(?:ceiling|height|wide|tall|high|deep|long)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s#-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned && !/^\d+$/.test(cleaned) && cleaned.length <= 60) return titleCase(cleaned);
  return fallback;
}


function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Sentences first, then sub-clauses that can each hold their own dimension. */
function splitClauses(text: string): { clause: string; sentenceIndex: number }[] {
  const out: { clause: string; sentenceIndex: number }[] = [];
  const sentences = text.split(/[.;\n\r]+/);
  sentences.forEach((sentence, sentenceIndex) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    for (const part of trimmed.split(/,|\band\b|\bwith\b|\by\b\s+(?=\d)/i)) {
      const clause = part.trim();
      if (clause) out.push({ clause, sentenceIndex });
    }
  });
  return out;
}

function displayFor(inches: number, secondary: number | null): string {
  return secondary === null
    ? formatInches(inches)
    : `${formatInches(inches)} x ${formatInches(secondary)}`;
}

/** Obvious nonsense for a residential job: > 500 ft or < 1/2". */
function outOfRange(inches: number): boolean {
  return inches > 500 * INCHES_PER_FOOT || inches < 0.5;
}

export interface ParseMeasurementOptions {
  source: MeasurementSource;
  /** Deterministic id prefix so re-parsing the same text is stable. */
  idPrefix?: string;
  documentId?: string | null;
}

/**
 * Read every measurement in a block of text.
 *
 * Status rules:
 *  - the contractor's own unambiguous words are `confirmed` (they stated it);
 *  - a bare number on an inch-scale item ("vanity is 30") is `ambiguous`;
 *  - everything read off a plan is a `candidate` until the contractor confirms.
 */
export function parseMeasurementText(
  text: string,
  options: ParseMeasurementOptions,
): MeasurementItem[] {
  const { source, idPrefix = "m", documentId = null } = options;
  const items: MeasurementItem[] = [];
  if (!text?.trim()) return items;

  let index = 0;
  let sentenceLabel = "";
  let lastSentence = -1;

  for (const { clause, sentenceIndex } of splitClauses(text)) {
    if (sentenceIndex !== lastSentence) {
      sentenceLabel = "";
      lastSentence = sentenceIndex;
    }
    const subject = normalizeSubject(clause);
    const isCeiling = CEILING.test(clause);
    const baseLabel = labelFor(clause, sentenceLabel || "Measurement");
    if (!sentenceLabel && baseLabel !== "Measurement") sentenceLabel = baseLabel;

    const pair = RE_PAIR.exec(clause);
    const emit = (
      inches: number,
      secondary: number | null,
      label: string,
      raw: string,
      bare: boolean,
      subjectKey: string | null,
    ) => {
      let flag: MeasurementFlag = null;
      let status: MeasurementStatus = source === "plan" ? "candidate" : "confirmed";
      if (bare && scaleFor(subjectKey) === "in") {
        flag = "unitless_small_item";
        status = source === "plan" ? "candidate" : "ambiguous";
      }
      if (outOfRange(inches) || (secondary !== null && outOfRange(secondary))) {
        flag = "out_of_range";
        status = source === "plan" ? "candidate" : "ambiguous";
      }
      if (source === "plan" && flag === null) flag = "plan_extraction";
      items.push({
        id: `${idPrefix}-${index++}`,
        label,
        subject: subjectKey,
        kind: secondary === null ? "single" : "pair",
        inches,
        secondaryInches: secondary,
        display: displayFor(inches, secondary),
        rawText: raw.trim(),
        source,
        status,
        flag,
        documentId,
      });
    };

    if (pair) {
      const a = readValue(pair[1], subject);
      const b = readValue(pair[2], subject);
      if (a && b) {
        emit(
          a.inches,
          b.inches,
          isCeiling ? `${baseLabel} ceiling` : baseLabel,
          pair[0],
          a.bare || b.bare,
          subject,
        );
        // "Bedroom is 12 by 14 with 8 foot ceiling" — the ceiling is separate.
        const rest = clause.slice((pair.index ?? 0) + pair[0].length);
        if (CEILING.test(rest)) {
          const height = RE_SINGLE.exec(rest);
          const value = height ? readValue(height[1], "ceiling") : null;
          if (value) {
            emit(value.inches, null, `${baseLabel} ceiling`, height![0], value.bare, "ceiling");
          }
        }
        continue;
      }
    }

    const single = RE_SINGLE.exec(clause);
    if (!single) continue;
    const value = readValue(single[1], isCeiling ? "ceiling" : subject);
    if (!value) continue;
    emit(
      value.inches,
      null,
      isCeiling && !/ceiling/i.test(baseLabel) ? `${baseLabel} ceiling` : baseLabel,
      single[0],
      value.bare,
      isCeiling ? "ceiling" : subject,
    );
  }

  return items;
}

/** One sentence per confirmed measurement, for the scope/estimate intake. */
export function measurementFactsText(items: MeasurementItem[]): string {
  return items
    .filter((i) => i.status === "confirmed")
    .map((i) =>
      i.kind === "pair"
        ? `${i.label} measures ${formatInches(i.inches, { words: true })} by ${formatInches(i.secondaryInches ?? 0, { words: true })}.`
        : `${i.label} is ${formatInches(i.inches, { words: true })}.`,
    )
    .join(" ");
}
