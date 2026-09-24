/**
 * Multi-Input Ballpark — shared intake model.
 *
 * One ballpark engine, three ways in: an on-site walkthrough, a photo package
 * (realtor renderings and remote ballparks), or a spoken/typed description.
 * Whatever the path, every value used by the estimate is filed into one of six
 * buckets — known, measured, observed, assumed, unknown, risk — so the
 * contractor can always see what the number rests on.
 *
 * Pure data + pure functions. No React, no IO, no i18n lookups.
 */

import type { BallparkAnswers, BallparkConfidence } from "./types";

/* ------------------------------------------------------------------ *
 * Intake source
 * ------------------------------------------------------------------ */

export const BALLPARK_INTAKE_SOURCES = ["onsite", "photos", "description"] as const;
export type BallparkIntakeSource = (typeof BALLPARK_INTAKE_SOURCES)[number];

export function isIntakeSource(value: unknown): value is BallparkIntakeSource {
  return typeof value === "string" && (BALLPARK_INTAKE_SOURCES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ *
 * Ledger
 * ------------------------------------------------------------------ */

export type BallparkFactCategory =
  | "known" // stated by the contractor and not a measurement
  | "measured" // a real dimension the contractor or the project supplied
  | "observed" // read off a photo and confirmed by a human
  | "inferred" // derived from standard-object scale references in a photo
  | "assumed" // the app filled it in from a documented allowance
  | "unknown" // nobody knows yet; widens the range
  | "risk"; // known unknown with outsized price impact

export type BallparkImpact = "high" | "medium" | "low";

/** Provenance carried by an inferred or corrected measurement. */
export interface BallparkRecordProvenance {
  /** confirmed | user_entered | inferred | assumed */
  sourceType: string;
  /** Photos the value rests on. */
  photoIds?: string[];
  /** Scale references used, e.g. ["dishwasher"]. */
  referenceKeys?: string[];
  /** True once a human accepted or corrected the value. */
  confirmed?: boolean;
  /** 0–1 input-quality score. */
  confidenceScore?: number;
}

export interface BallparkInputRecord {
  key: string;
  /** i18n key under the `ballpark` namespace. */
  labelKey: string;
  /** Already-formatted display value. */
  value: string;
  category: BallparkFactCategory;
  /** Where the value entered the system. */
  origin: BallparkIntakeSource | "system";
  confidence: BallparkConfidence;
  impact: BallparkImpact;
  /** True when the contractor can change it without restarting. */
  editable: boolean;
  /** Plain-language derivation ("50% of 68 LF perimeter"). */
  basis?: string | null;
  /** Question to jump to when the contractor taps it. */
  questionId?: string | null;
  /** Present for photo-inferred values. */
  provenance?: BallparkRecordProvenance | null;
}

export interface BallparkRisk {
  key: string;
  labelKey: string;
  noteKey: string;
  impact: BallparkImpact;
}

export interface BallparkInputLedger {
  source: BallparkIntakeSource;
  known: BallparkInputRecord[];
  measured: BallparkInputRecord[];
  observed: BallparkInputRecord[];
  /** Photo-derived approximations. Never mixed in with measurements. */
  inferred: BallparkInputRecord[];
  assumed: BallparkInputRecord[];
  unknown: BallparkInputRecord[];
  risks: BallparkRisk[];
  /** 0–100. Input completeness only — never a claim about market accuracy. */
  completenessPct: number;
}


/* ------------------------------------------------------------------ *
 * Size classes — the photo/description substitute for a tape measure.
 * These are allowances, never presented as measurements.
 * ------------------------------------------------------------------ */

export type BallparkSizeClass = "small" | "medium" | "large" | "xlarge";

export interface Footprint {
  lengthFt: number;
  widthFt: number;
}

/** Fallback footprints when the room type is unknown. */
export const SIZE_CLASS_FOOTPRINT: Record<BallparkSizeClass, Footprint> = {
  small: { lengthFt: 10, widthFt: 10 },
  medium: { lengthFt: 12, widthFt: 14 },
  large: { lengthFt: 16, widthFt: 18 },
  xlarge: { lengthFt: 20, widthFt: 24 },
};

/** Room-type specific footprints. Documented allowances, not observations. */
export const ROOM_TYPE_FOOTPRINT: Record<string, Record<BallparkSizeClass, Footprint>> = {
  bathroom: {
    small: { lengthFt: 5, widthFt: 8 },
    medium: { lengthFt: 6, widthFt: 9 },
    large: { lengthFt: 8, widthFt: 12 },
    xlarge: { lengthFt: 10, widthFt: 14 },
  },
  kitchen: {
    small: { lengthFt: 8, widthFt: 10 },
    medium: { lengthFt: 10, widthFt: 12 },
    large: { lengthFt: 12, widthFt: 16 },
    xlarge: { lengthFt: 14, widthFt: 20 },
  },
  bedroom: {
    small: { lengthFt: 10, widthFt: 10 },
    medium: { lengthFt: 11, widthFt: 12 },
    large: { lengthFt: 13, widthFt: 15 },
    xlarge: { lengthFt: 15, widthFt: 18 },
  },
  living: {
    small: { lengthFt: 12, widthFt: 12 },
    medium: { lengthFt: 14, widthFt: 16 },
    large: { lengthFt: 16, widthFt: 20 },
    xlarge: { lengthFt: 20, widthFt: 24 },
  },
  garage: {
    small: { lengthFt: 11, widthFt: 20 },
    medium: { lengthFt: 16, widthFt: 18 },
    large: { lengthFt: 20, widthFt: 20 },
    xlarge: { lengthFt: 22, widthFt: 24 },
  },
  basement: {
    small: { lengthFt: 14, widthFt: 16 },
    medium: { lengthFt: 20, widthFt: 22 },
    large: { lengthFt: 24, widthFt: 30 },
    xlarge: { lengthFt: 28, widthFt: 36 },
  },
  other: SIZE_CLASS_FOOTPRINT,
};

export function footprintFor(roomType: string | null, sizeClass: string | null): Footprint | null {
  const size = (sizeClass ?? "") as BallparkSizeClass;
  if (!SIZE_CLASS_FOOTPRINT[size]) return null;
  const table = roomType ? ROOM_TYPE_FOOTPRINT[roomType] : undefined;
  return table?.[size] ?? SIZE_CLASS_FOOTPRINT[size];
}

/* ------------------------------------------------------------------ *
 * Photo observations — what a human can confirm from an image.
 * Deliberately contains nothing dimensional: the app never invents a
 * measurement from a photo.
 * ------------------------------------------------------------------ */

export interface BallparkPhotoObservation {
  key: string;
  labelKey: string;
  value: "yes" | "no" | "unclear";
  /** An observation only counts once a human confirms it. */
  confirmedByUser: boolean;
  impact: BallparkImpact;
}

export const PHOTO_OBSERVATION_PROMPTS: {
  key: string;
  labelKey: string;
  impact: BallparkImpact;
}[] = [
  { key: "cabinetsPresent", labelKey: "obs.cabinetsPresent", impact: "high" },
  { key: "plumbingFixturesVisible", labelKey: "obs.plumbingFixturesVisible", impact: "high" },
  { key: "flooringToReplace", labelKey: "obs.flooringToReplace", impact: "medium" },
  { key: "wallsFinished", labelKey: "obs.wallsFinished", impact: "medium" },
  { key: "ceilingFinished", labelKey: "obs.ceilingFinished", impact: "low" },
  { key: "visibleDamage", labelKey: "obs.visibleDamage", impact: "high" },
  { key: "windowsInView", labelKey: "obs.windowsInView", impact: "low" },
];

/** Observations are stored as ordinary answers under this prefix. */
export const OBSERVATION_PREFIX = "obs.";

export function observationsFromAnswers(answers: BallparkAnswers): BallparkPhotoObservation[] {
  return PHOTO_OBSERVATION_PROMPTS.flatMap((prompt) => {
    const answer = answers[`${OBSERVATION_PREFIX}${prompt.key}`];
    if (!answer || answer.status !== "answered") return [];
    const raw = String(answer.value ?? "");
    const value = raw === "yes" || raw === "no" ? raw : "unclear";
    return [
      {
        key: prompt.key,
        labelKey: prompt.labelKey,
        value,
        confirmedByUser: true,
        impact: prompt.impact,
      } satisfies BallparkPhotoObservation,
    ];
  });
}

/* ------------------------------------------------------------------ *
 * High-impact price risks
 * ------------------------------------------------------------------ */

interface RiskRule {
  key: string;
  labelKey: string;
  noteKey: string;
  impact: BallparkImpact;
  when: (
    answers: BallparkAnswers,
    source: BallparkIntakeSource,
    footprintAssumed: boolean,
    footprintInferred: boolean,
  ) => boolean;

}

const answerValue = (answers: BallparkAnswers, id: string): string => {
  const a = answers[id];
  return a?.status === "answered" && a.value != null ? String(a.value) : "";
};

export const RISK_RULES: RiskRule[] = [
  {
    key: "plumbingRelocation",
    labelKey: "risk.plumbingRelocation",
    noteKey: "risk.plumbingRelocationNote",
    impact: "high",
    when: (a) => ["moderate", "major", "yes", "unsure"].includes(answerValue(a, "plumbing")) ||
      ["yes", "unsure"].includes(answerValue(a, "plumbingRelocation")),
  },
  {
    key: "structural",
    labelKey: "risk.structural",
    noteKey: "risk.structuralNote",
    impact: "high",
    when: (a) => ["yes", "unsure"].includes(answerValue(a, "wallRemoval")),
  },
  {
    key: "concealedConditions",
    labelKey: "risk.concealedConditions",
    noteKey: "risk.concealedConditionsNote",
    impact: "high",
    when: (_a, source) => source !== "onsite",
  },
  {
    key: "electricalService",
    labelKey: "risk.electricalService",
    noteKey: "risk.electricalServiceNote",
    impact: "medium",
    when: (a) => ["panel", "unsure"].includes(answerValue(a, "electrical")),
  },
  {
    key: "permits",
    labelKey: "risk.permits",
    noteKey: "risk.permitsNote",
    impact: "medium",
    when: () => true,
  },
  {
    key: "selections",
    labelKey: "risk.selections",
    noteKey: "risk.selectionsNote",
    impact: "medium",
    when: (a) => answerValue(a, "finishLevel") === "" || answerValue(a, "cabinets") === "unsure",
  },
  {
    key: "access",
    labelKey: "risk.access",
    noteKey: "risk.accessNote",
    impact: "low",
    when: (_a, source) => source !== "onsite",
  },
  {
    key: "assumedFootprint",
    labelKey: "risk.assumedFootprint",
    noteKey: "risk.assumedFootprintNote",
    impact: "high",
    when: (a, _source, footprintAssumed, footprintInferred) =>
      !footprintInferred &&
      (footprintAssumed || answerValue(a, "lengthFt") === "" || answerValue(a, "widthFt") === ""),
  },
  {
    /* A photo-scaled footprint is real evidence, but it is still not a tape. */
    key: "inferredFootprint",
    labelKey: "risk.inferredFootprint",
    noteKey: "risk.inferredFootprintNote",
    impact: "high",
    when: (_a, _source, _footprintAssumed, footprintInferred) => footprintInferred,
  },
];

export function risksFor(
  answers: BallparkAnswers,
  source: BallparkIntakeSource,
  /** True when the footprint came from a size-class allowance, not a measurement. */
  footprintAssumed = false,
  /** True when the footprint came from photo scale references. */
  footprintInferred = false,
): BallparkRisk[] {
  return RISK_RULES.filter((rule) =>
    rule.when(answers, source, footprintAssumed, footprintInferred),
  ).map(({ key, labelKey, noteKey, impact }) => ({ key, labelKey, noteKey, impact }));
}


/* ------------------------------------------------------------------ *
 * Intake answers → engine answers
 * ------------------------------------------------------------------ */

export interface MappedIntake {
  answers: BallparkAnswers;
  /** Answer ids the mapper filled in (never measurements). */
  injectedKeys: string[];
  /** True when the footprint came from a size class, not a measurement. */
  footprintAssumed: boolean;
}

const allowedSet = (allowedQuestionIds?: readonly string[]): Set<string> | null =>
  allowedQuestionIds ? new Set(allowedQuestionIds) : null;

export function pruneAnswersToQuestionIds(
  answers: BallparkAnswers,
  allowedQuestionIds?: readonly string[],
): BallparkAnswers {
  const allowed = allowedSet(allowedQuestionIds);
  if (!allowed) return { ...answers };
  return Object.fromEntries(Object.entries(answers).filter(([id]) => allowed.has(id)));
}

const canUse = (allowed: Set<string> | null, id: string): boolean => !allowed || allowed.has(id);

const set = (
  answers: BallparkAnswers,
  id: string,
  value: string | number,
  injected: string[],
  allowed: Set<string> | null = null,
) => {
  if (!canUse(allowed, id)) return;
  const existing = answers[id];
  if (existing?.status === "answered" && existing.value !== undefined && existing.value !== "") return;
  answers[id] = { status: "answered", value, transcript: null };
  injected.push(id);
};

/**
 * Translate the short photo/description interviews into the answer ids the
 * shared engine understands. Contractor answers always win; this only fills
 * gaps, and every fill is reported back in `injectedKeys`.
 */
export function mapIntakeAnswers(
  input: BallparkAnswers,
  source: BallparkIntakeSource,
  allowedQuestionIds?: readonly string[],
): MappedIntake {
  const allowed = allowedSet(allowedQuestionIds);
  const answers: BallparkAnswers = pruneAnswersToQuestionIds(input, allowedQuestionIds);
  const injectedKeys: string[] = [];

  const roomType = canUse(allowed, "roomType") ? answerValue(answers, "roomType") || null : null;
  const sizeClass = canUse(allowed, "sizeClass") ? answerValue(answers, "sizeClass") || null : null;

  const hasLength = canUse(allowed, "lengthFt") && answerValue(answers, "lengthFt") !== "";
  const hasWidth = canUse(allowed, "widthFt") && answerValue(answers, "widthFt") !== "";
  let footprintAssumed = false;

  if ((!hasLength || !hasWidth) && sizeClass && canUse(allowed, "lengthFt") && canUse(allowed, "widthFt")) {
    const footprint = footprintFor(roomType, sizeClass);
    if (footprint) {
      set(answers, "lengthFt", footprint.lengthFt, injectedKeys, allowed);
      set(answers, "widthFt", footprint.widthFt, injectedKeys, allowed);
      footprintAssumed = true;
    }
  } else if (canUse(allowed, "lengthFt") && canUse(allowed, "widthFt") && (!hasLength || !hasWidth)) {
    footprintAssumed = true;
  }

  /* Scope type drives which broad assemblies are in play. */
  const scopeType = canUse(allowed, "scopeType") ? answerValue(answers, "scopeType") : "";
  if (scopeType === "cosmetic") {
    set(answers, "drywall", "none", injectedKeys, allowed);
    set(answers, "partitions", "none", injectedKeys, allowed);
    set(answers, "insulationWalls", "no", injectedKeys, allowed);
    set(answers, "insulationCeiling", "no", injectedKeys, allowed);
  } else if (scopeType === "full") {
    set(answers, "drywall", "walls_and_ceiling", injectedKeys, allowed);
  } else if (scopeType === "conversion") {
    set(answers, "drywall", "walls_and_ceiling", injectedKeys, allowed);
    set(answers, "partitions", "moderate", injectedKeys, allowed);
  }

  const layout = canUse(allowed, "layoutChange") ? answerValue(answers, "layoutChange") : "";
  if (layout === "yes") set(answers, "partitions", "light", injectedKeys, allowed);

  const plumbingRelocation = canUse(allowed, "plumbingRelocation") ? answerValue(answers, "plumbingRelocation") : "";
  if (plumbingRelocation === "yes") set(answers, "plumbing", "moderate", injectedKeys, allowed);
  if (plumbingRelocation === "no") set(answers, "plumbing", "none", injectedKeys, allowed);

  const wallRemoval = canUse(allowed, "wallRemoval") ? answerValue(answers, "wallRemoval") : "";
  if (wallRemoval === "yes") set(answers, "electrical", "moderate", injectedKeys, allowed);

  const observations = observationsFromAnswers(answers);
  const flooringObs = observations.find((o) => o.key === "flooringToReplace");
  if (flooringObs?.value === "no") set(answers, "flooringQuality", "none", injectedKeys, allowed);

  return { answers, injectedKeys, footprintAssumed };
}

/* ------------------------------------------------------------------ *
 * Completeness
 * ------------------------------------------------------------------ */

/** The inputs that move the number the most, in rough priority order. */
export const HIGH_VALUE_INPUTS = [
  "roomType",
  "scopeType",
  "finishLevel",
  "lengthFt",
  "widthFt",
  "ceilingHeightFt",
  "plumbing",
  "electrical",
  "drywall",
  "flooringQuality",
];

export function completenessPct(answers: BallparkAnswers): number {
  const answered = HIGH_VALUE_INPUTS.filter((id) => {
    const value = answerValue(answers, id);
    return value !== "" && value !== "unsure";
  }).length;
  return Math.round((answered / HIGH_VALUE_INPUTS.length) * 100);
}
