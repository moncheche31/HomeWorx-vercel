/**
 * Photo-based scale inference.
 *
 * This module answers one question: *given objects a human recognized in a
 * photo, roughly how big is this room?* It does no pricing, knows nothing about
 * assemblies, and never talks to the estimate engine directly — it emits
 * normalized measurements with provenance, and the ballpark engine consumes
 * those. That separation is deliberate: swap the way observations are gathered
 * (manual tagging today, something smarter later) and pricing is untouched.
 *
 * Four rules hold everywhere in here:
 *   1. An inferred number is never presented as a fact. It always carries a
 *      band, a confidence, the photos it came from and the references used.
 *   2. A human answer always beats an inference; an inference always beats an
 *      allowance.
 *   3. Geometry is axis-aware. A vertical reference (a door height, a switch
 *      height, a counter height) can never size a horizontal run. That single
 *      missing rule is what turned an 80 in door into a 6.7 ft wide garage.
 *   4. An implausible or contradictory result is rejected or forced to low
 *      confidence — never shown as a confident number.
 *
 * Pure functions. No React, no IO, no i18n lookups.
 */

import {
  scaleReferenceFor,
  type ScaleAxis,
  type ScaleReference,
} from "./scaleReferences";
import { footprintFor, type BallparkSizeClass } from "./intake";
import type { BallparkAnswers, BallparkConfidence } from "./types";

/* ------------------------------------------------------------------ *
 * What kind of image are we even looking at?
 * ------------------------------------------------------------------ */

/**
 * A floor plan is not a room photograph. Object-scale heuristics ("how many
 * dishwashers fit across") are meaningless on a sketch or a marketing
 * rendering, so they are never run on one.
 */
export const PHOTO_KINDS = [
  "room_photo",
  "detail_photo",
  "exterior",
  "sketch_plan",
  "rendering",
  "damage_photo",
  "unknown",
] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export function isPhotoKind(value: unknown): value is PhotoKind {
  return typeof value === "string" && (PHOTO_KINDS as readonly string[]).includes(value);
}

/** Only a real photograph supports standard-object calibration. */
export function supportsObjectScale(kind: PhotoKind): boolean {
  return kind === "room_photo";
}

/* ------------------------------------------------------------------ *
 * Provenance model
 * ------------------------------------------------------------------ */

export const MEASUREMENT_SOURCE_TYPES = [
  "confirmed", // verified on site or against a document
  "user_entered", // typed or spoken by the contractor
  "inferred", // derived from scale references in a photo
  "assumed", // documented allowance; nobody has looked
] as const;

export type MeasurementSourceType = (typeof MEASUREMENT_SOURCE_TYPES)[number];

/** How much a source type is trusted when two of them disagree. */
export const SOURCE_TYPE_RANK: Record<MeasurementSourceType, number> = {
  confirmed: 3,
  user_entered: 2,
  inferred: 1,
  assumed: 0,
};

export type MeasurementUnit = "ft" | "sf" | "lf" | "each";

export interface MeasurementEstimate {
  key: string;
  /** i18n key under the `ballpark` namespace. */
  labelKey: string;
  unit: MeasurementUnit;
  /** Midpoint. Only meaningful alongside `low`/`high`. */
  value: number;
  low: number;
  high: number;
  sourceType: MeasurementSourceType;
  /** 0–1, input quality only. Never a claim about vision or market accuracy. */
  confidence: number;
  confidenceBand: BallparkConfidence;
  /** Photos this rests on. Empty for allowances. */
  photoIds: string[];
  /** Scale references used, e.g. ["dishwasher", "baseCabinetDepth"]. */
  referenceKeys: string[];
  /** True once a human accepted or corrected the number. */
  confirmed: boolean;
  /** Plain-language derivation: "5 × 24 in dishwasher". */
  basis: string;
  /** True when computed from other measurements rather than observed. */
  derived: boolean;
}

/* ------------------------------------------------------------------ *
 * Observations
 * ------------------------------------------------------------------ */

/** The runs a photo observation can size. */
export const SCALE_TARGETS = [
  "roomLengthFt",
  "roomWidthFt",
  "ceilingHeightFt",
  "cabinetRunLf",
] as const;

export type ScaleTarget = (typeof SCALE_TARGETS)[number];

export const SCALE_TARGET_LABELS: Record<ScaleTarget, string> = {
  roomLengthFt: "inference.target.roomLengthFt",
  roomWidthFt: "inference.target.roomWidthFt",
  ceilingHeightFt: "inference.target.ceilingHeightFt",
  cabinetRunLf: "inference.target.cabinetRunLf",
};

/**
 * The axis each run lives on. Length, width and a cabinet run are measured
 * across the floor; a ceiling height is measured up the wall.
 */
export const TARGET_AXIS: Record<ScaleTarget, ScaleAxis> = {
  roomLengthFt: "horizontal",
  roomWidthFt: "horizontal",
  ceilingHeightFt: "vertical",
  cabinetRunLf: "horizontal",
};

export interface PhotoScaleObservation {
  photoId: string;
  /** A key from SCALE_REFERENCES. Unknown keys are ignored. */
  referenceKey: string;
  target: ScaleTarget;
  /** How many of the reference object span the run. Fractions allowed. */
  spans: number;
  /**
   * Advanced only. The contractor asserts the photo's perspective genuinely
   * supports using this reference across a different axis (e.g. a repeating
   * floor plank counted up a wall). Elevation references — a door height, a
   * switch height, a counter height — are still refused: their size says how
   * far something sits off the floor, not how wide the room is.
   */
  allowCrossAxis?: boolean;
}

/** An observation the engine refused, with the reason, for honest UI. */
export interface RejectedObservation {
  target: ScaleTarget;
  referenceKey: string;
  code:
    | "unknown-reference"
    | "invalid-spans"
    | "elevation-cross-axis"
    | "axis-mismatch"
    | "not-a-photograph"
    | "cabinets-not-confirmed"
    | "implausible-result";
  messageKey: string;
}

/** Fixtures/appliances a human counted in the photos. */
export interface PhotoComponentCount {
  key: string;
  labelKey: string;
  count: number;
  photoIds: string[];
}

/** Non-blocking issues the summary must show. */
export interface InferenceWarning {
  code: string;
  messageKey: string;
  severity: "error" | "warning";
}

/* ------------------------------------------------------------------ *
 * Tunables
 * ------------------------------------------------------------------ */

const RELIABILITY_WEIGHT: Record<ScaleReference["reliability"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** An inference never presents itself as certain, however many photos agree. */
export const MAX_INFERRED_CONFIDENCE = 0.8;
export const MIN_INFERRED_CONFIDENCE = 0.2;

/** Each additional agreeing observation narrows the band by this much. */
export const AGREEMENT_TIGHTEN_PCT = 12;
export const MAX_AGREEMENT_TIGHTEN_PCT = 30;

/** Spread applied to a size-class allowance when no photo evidence exists. */
export const ALLOWANCE_SPREAD_PCT = 20;

/** Ceiling-height allowance when nothing in the photos gives a height. */
export const DEFAULT_CEILING_FT = 8;

/** A cross-axis reference the contractor explicitly allowed is widened. */
export const CROSS_AXIS_SPREAD_MULTIPLIER = 1.35;

/**
 * Plausibility envelopes. Anything outside these is a calibration mistake, not
 * an unusual room, and is rejected rather than priced.
 */
export const PLAUSIBLE_RANGE: Record<string, { min: number; max: number }> = {
  roomLengthFt: { min: 5, max: 80 },
  roomWidthFt: { min: 5, max: 80 },
  ceilingHeightFt: { min: 6, max: 24 },
  cabinetRunLf: { min: 1, max: 80 },
};

/** Habitable-room floor areas below this need explicit confirmation. */
export const MIN_HABITABLE_FLOOR_AREA_SF = 60;

/** Room types where a sub-60 SF footprint is a red flag rather than normal. */
export const LARGE_ROOM_TYPES = ["garage", "basement", "living", "bedroom", "kitchen"];

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function bandFor(confidence: number): BallparkConfidence {
  if (confidence >= 0.65) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

/* ------------------------------------------------------------------ *
 * Inference
 * ------------------------------------------------------------------ */

/** Human-confirmed context that gates what may be inferred at all. */
export interface InferenceEvidence {
  /** From the photo questionnaire: obs.cabinetsPresent. */
  cabinetsPresent?: "yes" | "no" | "unclear" | null;
  /** From the interview: cabinets scope (none | reface | replace | unsure). */
  cabinetsScope?: string | null;
  /** Explicit backsplash evidence, when the contractor confirmed one. */
  backsplashPresent?: "yes" | "no" | "unclear" | null;
}

export interface PhotoInferenceInput {
  observations: PhotoScaleObservation[];
  components?: PhotoComponentCount[];
  /** Answered room type, when the contractor already picked one. */
  roomType?: string | null;
  /** Answered size class, used only as a fallback. */
  sizeClass?: string | null;
  photoIds?: string[];
  /**
   * What the uploaded images are. Object-scale heuristics only run on real
   * photographs; a sketch or rendering falls back to answers and allowances.
   */
  photoKind?: PhotoKind;
  evidence?: InferenceEvidence;
}

export interface PhotoInferenceResult {
  /** Keyed by measurement key (roomLengthFt, floorAreaSf, …). */
  measurements: Record<string, MeasurementEstimate>;
  components: PhotoComponentCount[];
  referenceKeys: string[];
  photoIds: string[];
  roomType: string | null;
  photoKind: PhotoKind;
  /** Size class implied by the inferred floor area, when there is one. */
  sizeClass: BallparkSizeClass | null;
  /** 0–1 across the whole inference. */
  confidence: number;
  confidenceBand: BallparkConfidence;
  /** True when at least one dimension came from a scale reference. */
  hasInferredDimensions: boolean;
  /** Observations the engine refused, and why. */
  rejected: RejectedObservation[];
  /** Plausibility and evidence problems. An `error` forces low confidence. */
  warnings: InferenceWarning[];
  evidence: InferenceEvidence;
}

interface Candidate {
  value: number;
  low: number;
  high: number;
  weight: number;
  photoId: string;
  referenceKey: string;
  basis: string;
  /** Height off the floor of the reference used, in feet. For guard checks. */
  referenceFt: number;
  isElevation: boolean;
}

type CandidateOutcome =
  | { ok: true; candidate: Candidate }
  | { ok: false; code: RejectedObservation["code"]; messageKey: string };

/**
 * Turn one observation into a candidate dimension, or refuse it.
 *
 * This is the guard that was missing: a reference only sizes a run on its own
 * axis. An elevation reference never sizes a horizontal run at all.
 */
export function candidateFor(observation: PhotoScaleObservation): CandidateOutcome {
  const reference = scaleReferenceFor(observation.referenceKey);
  if (!reference) {
    return { ok: false, code: "unknown-reference", messageKey: "inference.rejected.unknownReference" };
  }
  const spans = Number(observation.spans);
  if (!Number.isFinite(spans) || spans <= 0) {
    return { ok: false, code: "invalid-spans", messageKey: "inference.rejected.invalidSpans" };
  }

  const targetAxis = TARGET_AXIS[observation.target];
  const crossAxis = reference.axis !== targetAxis;

  if (crossAxis && reference.isElevation) {
    /* A door is 80 in tall. That says nothing about how wide the room is. */
    return {
      ok: false,
      code: "elevation-cross-axis",
      messageKey: "inference.rejected.elevationCrossAxis",
    };
  }
  if (crossAxis && !observation.allowCrossAxis) {
    return { ok: false, code: "axis-mismatch", messageKey: "inference.rejected.axisMismatch" };
  }

  const spread = crossAxis ? CROSS_AXIS_SPREAD_MULTIPLIER : 1;
  const value = (spans * reference.nominalIn) / 12;
  const low = value - ((value - (spans * reference.minIn) / 12) * spread);
  const high = value + (((spans * reference.maxIn) / 12 - value) * spread);

  return {
    ok: true,
    candidate: {
      value,
      low,
      high,
      weight: crossAxis
        ? Math.max(1, RELIABILITY_WEIGHT[reference.reliability] - 1)
        : RELIABILITY_WEIGHT[reference.reliability],
      photoId: observation.photoId,
      referenceKey: reference.key,
      basis: `${round1(spans)} × ${reference.nominalIn} in`,
      referenceFt: reference.nominalIn / 12,
      isElevation: Boolean(reference.isElevation),
    },
  };
}

function combine(
  key: string,
  labelKey: string,
  unit: MeasurementUnit,
  candidates: Candidate[],
): MeasurementEstimate | null {
  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  const value = candidates.reduce((sum, c) => sum + c.value * c.weight, 0) / totalWeight;
  let low = candidates.reduce((sum, c) => sum + c.low * c.weight, 0) / totalWeight;
  let high = candidates.reduce((sum, c) => sum + c.high * c.weight, 0) / totalWeight;

  /* Independent observations that agree earn a tighter band. */
  const tighten =
    Math.min(MAX_AGREEMENT_TIGHTEN_PCT, AGREEMENT_TIGHTEN_PCT * (candidates.length - 1)) / 100;
  low = value - (value - low) * (1 - tighten);
  high = value + (high - value) * (1 - tighten);

  /* Confidence: reference quality, penalized by how wide the band still is. */
  const avgWeight = totalWeight / candidates.length;
  const spreadPct = value > 0 ? (high - low) / value : 1;
  const raw = (avgWeight / 3) * 0.75 + (1 - clamp(spreadPct, 0, 0.5) * 2) * 0.15 + tighten * 0.5;
  const confidence = round1(clamp(raw, MIN_INFERRED_CONFIDENCE, MAX_INFERRED_CONFIDENCE) * 100) / 100;

  return {
    key,
    labelKey,
    unit,
    value: round1(value),
    low: round1(low),
    high: round1(high),
    sourceType: "inferred",
    confidence,
    confidenceBand: bandFor(confidence),
    photoIds: [...new Set(candidates.map((c) => c.photoId))],
    referenceKeys: [...new Set(candidates.map((c) => c.referenceKey))],
    confirmed: false,
    basis: candidates.map((c) => c.basis).join(" · "),
    derived: false,
  };
}

function allowance(
  key: string,
  labelKey: string,
  unit: MeasurementUnit,
  value: number,
  basis: string,
): MeasurementEstimate {
  const spread = (value * ALLOWANCE_SPREAD_PCT) / 100;
  return {
    key,
    labelKey,
    unit,
    value: round1(value),
    low: round1(value - spread),
    high: round1(value + spread),
    sourceType: "assumed",
    confidence: 0.2,
    confidenceBand: "low",
    photoIds: [],
    referenceKeys: [],
    confirmed: false,
    basis,
    derived: false,
  };
}

function derive(
  key: string,
  labelKey: string,
  unit: MeasurementUnit,
  parts: MeasurementEstimate[],
  compute: (pick: (m: MeasurementEstimate) => number) => number,
  basis: string,
): MeasurementEstimate {
  const sourceType: MeasurementSourceType = parts.some((p) => p.sourceType === "assumed")
    ? "assumed"
    : parts.every((p) => p.sourceType === "confirmed" || p.sourceType === "user_entered")
      ? "user_entered"
      : "inferred";

  return {
    key,
    labelKey,
    unit,
    value: round1(compute((m) => m.value)),
    low: round1(compute((m) => m.low)),
    high: round1(compute((m) => m.high)),
    sourceType,
    confidence: round1(Math.min(...parts.map((p) => p.confidence)) * 100) / 100,
    confidenceBand: bandFor(Math.min(...parts.map((p) => p.confidence))),
    photoIds: [...new Set(parts.flatMap((p) => p.photoIds))],
    referenceKeys: [...new Set(parts.flatMap((p) => p.referenceKeys))],
    confirmed: parts.every((p) => p.confirmed),
    basis,
    derived: true,
  };
}

/** Rough size class implied by a floor area. Used only to fill gaps. */
export function sizeClassFromArea(areaSf: number): BallparkSizeClass {
  if (areaSf < 90) return "small";
  if (areaSf < 170) return "medium";
  if (areaSf < 300) return "large";
  return "xlarge";
}

/** True when the contractor has actually confirmed cabinets exist. */
export function cabinetsConfirmed(evidence: InferenceEvidence | undefined): boolean {
  if (!evidence) return false;
  if (evidence.cabinetsPresent === "yes") return true;
  const scope = evidence.cabinetsScope ?? "";
  return scope !== "" && scope !== "none" && scope !== "unsure";
}

/** Backsplash needs kitchen-or-backsplash evidence *and* cabinets. */
export function backsplashSupported(
  roomType: string | null,
  evidence: InferenceEvidence | undefined,
): boolean {
  if (evidence?.backsplashPresent === "yes") return true;
  if (evidence?.backsplashPresent === "no") return false;
  return roomType === "kitchen" && cabinetsConfirmed(evidence);
}

/**
 * Turn recognized objects into approximate room dimensions.
 *
 * Anything the photos cannot support falls back to the documented size-class
 * allowance and is labeled `assumed`, so the caller can always tell which
 * numbers rest on evidence. Anything the photos cannot legitimately support —
 * a vertical ruler across a floor, a sketch treated as a photograph, a
 * backsplash nobody has seen — is refused outright and reported.
 */
export function inferMeasurements(input: PhotoInferenceInput): PhotoInferenceResult {
  const photoKind: PhotoKind = input.photoKind ?? "room_photo";
  const evidence: InferenceEvidence = input.evidence ?? {};
  const observations = input.observations ?? [];
  const byTarget = new Map<ScaleTarget, Candidate[]>();
  const rejected: RejectedObservation[] = [];
  const warnings: InferenceWarning[] = [];
  const hasCabinets = cabinetsConfirmed(evidence);

  for (const observation of observations) {
    if (!(SCALE_TARGETS as readonly string[]).includes(observation.target)) continue;

    /* A floor plan or rendering never gets object-scale heuristics. */
    if (!supportsObjectScale(photoKind)) {
      rejected.push({
        target: observation.target,
        referenceKey: observation.referenceKey,
        code: "not-a-photograph",
        messageKey: "inference.rejected.notAPhotograph",
      });
      continue;
    }

    /* A cabinet run cannot be inferred before cabinets are confirmed. */
    if (observation.target === "cabinetRunLf" && !hasCabinets) {
      rejected.push({
        target: observation.target,
        referenceKey: observation.referenceKey,
        code: "cabinets-not-confirmed",
        messageKey: "inference.rejected.cabinetsNotConfirmed",
      });
      continue;
    }

    const outcome = candidateFor(observation);
    if (!outcome.ok) {
      rejected.push({
        target: observation.target,
        referenceKey: observation.referenceKey,
        code: outcome.code,
        messageKey: outcome.messageKey,
      });
      continue;
    }
    const list = byTarget.get(observation.target) ?? [];
    list.push(outcome.candidate);
    byTarget.set(observation.target, list);
  }

  if (!supportsObjectScale(photoKind) && observations.length > 0) {
    warnings.push({
      code: "sketch-no-object-scale",
      messageKey: "inference.warning.sketchNoObjectScale",
      severity: "warning",
    });
  }
  if (rejected.some((r) => r.code === "elevation-cross-axis")) {
    warnings.push({
      code: "elevation-cross-axis",
      messageKey: "inference.warning.elevationCrossAxis",
      severity: "error",
    });
  }

  const measurements: Record<string, MeasurementEstimate> = {};
  const put = (estimate: MeasurementEstimate | null) => {
    if (estimate) measurements[estimate.key] = estimate;
  };

  put(combine("roomLengthFt", "inference.target.roomLengthFt", "ft", byTarget.get("roomLengthFt") ?? []));
  put(combine("roomWidthFt", "inference.target.roomWidthFt", "ft", byTarget.get("roomWidthFt") ?? []));
  put(
    combine("ceilingHeightFt", "inference.target.ceilingHeightFt", "ft", byTarget.get("ceilingHeightFt") ?? []),
  );
  put(combine("cabinetRunLf", "inference.target.cabinetRunLf", "lf", byTarget.get("cabinetRunLf") ?? []));

  /* Plausibility: an out-of-envelope value is a calibration error. Drop it. */
  for (const key of ["roomLengthFt", "roomWidthFt", "ceilingHeightFt", "cabinetRunLf"] as const) {
    const estimate = measurements[key];
    const envelope = PLAUSIBLE_RANGE[key];
    if (!estimate || !envelope) continue;
    if (estimate.value < envelope.min || estimate.value > envelope.max) {
      delete measurements[key];
      rejected.push({
        target: key,
        referenceKey: estimate.referenceKeys[0] ?? "",
        code: "implausible-result",
        messageKey: "inference.rejected.implausibleResult",
      });
      warnings.push({
        code: `implausible-${key}`,
        messageKey: "inference.warning.implausibleDimension",
        severity: "error",
      });
    }
  }

  const hasInferredDimensions = Boolean(measurements["roomLengthFt"] ?? measurements["roomWidthFt"]);

  /* Gaps fall back to the documented allowance rather than to silence. */
  const footprint = footprintFor(input.roomType ?? null, input.sizeClass ?? null);
  if (!measurements["roomLengthFt"] && footprint) {
    measurements["roomLengthFt"] = allowance(
      "roomLengthFt",
      "inference.target.roomLengthFt",
      "ft",
      footprint.lengthFt,
      "inference.basis.sizeClass",
    );
  }
  if (!measurements["roomWidthFt"] && footprint) {
    measurements["roomWidthFt"] = allowance(
      "roomWidthFt",
      "inference.target.roomWidthFt",
      "ft",
      footprint.widthFt,
      "inference.basis.sizeClass",
    );
  }
  if (!measurements["ceilingHeightFt"]) {
    measurements["ceilingHeightFt"] = allowance(
      "ceilingHeightFt",
      "inference.target.ceilingHeightFt",
      "ft",
      DEFAULT_CEILING_FT,
      "inference.basis.standardCeiling",
    );
  }

  const length = measurements["roomLengthFt"];
  const width = measurements["roomWidthFt"];
  const ceiling = measurements["ceilingHeightFt"]!;

  if (length && width) {
    const floor = derive(
      "floorAreaSf",
      "inference.target.floorAreaSf",
      "sf",
      [length, width],
      (pick) => pick(length) * pick(width),
      "inference.basis.lengthTimesWidth",
    );
    measurements["floorAreaSf"] = floor;

    const perimeter = derive(
      "perimeterLf",
      "inference.target.perimeterLf",
      "lf",
      [length, width],
      (pick) => 2 * (pick(length) + pick(width)),
      "inference.basis.perimeter",
    );
    measurements["perimeterLf"] = perimeter;

    measurements["wallAreaSf"] = derive(
      "wallAreaSf",
      "inference.target.wallAreaSf",
      "sf",
      [perimeter, ceiling],
      (pick) => pick(perimeter) * pick(ceiling),
      "inference.basis.perimeterTimesHeight",
    );
  }

  /* A cabinet run only survives when cabinets are actually confirmed. */
  if (measurements["cabinetRunLf"] && !hasCabinets) delete measurements["cabinetRunLf"];

  const cabinetRun = measurements["cabinetRunLf"];
  if (cabinetRun && backsplashSupported(input.roomType ?? null, evidence)) {
    /* Backsplash: the run times the standard 18 in counter-to-cabinet gap. */
    measurements["backsplashAreaSf"] = derive(
      "backsplashAreaSf",
      "inference.target.backsplashAreaSf",
      "sf",
      [cabinetRun],
      (pick) => pick(cabinetRun) * 1.5,
      "inference.basis.backsplash",
    );
  }

  const floorArea = measurements["floorAreaSf"];
  const sizeClass = floorArea ? sizeClassFromArea(floorArea.value) : null;

  warnings.push(...plausibilityWarnings(measurements, input.roomType ?? null));

  const evidenceValues = Object.values(measurements).filter((m) => m.sourceType === "inferred");
  let confidence = evidenceValues.length
    ? round1((evidenceValues.reduce((sum, m) => sum + m.confidence, 0) / evidenceValues.length) * 100) / 100
    : 0.2;
  if (warnings.some((w) => w.severity === "error")) confidence = MIN_INFERRED_CONFIDENCE;
  if (!supportsObjectScale(photoKind)) confidence = Math.min(confidence, 0.3);

  return {
    measurements,
    components: input.components ?? [],
    referenceKeys: [...new Set(observations.map((o) => o.referenceKey))].filter((key) =>
      Boolean(scaleReferenceFor(key)),
    ),
    photoIds: [...new Set([...(input.photoIds ?? []), ...observations.map((o) => o.photoId)])],
    roomType: input.roomType ?? null,
    photoKind,
    sizeClass,
    confidence,
    confidenceBand: bandFor(confidence),
    hasInferredDimensions,
    rejected,
    warnings,
    evidence,
  };
}

/**
 * Sanity checks on the finished numbers, independent of how they got here.
 *
 * A 43 SF "garage" is not an unusual garage — it is a calibration mistake, and
 * saying so is more useful than pricing it.
 */
function plausibilityWarnings(
  measurements: Record<string, MeasurementEstimate>,
  roomType: string | null,
): InferenceWarning[] {
  const warnings: InferenceWarning[] = [];
  const floor = measurements["floorAreaSf"];
  const length = measurements["roomLengthFt"];
  const width = measurements["roomWidthFt"];

  const evidenceBacked = (m?: MeasurementEstimate) =>
    Boolean(m) && m!.sourceType !== "assumed" && !m!.confirmed;

  if (
    floor &&
    floor.value < MIN_HABITABLE_FLOOR_AREA_SF &&
    (roomType === null || LARGE_ROOM_TYPES.includes(roomType)) &&
    !floor.confirmed
  ) {
    warnings.push({
      code: "tiny-floor-area",
      messageKey: "inference.warning.tinyFloorArea",
      severity: "error",
    });
  }

  /*
   * Length ≈ width ≈ a standard door height is the signature of the exact bug
   * this module now refuses: a vertical ruler used across the floor.
   */
  if (
    evidenceBacked(length) &&
    evidenceBacked(width) &&
    Math.abs(length!.value - width!.value) < 0.6 &&
    Math.abs(length!.value - 80 / 12) < 0.6
  ) {
    warnings.push({
      code: "door-height-calibration",
      messageKey: "inference.warning.doorHeightCalibration",
      severity: "error",
    });
  }

  return warnings;
}

/* ------------------------------------------------------------------ *
 * Correcting an inference — never a restart
 * ------------------------------------------------------------------ */

/**
 * Accept an inferred value as-is. It keeps its photo provenance but becomes a
 * confirmed number, so later refinements stop widening the range for it.
 */
export function confirmMeasurement(
  result: PhotoInferenceResult,
  key: string,
): PhotoInferenceResult {
  const existing = result.measurements[key];
  if (!existing || existing.confirmed) return result;
  return recompute({
    ...result,
    measurements: {
      ...result.measurements,
      [key]: { ...existing, sourceType: "confirmed", confidence: 1, confidenceBand: "high", confirmed: true },
    },
  });
}

/**
 * Replace an inferred value with a number the contractor typed. The photo IDs
 * stay attached for the audit trail; the source type becomes user_entered.
 */
export function adjustMeasurement(
  result: PhotoInferenceResult,
  key: string,
  value: number,
): PhotoInferenceResult {
  const existing = result.measurements[key];
  if (!existing || !Number.isFinite(value) || value <= 0) return result;
  return recompute({
    ...result,
    measurements: {
      ...result.measurements,
      [key]: {
        ...existing,
        value: round1(value),
        low: round1(value),
        high: round1(value),
        sourceType: "user_entered",
        confidence: 1,
        confidenceBand: "high",
        confirmed: true,
        basis: "inference.basis.userEntered",
      },
    },
  });
}

/** Re-run the derived measurements after a correction. */
function recompute(result: PhotoInferenceResult): PhotoInferenceResult {
  const m = { ...result.measurements };
  const length = m["roomLengthFt"];
  const width = m["roomWidthFt"];
  const ceiling = m["ceilingHeightFt"];

  if (length && width) {
    m["floorAreaSf"] = derive(
      "floorAreaSf",
      "inference.target.floorAreaSf",
      "sf",
      [length, width],
      (pick) => pick(length) * pick(width),
      "inference.basis.lengthTimesWidth",
    );
    const perimeter = derive(
      "perimeterLf",
      "inference.target.perimeterLf",
      "lf",
      [length, width],
      (pick) => 2 * (pick(length) + pick(width)),
      "inference.basis.perimeter",
    );
    m["perimeterLf"] = perimeter;
    if (ceiling) {
      m["wallAreaSf"] = derive(
        "wallAreaSf",
        "inference.target.wallAreaSf",
        "sf",
        [perimeter, ceiling],
        (pick) => pick(perimeter) * pick(ceiling),
        "inference.basis.perimeterTimesHeight",
      );
    }
  }

  const cabinetRun = m["cabinetRunLf"];
  if (cabinetRun && backsplashSupported(result.roomType, result.evidence)) {
    m["backsplashAreaSf"] = derive(
      "backsplashAreaSf",
      "inference.target.backsplashAreaSf",
      "sf",
      [cabinetRun],
      (pick) => pick(cabinetRun) * 1.5,
      "inference.basis.backsplash",
    );
  } else {
    delete m["backsplashAreaSf"];
  }

  const floorArea = m["floorAreaSf"];
  /* Corrections can clear a plausibility error, so the checks re-run. */
  const structural = result.warnings.filter(
    (w) => !w.code.startsWith("implausible-") && w.code !== "tiny-floor-area" && w.code !== "door-height-calibration",
  );
  const warnings = [...structural, ...plausibilityWarnings(m, result.roomType)];

  const evidence = Object.values(m).filter(
    (item) => item.sourceType === "inferred" || item.sourceType === "user_entered" || item.sourceType === "confirmed",
  );
  let confidence = evidence.length
    ? round1((evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length) * 100) / 100
    : result.confidence;
  if (warnings.some((w) => w.severity === "error")) confidence = MIN_INFERRED_CONFIDENCE;
  if (!supportsObjectScale(result.photoKind)) confidence = Math.min(confidence, 0.3);

  return {
    ...result,
    measurements: m,
    warnings,
    sizeClass: floorArea ? sizeClassFromArea(floorArea.value) : result.sizeClass,
    confidence,
    confidenceBand: bandFor(confidence),
  };
}

/* ------------------------------------------------------------------ *
 * Normalization for the pricing engine
 * ------------------------------------------------------------------ */

/** The measurement keys the ballpark engine understands, in answer-id terms. */
const ANSWER_KEY_BY_MEASUREMENT: Record<string, string> = {
  roomLengthFt: "lengthFt",
  roomWidthFt: "widthFt",
  ceilingHeightFt: "ceilingHeightFt",
};

/**
 * The only bridge between photo analysis and pricing: normalized answers.
 *
 * Allowance-grade values are deliberately left out — the engine already has its
 * own documented size-class fallback, and passing an allowance through here
 * would disguise it as evidence. Values under an unresolved plausibility error
 * are left out for the same reason.
 */
export function measurementsToAnswers(result: PhotoInferenceResult): BallparkAnswers {
  const answers: BallparkAnswers = {};
  const blocked = result.warnings.some((w) => w.severity === "error");
  for (const [measurementKey, answerId] of Object.entries(ANSWER_KEY_BY_MEASUREMENT)) {
    const estimate = result.measurements[measurementKey];
    if (!estimate || estimate.sourceType === "assumed") continue;
    /* A flagged inference must not silently price the job. A human-entered or
       confirmed value still may — the contractor stands behind it. */
    if (blocked && estimate.sourceType === "inferred") continue;
    answers[answerId] = { status: "answered", value: estimate.value, transcript: null };
  }
  const sizeClass = result.sizeClass;
  if (sizeClass && result.hasInferredDimensions && !blocked) {
    answers["sizeClass"] = { status: "answered", value: sizeClass, transcript: null };
  }
  return answers;
}

/** Measurements worth showing in the Photo Inference Summary, in order. */
export const SUMMARY_MEASUREMENT_ORDER = [
  "roomLengthFt",
  "roomWidthFt",
  "ceilingHeightFt",
  "floorAreaSf",
  "perimeterLf",
  "wallAreaSf",
  "cabinetRunLf",
  "backsplashAreaSf",
];

export function summaryMeasurements(result: PhotoInferenceResult): MeasurementEstimate[] {
  return SUMMARY_MEASUREMENT_ORDER.flatMap((key) => {
    const estimate = result.measurements[key];
    return estimate ? [estimate] : [];
  });
}
