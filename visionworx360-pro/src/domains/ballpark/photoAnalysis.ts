/**
 * Photo package analysis — the automatic-first entry point for the photo path.
 *
 * Honesty first: this app has **no image-analysis provider wired in**. Nothing
 * here looks at a single pixel. What it does is decide what can legitimately be
 * said from the images the contractor uploaded plus the little they have told
 * us, turn that into a normalized set of facts with provenance, and then name
 * the few questions actually worth asking. When a real vision provider is added
 * it implements `VisionProvider` and is registered here; every consumer already
 * reads `analyzed` and renders the difference.
 *
 * Pure functions. No React, no IO, no i18n lookups.
 */

import {
  footprintFor,
  OBSERVATION_PREFIX,
  PHOTO_OBSERVATION_PROMPTS,
  type BallparkSizeClass,
} from "./intake";
import type { PhotoKind } from "./photoInference";
import type { BallparkAnswers, BallparkConfidence } from "./types";

export interface AnalyzedPhoto {
  id: string;
  name: string;
  /** What the contractor said this image is. Defaults to a room photo. */
  kind: PhotoKind;
}

/** The contract a real vision provider will implement. Nothing implements it. */
export interface VisionProvider {
  key: string;
  analyze(photos: AnalyzedPhoto[]): Promise<Partial<PhotoAnalysis>>;
}

/** No provider is registered. This is a fact the UI is required to surface. */
export const VISION_PROVIDER: VisionProvider | null = null;
export const HAS_VISION_PROVIDER = VISION_PROVIDER !== null;

export interface AnalysisNote {
  code: string;
  messageKey: string;
  severity: "info" | "warning";
}

/* ------------------------------------------------------------------ *
 * The normalized inference model
 * ------------------------------------------------------------------ */

/**
 * Where a fact came from. There is deliberately no "the computer saw it"
 * value: nothing in Version 1 reads pixels, so `photo_inferred` means
 * "derived from the presence and kind of the images", never "recognized".
 */
export const ANALYSIS_SOURCE_TYPES = [
  "photo_inferred",
  "sketch_inferred",
  "user_confirmed",
  "user_selected",
] as const;
export type AnalysisSourceType = (typeof ANALYSIS_SOURCE_TYPES)[number];

export type AnalysisUnit = "ft" | "sf" | "class" | "category" | "none";

export interface PhotoAnalysisFact {
  /** Stable key; matches an interview question id when one exists. */
  key: string;
  labelKey: string;
  /** Display value: a label key, a free string or a number. */
  value: string | number | null;
  low: number | null;
  high: number | null;
  unit: AnalysisUnit;
  sourceType: AnalysisSourceType;
  confidence: number;
  confidenceBand: BallparkConfidence;
  /** Images this fact is attributable to. Empty when it came from an answer. */
  imageIds: string[];
  /** Why we believe it, as a translation key. */
  basisKey: string;
  /** True once the contractor has replaced the automatic value. */
  overridden: boolean;
}

export type ConditionStatus = "unfinished" | "finished" | "damage" | "unknown";

export interface PhotoAnalysis {
  /** Which provider produced this. "none" when nobody looked at the pixels. */
  provider: string;
  /** False whenever the images were not actually analyzed. Never faked. */
  analyzed: boolean;
  photoCount: number;
  kindCounts: Record<PhotoKind, number>;
  /** The kind most of the uploaded images are. Drives the whole flow. */
  dominantKind: PhotoKind;
  /** True when object-scale calibration is meaningful at all. */
  objectScaleAvailable: boolean;
  roomType: string | null;
  sizeClass: BallparkSizeClass | null;
  /** Broad footprint band, only when a size class or room type supports one. */
  dimensionRangeFt: { lengthFt: number; widthFt: number; areaSf: number } | null;
  /** Components a human confirmed are visible, as observation keys. */
  visibleComponents: string[];
  /** Observations the contractor explicitly confirmed. Never guessed. */
  confirmedObservations: string[];
  /** Observation prompts nobody has answered yet. Shown as uncertain. */
  uncertainObservations: string[];
  /** Measurements we actually hold, each with its own provenance. */
  knownMeasurements: {
    key: string;
    labelKey: string;
    value: string;
    sourceType: AnalysisSourceType;
  }[];
  /** Measurement keys nobody has established. These widen the range. */
  unknownMeasurements: string[];
  /** Existing-condition read, never claimed from a rendering. */
  conditionStatus: ConditionStatus;
  /** Scope buckets this job is likely to touch. */
  scopeCategories: string[];
  /** Everything we believe, with provenance and confidence. */
  facts: PhotoAnalysisFact[];
  /** Question ids still worth asking, highest value first. Max 7. */
  clarificationIds: string[];
  /** High-impact things nobody has told us yet. */
  unresolved: string[];
  /** Average confidence across the facts. Low when there is little to go on. */
  confidence: number;
  confidenceBand: BallparkConfidence;
  notes: AnalysisNote[];
}

/**
 * Never interrogate a contractor. Three to seven questions is the whole
 * budget: fewer than three rarely tightens a range, more than seven is an
 * interview, and the Full interview already exists for that.
 */
export const MAX_CLARIFICATIONS = 7;
export const MIN_CLARIFICATIONS = 3;

/**
 * The clarifications that actually move a ballpark range, in priority order.
 * Anything not on this list is refinement, not a gate.
 */
export const HIGH_VALUE_CLARIFICATIONS = [
  "roomType",
  "sizeClass",
  "scopeType",
  "finishLevel",
  "cabinets",
  "plumbingRelocation",
  "wallRemoval",
  "layoutChange",
  `${OBSERVATION_PREFIX}visibleDamage`,
  `${OBSERVATION_PREFIX}flooringToReplace`,
];

export interface AnalyzeInput {
  photos: AnalyzedPhoto[];
  roomType?: string | null;
  sizeClass?: string | null;
  /** The interview answers so far, used for facts and to stop re-asking. */
  answers?: BallparkAnswers;
  /** Ids already answered, when the caller has them separately. */
  answeredIds?: string[];
  /** Measurement keys the contractor has overridden by hand. */
  overriddenKeys?: string[];
}

function emptyCounts(): Record<PhotoKind, number> {
  return {
    room_photo: 0,
    detail_photo: 0,
    exterior: 0,
    sketch_plan: 0,
    rendering: 0,
    damage_photo: 0,
    unknown: 0,
  };
}

function bandFor(confidence: number): BallparkConfidence {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.45) return "medium";
  return "low";
}

function answerValue(answers: BallparkAnswers, id: string): string | null {
  const a = answers[id];
  return a?.status === "answered" && a.value != null ? String(a.value) : null;
}

const CONDITION_ROOMS_FOR_DAMAGE = new Set(["yes"]);

/**
 * Which questions are worth asking, given what these images are and what the
 * contractor has already said.
 *
 * Conditional on purpose: a garage conversion is never asked about cabinets, a
 * cosmetic refresh is never asked about wall removal, and nothing is asked
 * twice. A rendering-only package skips the existing-condition observations
 * entirely — a rendering cannot answer them.
 */
export function clarificationsFor(input: {
  roomType: string | null;
  scopeType: string | null;
  dominantKind: PhotoKind;
  hasRoomPhoto: boolean;
  answered: Set<string>;
  dimensionsKnown: boolean;
}): string[] {
  const { roomType, scopeType, dominantKind, hasRoomPhoto, answered, dimensionsKnown } = input;
  const wet = roomType === "kitchen" || roomType === "bathroom";
  const structural = scopeType === "full" || scopeType === "conversion";

  const wanted: string[] = ["roomType"];
  if (!dimensionsKnown) wanted.push("sizeClass");
  wanted.push("scopeType", "finishLevel");
  if (wet) wanted.push("cabinets", "plumbingRelocation");
  if (structural || roomType === "garage" || roomType === "basement") wanted.push("wallRemoval");
  if (structural) wanted.push("layoutChange");
  const showsExisting =
    dominantKind !== "rendering" && dominantKind !== "sketch_plan";
  if (showsExisting && (hasRoomPhoto || dominantKind === "damage_photo")) {
    wanted.push(`${OBSERVATION_PREFIX}visibleDamage`);
  }
  if (showsExisting && hasRoomPhoto && dominantKind !== "exterior") {
    wanted.push(`${OBSERVATION_PREFIX}flooringToReplace`);
  }

  const unique: string[] = [];
  for (const id of wanted) {
    if (answered.has(id) || unique.includes(id)) continue;
    unique.push(id);
  }
  /* Keep the ask meaningful: top up from the high-value list before the
   * floor, but never past the ceiling and never re-ask something answered. */
  for (const id of HIGH_VALUE_CLARIFICATIONS) {
    if (unique.length >= MIN_CLARIFICATIONS) break;
    if (answered.has(id) || unique.includes(id)) continue;
    if (id === "sizeClass" && dimensionsKnown) continue;
    unique.push(id);
  }
  return unique.slice(0, MAX_CLARIFICATIONS);
}

/** Scope buckets implied by room type, scope type and confirmed components. */
export function scopeCategoriesFor(
  roomType: string | null,
  scopeType: string | null,
  components: string[],
): string[] {
  const categories = new Set<string>(["finishes"]);
  if (scopeType === "cosmetic") categories.add("paint");
  if (scopeType === "full" || scopeType === "conversion") {
    categories.add("demolition");
    categories.add("framing");
    categories.add("electrical");
  }
  if (scopeType === "conversion") {
    categories.add("insulation");
    categories.add("mechanical");
  }
  if (roomType === "kitchen" || roomType === "bathroom") {
    categories.add("plumbing");
    categories.add("cabinetry");
  }
  if (components.includes("flooringToReplace")) categories.add("flooring");
  if (components.includes("visibleDamage")) categories.add("repairs");
  if (components.includes("plumbingFixturesVisible")) categories.add("plumbing");
  if (components.includes("cabinetsPresent")) categories.add("cabinetry");
  return [...categories];
}

/**
 * Classify the uploaded package, say what can honestly be said about it, and
 * decide what to ask.
 *
 * A sketch or floor plan is handled completely differently from a photograph:
 * object-scale heuristics are switched off, and any dimension the contractor
 * gives is recorded as `sketch_inferred`. A rendering never contributes an
 * existing-condition claim.
 */
export function analyzePhotoPackage(input: AnalyzeInput): PhotoAnalysis {
  const photos = input.photos ?? [];
  const answers = input.answers ?? {};
  const overridden = new Set(input.overriddenKeys ?? []);

  const kindCounts = emptyCounts();
  for (const photo of photos) kindCounts[photo.kind] = (kindCounts[photo.kind] ?? 0) + 1;

  const dominantKind = (Object.entries(kindCounts) as [PhotoKind, number][]).reduce<
    [PhotoKind, number]
  >((best, entry) => (entry[1] > best[1] ? entry : best), ["room_photo", -1])[0];

  const roomPhotoIds = photos.filter((p) => p.kind === "room_photo").map((p) => p.id);
  const allIds = photos.map((p) => p.id);
  const hasRoomPhoto = roomPhotoIds.length > 0;

  const roomType = input.roomType ?? answerValue(answers, "roomType");
  const sizeClass = (input.sizeClass ?? answerValue(answers, "sizeClass")) as BallparkSizeClass | null;
  const scopeType = answerValue(answers, "scopeType");
  const finishLevel = answerValue(answers, "finishLevel");
  const lengthFt = Number.parseFloat(answerValue(answers, "lengthFt") ?? "");
  const widthFt = Number.parseFloat(answerValue(answers, "widthFt") ?? "");
  const dimensionsKnown = Number.isFinite(lengthFt) && Number.isFinite(widthFt);

  /* Components: only what a human confirmed. Never guessed from an image. */
  const visibleComponents = Object.keys(answers)
    .filter((id) => id.startsWith(OBSERVATION_PREFIX))
    .filter((id) => answerValue(answers, id) === "yes")
    .map((id) => id.slice(OBSERVATION_PREFIX.length));

  const damage = answerValue(answers, `${OBSERVATION_PREFIX}visibleDamage`);
  const wallsFinished = answerValue(answers, `${OBSERVATION_PREFIX}wallsFinished`);
  const conditionStatus: ConditionStatus =
    dominantKind === "rendering"
      ? "unknown"
      : damage && CONDITION_ROOMS_FOR_DAMAGE.has(damage)
        ? "damage"
        : wallsFinished === "yes"
          ? "finished"
          : wallsFinished === "no"
            ? "unfinished"
            : "unknown";

  const footprint = footprintFor(roomType, sizeClass);
  const dimensionRangeFt = dimensionsKnown
    ? { lengthFt, widthFt, areaSf: Math.round(lengthFt * widthFt) }
    : footprint
      ? {
          lengthFt: footprint.lengthFt,
          widthFt: footprint.widthFt,
          areaSf: Math.round(footprint.lengthFt * footprint.widthFt),
        }
      : null;

  const scopeCategories = scopeCategoriesFor(roomType, scopeType, visibleComponents);

  /* ---------------- facts, each with its own provenance ---------------- */
  const facts: PhotoAnalysisFact[] = [];
  const fact = (f: Omit<PhotoAnalysisFact, "confidenceBand" | "overridden">) =>
    facts.push({
      ...f,
      confidenceBand: bandFor(f.confidence),
      overridden: overridden.has(f.key),
    });

  fact({
    key: "photoKind",
    labelKey: "analysis.fact.photoKind",
    value: `photos.kind.${dominantKind}`,
    low: null,
    high: null,
    unit: "category",
    sourceType: "user_selected",
    confidence: photos.length > 0 ? 0.9 : 0.2,
    imageIds: allIds,
    basisKey: "analysis.basis.kindSelected",
  });

  if (roomType) {
    fact({
      key: "roomType",
      labelKey: "analysis.fact.roomType",
      value: `options.roomType.${roomType}`,
      low: null,
      high: null,
      unit: "category",
      sourceType: "user_selected",
      confidence: 0.9,
      imageIds: allIds,
      basisKey: "analysis.basis.answered",
    });
  }

  if (sizeClass) {
    fact({
      key: "sizeClass",
      labelKey: "analysis.fact.sizeClass",
      value: `options.sizeClass.${sizeClass}`,
      low: null,
      high: null,
      unit: "class",
      sourceType: "user_selected",
      confidence: 0.7,
      imageIds: allIds,
      basisKey: "analysis.basis.answered",
    });
  }

  if (dimensionRangeFt) {
    const sketch = dominantKind === "sketch_plan";
    fact({
      key: "floorAreaSf",
      labelKey: "analysis.fact.floorAreaSf",
      value: dimensionRangeFt.areaSf,
      low: Math.round(dimensionRangeFt.areaSf * (dimensionsKnown ? 1 : 0.8)),
      high: Math.round(dimensionRangeFt.areaSf * (dimensionsKnown ? 1 : 1.2)),
      unit: "sf",
      sourceType: dimensionsKnown
        ? sketch
          ? "sketch_inferred"
          : "user_confirmed"
        : "photo_inferred",
      confidence: dimensionsKnown ? (sketch ? 0.65 : 0.9) : 0.4,
      imageIds: dimensionsKnown ? allIds : [],
      basisKey: dimensionsKnown ? "analysis.basis.dimensions" : "analysis.basis.sizeAllowance",
    });
  }

  for (const component of visibleComponents) {
    fact({
      key: `${OBSERVATION_PREFIX}${component}`,
      labelKey: `obs.${component}`,
      value: "options.yes",
      low: null,
      high: null,
      unit: "none",
      sourceType: "user_confirmed",
      confidence: 0.85,
      imageIds: roomPhotoIds.length ? roomPhotoIds : allIds,
      basisKey: "analysis.basis.confirmedInPhoto",
    });
  }

  if (scopeType) {
    fact({
      key: "scopeType",
      labelKey: "analysis.fact.scopeType",
      value: `options.scopeType.${scopeType}`,
      low: null,
      high: null,
      unit: "category",
      sourceType: "user_selected",
      confidence: 0.85,
      imageIds: [],
      basisKey: "analysis.basis.answered",
    });
  }

  if (finishLevel) {
    fact({
      key: "finishLevel",
      labelKey: "analysis.fact.finishLevel",
      value: `options.finishLevel.${finishLevel}`,
      low: null,
      high: null,
      unit: "category",
      sourceType: "user_selected",
      confidence: 0.85,
      imageIds: [],
      basisKey: "analysis.basis.answered",
    });
  }

  /* ---------------- questions, notes, confidence ---------------- */
  const answered = new Set<string>([
    ...(input.answeredIds ?? []),
    ...Object.keys(answers).filter((id) => answers[id]?.status === "answered"),
  ]);

  const clarificationIds = clarificationsFor({
    roomType,
    scopeType,
    dominantKind,
    hasRoomPhoto,
    answered,
    dimensionsKnown,
  });

  const unresolved = ["roomType", "sizeClass", "scopeType", "finishLevel"].filter(
    (id) => !answered.has(id) && !(id === "sizeClass" && dimensionsKnown),
  );

  const notes: AnalysisNote[] = [
    { code: "no-vision-provider", messageKey: "analysis.note.noVisionProvider", severity: "info" },
  ];
  if (photos.length === 0) {
    notes.push({ code: "no-photos", messageKey: "analysis.note.noPhotos", severity: "warning" });
  }
  if (dominantKind === "sketch_plan") {
    notes.push({ code: "sketch", messageKey: "analysis.note.sketch", severity: "warning" });
  }
  if (dominantKind === "rendering") {
    notes.push({ code: "rendering", messageKey: "analysis.note.rendering", severity: "warning" });
  }
  if (dominantKind === "detail_photo") {
    notes.push({ code: "detail", messageKey: "analysis.note.detail", severity: "warning" });
  }
  if (dominantKind === "exterior") {
    notes.push({ code: "exterior", messageKey: "analysis.note.exterior", severity: "warning" });
  }
  if (dominantKind === "damage_photo") {
    notes.push({ code: "damage", messageKey: "analysis.note.damage", severity: "warning" });
  }
  if (dominantKind === "unknown" && photos.length > 0) {
    notes.push({ code: "unknown-kind", messageKey: "analysis.note.unknownKind", severity: "warning" });
  }
  if (unresolved.length > 0) {
    notes.push({ code: "unresolved", messageKey: "analysis.note.unresolved", severity: "warning" });
  }

  /* ------------- the four plain-language summary sections ------------- */
  const confirmedObservations = PHOTO_OBSERVATION_PROMPTS.filter(
    (prompt) => answerValue(answers, `${OBSERVATION_PREFIX}${prompt.key}`) === "yes",
  ).map((prompt) => prompt.key);

  /* Anything nobody answered stays uncertain. It is never assumed present. */
  const uncertainObservations = PHOTO_OBSERVATION_PROMPTS.filter(
    (prompt) => answerValue(answers, `${OBSERVATION_PREFIX}${prompt.key}`) == null,
  ).map((prompt) => prompt.key);

  const knownMeasurements: PhotoAnalysis["knownMeasurements"] = [];
  const unknownMeasurements: string[] = [];
  if (dimensionsKnown) {
    knownMeasurements.push(
      {
        key: "lengthFt",
        labelKey: "analysis.measure.lengthFt",
        value: `${lengthFt} ft`,
        sourceType: dominantKind === "sketch_plan" ? "sketch_inferred" : "user_confirmed",
      },
      {
        key: "widthFt",
        labelKey: "analysis.measure.widthFt",
        value: `${widthFt} ft`,
        sourceType: dominantKind === "sketch_plan" ? "sketch_inferred" : "user_confirmed",
      },
    );
  } else {
    unknownMeasurements.push("lengthFt", "widthFt");
  }
  const ceilingFt = answerValue(answers, "ceilingHeightFt");
  if (ceilingFt) {
    knownMeasurements.push({
      key: "ceilingHeightFt",
      labelKey: "analysis.measure.ceilingHeightFt",
      value: `${ceilingFt} ft`,
      sourceType: "user_confirmed",
    });
  } else {
    unknownMeasurements.push("ceilingHeightFt");
  }


  const confidence = facts.length
    ? Math.round((facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length) * 100) / 100
    : 0.2;

  return {
    provider: VISION_PROVIDER?.key ?? "none",
    analyzed: HAS_VISION_PROVIDER,
    photoCount: photos.length,
    kindCounts,
    dominantKind,
    objectScaleAvailable: hasRoomPhoto,
    roomType,
    sizeClass,
    dimensionRangeFt,
    visibleComponents,
    confirmedObservations,
    uncertainObservations,
    knownMeasurements,
    unknownMeasurements,
    conditionStatus,
    scopeCategories,
    facts,
    clarificationIds,
    unresolved,
    confidence,
    confidenceBand: bandFor(confidence),
    notes,
  };
}
