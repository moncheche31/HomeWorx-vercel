/**
 * The shared multi-input ballpark: one engine, three intake paths.
 *
 * `buildBallpark` already turns answers into a priced band. This layer adds
 * what a remote or narrative intake needs: mapping short interviews onto the
 * engine's answer ids, an explicit input ledger, high-impact price risks, and
 * extra band widening so a photo-only ballpark can never look as certain as a
 * measured walkthrough.
 */

import { buildBallpark, MAX_UNKNOWN_WIDEN_PCT } from "./range";
import {
  completenessPct,
  mapIntakeAnswers,
  observationsFromAnswers,
  pruneAnswersToQuestionIds,
  risksFor,
  type BallparkImpact,
  type BallparkInputLedger,
  type BallparkInputRecord,
  type BallparkIntakeSource,
  type BallparkPhotoObservation,
} from "./intake";
import {
  measurementsToAnswers,
  summaryMeasurements,
  type PhotoInferenceResult,
} from "./photoInference";
import { disclaimersFor, type BallparkDisclaimerTemplate } from "./disclaimer";
import type { BallparkAnswers, BallparkConfidence, BallparkResult } from "./types";
import type { BallparkRangeOptions } from "./range";

/** Extra widening for what an intake path structurally cannot know. */
export const SOURCE_WIDEN_PCT: Record<BallparkIntakeSource, number> = {
  onsite: 0,
  photos: 12,
  description: 15,
};

/** Added when the footprint came from a size class instead of a measurement. */
export const ASSUMED_FOOTPRINT_WIDEN_PCT = 10;

/**
 * Added when the footprint came from photo scale references. Lower than a bare
 * size-class allowance (there is evidence) but never zero (there is no tape).
 */
export const INFERRED_FOOTPRINT_WIDEN_PCT = 6;

/** Hard ceiling on total widening, unknowns included. */
export const MAX_TOTAL_WIDEN_PCT = 45;

/** A remote intake never claims high confidence, however complete it is. */
export const MAX_CONFIDENCE: Record<BallparkIntakeSource, BallparkConfidence> = {
  onsite: "high",
  photos: "medium",
  description: "medium",
};

const RANK: Record<BallparkConfidence, number> = { low: 0, medium: 1, high: 2 };

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const roundDown = (v: number) => Math.floor(v / 50) * 50;
const roundUp = (v: number) => Math.ceil(v / 50) * 50;

export interface MultiInputBallparkInput {
  source: BallparkIntakeSource;
  answers: BallparkAnswers;
  /** Free text from the "Describe your project" path. */
  description?: string | null;
  /** How many photos the contractor attached (photo path). Never measured. */
  photoCount?: number;
  /**
   * Normalized photo scale inference. The engine consumes measurements and
   * provenance only — never raw image output.
   */
  inference?: PhotoInferenceResult | null;
  options?: BallparkRangeOptions;
}

export interface MultiInputBallparkResult extends BallparkResult {
  source: BallparkIntakeSource;
  ledger: BallparkInputLedger;
  observations: BallparkPhotoObservation[];
  disclaimers: BallparkDisclaimerTemplate[];
  /** Widening added on top of unknowns because of the intake path. */
  sourceWidenPct: number;
  totalWidenPct: number;
  footprintAssumed: boolean;
  /** True when the footprint came from photo scale references. */
  footprintInferred: boolean;
  inference: PhotoInferenceResult | null;
  description: string | null;
  photoCount: number;
}


function record(
  key: string,
  labelKey: string,
  value: string,
  category: BallparkInputRecord["category"],
  origin: BallparkInputRecord["origin"],
  confidence: BallparkConfidence,
  impact: BallparkImpact,
  extra: Partial<BallparkInputRecord> = {},
): BallparkInputRecord {
  return {
    key,
    labelKey,
    value,
    category,
    origin,
    confidence,
    impact,
    editable: true,
    basis: null,
    questionId: null,
    ...extra,
  };
}

const UNIT_SUFFIX: Record<string, string> = { ft: "ft", sf: "SF", lf: "LF", each: "ea" };

/** "12.5 ft (10.2–14.1)" — the band travels with the number, always. */
function formatEstimate(value: number, low: number, high: number, unit: string): string {
  const suffix = UNIT_SUFFIX[unit] ?? unit;
  if (low === high) return `${value} ${suffix}`;
  return `${value} ${suffix} (${low}–${high})`;
}

export interface LedgerOptions {
  footprintAssumed: boolean;
  footprintInferred?: boolean;
  inference?: PhotoInferenceResult | null;
}

/**
 * File every value the estimate used into a bucket. Nothing the engine used is
 * allowed to be invisible here, and an inferred number never sits in the same
 * bucket as a measured one.
 */
export function buildLedger(
  result: BallparkResult,
  source: BallparkIntakeSource,
  answers: BallparkAnswers,
  options: LedgerOptions,
): BallparkInputLedger {
  const { footprintAssumed, footprintInferred = false, inference = null } = options;
  const known: BallparkInputRecord[] = [];
  const measured: BallparkInputRecord[] = [];
  const observed: BallparkInputRecord[] = [];
  const inferred: BallparkInputRecord[] = [];
  const assumed: BallparkInputRecord[] = [];
  const unknown: BallparkInputRecord[] = [];

  const dimensionKeys = new Set(["dimensions", "ceilingHeight", "floorArea", "perimeter", "wallArea"]);
  /* Photo-scaled dimensions are reported from the inference block instead. */
  const skipDimensions = footprintInferred;

  for (const assumption of result.assumptions) {
    const isDimension = dimensionKeys.has(assumption.key);
    if (isDimension && skipDimensions) continue;
    const target =
      assumption.source === "answered"
        ? isDimension && !footprintAssumed
          ? measured
          : known
        : assumption.source === "derived" && !footprintAssumed && isDimension
          ? measured
          : assumed;

    target.push(
      record(
        assumption.key,
        assumption.labelKey,
        assumption.value,
        target === measured ? "measured" : target === known ? "known" : "assumed",
        assumption.source === "answered" ? source : "system",
        target === assumed ? "low" : "high",
        isDimension ? "high" : "medium",
        { basis: assumption.basis ?? null, questionId: assumption.questionId ?? null },
      ),
    );
  }

  if (inference) {
    for (const estimate of summaryMeasurements(inference)) {
      const isEvidence = estimate.sourceType !== "assumed";
      const bucket = estimate.sourceType === "assumed" ? assumed : inferred;
      bucket.push(
        record(
          `inference.${estimate.key}`,
          estimate.labelKey,
          formatEstimate(estimate.value, estimate.low, estimate.high, estimate.unit),
          isEvidence ? "inferred" : "assumed",
          isEvidence ? "photos" : "system",
          estimate.confidenceBand,
          "high",
          {
            basis: estimate.basis,
            provenance: {
              sourceType: estimate.sourceType,
              photoIds: estimate.photoIds,
              referenceKeys: estimate.referenceKeys,
              confirmed: estimate.confirmed,
              confidenceScore: estimate.confidence,
            },
          },
        ),
      );
    }
  }

  for (const observation of observationsFromAnswers(answers)) {
    observed.push(
      record(
        observation.key,
        observation.labelKey,
        observation.value,
        "observed",
        "photos",
        observation.value === "unclear" ? "low" : "medium",
        observation.impact,
        { basis: "photo, confirmed by user" },
      ),
    );
  }

  for (const item of result.unknowns) {
    unknown.push(
      record(
        item.questionId,
        item.promptKey,
        `+${item.widenPct}%`,
        "unknown",
        "system",
        "low",
        item.widenPct >= 6 ? "high" : "medium",
        { questionId: item.questionId },
      ),
    );
  }

  return {
    source,
    known,
    measured,
    observed,
    inferred,
    assumed,
    unknown,
    risks: risksFor(answers, source, footprintAssumed, footprintInferred),
    completenessPct: completenessPct(answers),
  };
}

/** Confidence is capped by the intake path and by input completeness. */
export function multiInputConfidence(
  base: BallparkConfidence,
  source: BallparkIntakeSource,
  completeness: number,
  footprintAssumed: boolean,
  footprintInferred = false,
): BallparkConfidence {
  let level = RANK[base];
  level = Math.min(level, RANK[MAX_CONFIDENCE[source]]);
  if (footprintAssumed) level = Math.min(level, RANK.low);
  /* Photo evidence keeps a ballpark out of "low", but never above "medium". */
  if (footprintInferred) level = Math.min(level, RANK.medium);
  if (completeness < 50) level = Math.min(level, footprintInferred ? RANK.medium : RANK.low);
  else if (completeness < 80) level = Math.min(level, RANK.medium);
  return (Object.keys(RANK) as BallparkConfidence[]).find((k) => RANK[k] === level) ?? "low";
}

/**
 * The one entry point every intake path calls. Deterministic and idempotent:
 * the same answers always produce the same band, ledger and disclaimers.
 */
export function buildMultiInputBallpark(
  input: MultiInputBallparkInput,
): MultiInputBallparkResult {
  const inference = input.inference ?? null;

  /*
   * The only place photo analysis touches pricing: normalized answers. A value
   * the contractor typed always wins over an inference.
   */
  const answered = (id: string) => {
    const a = input.answers[id];
    return a?.status === "answered" && a.value !== undefined && a.value !== "";
  };
  const allowedQuestionIds = input.options?.schema?.questions.map((question) => question.id);
  const seeded: BallparkAnswers = { ...input.answers };
  if (inference) {
    for (const [id, answer] of Object.entries(measurementsToAnswers(inference))) {
      if (!allowedQuestionIds || allowedQuestionIds.includes(id)) {
        if (!answered(id)) seeded[id] = answer;
      }
    }
  }

  const { answers: mapped, footprintAssumed } = mapIntakeAnswers(seeded, input.source, allowedQuestionIds);
  const footprintInferred = Boolean(
    inference?.hasInferredDimensions &&
      (!allowedQuestionIds || (allowedQuestionIds.includes("lengthFt") && allowedQuestionIds.includes("widthFt"))) &&
      !answered("lengthFt") &&
      !answered("widthFt"),
  );
  const scopedAnswers = pruneAnswersToQuestionIds(mapped, allowedQuestionIds);
  const base = buildBallpark(scopedAnswers, input.options ?? {});

  const footprintWiden = footprintAssumed
    ? ASSUMED_FOOTPRINT_WIDEN_PCT
    : footprintInferred
      ? INFERRED_FOOTPRINT_WIDEN_PCT
      : 0;
  const sourceWidenPct = round2(SOURCE_WIDEN_PCT[input.source] + footprintWiden);
  const totalWidenPct = Math.min(MAX_TOTAL_WIDEN_PCT, round2(base.unknownWidenPct + sourceWidenPct));
  const extra = Math.max(0, totalWidenPct - base.unknownWidenPct);

  const band = {
    low: roundDown(base.band.low * (1 - extra / 100)),
    expected: base.band.expected,
    high: roundUp(base.band.high * (1 + extra / 100)),
  };

  const ledger = buildLedger(base, input.source, scopedAnswers,
  {
    footprintAssumed,
    footprintInferred,
    inference,
  });
  const confidence = multiInputConfidence(
    base.confidence,
    input.source,
    ledger.completenessPct,
    footprintAssumed,
    footprintInferred,
  );

  const warnings = [...base.warnings];
  if (footprintAssumed) {
    warnings.push({ code: "assumed-footprint", messageKey: "warning.assumedFootprint" });
  }
  if (footprintInferred) {
    warnings.push({ code: "inferred-footprint", messageKey: "warning.inferredFootprint" });
  }
  if (input.source === "photos") {
    warnings.push({ code: "photo-inference", messageKey: "warning.photoInference" });
  }

  return {
    ...base,
    band,
    confidence,
    warnings,
    source: input.source,
    ledger,
    observations: observationsFromAnswers(scopedAnswers),
    disclaimers: disclaimersFor(input.source),
    sourceWidenPct,
    totalWidenPct,
    footprintAssumed,
    footprintInferred,
    inference,
    description: input.description ?? null,
    photoCount: input.photoCount ?? 0,
  };
}


export { MAX_UNKNOWN_WIDEN_PCT };
