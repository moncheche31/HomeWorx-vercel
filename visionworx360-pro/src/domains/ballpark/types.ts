/**
 * Voice-First Ballpark Walkthrough Interview — contracts (Phase 1).
 *
 * A contractor standing in an unfinished garage has no sketch and no tape
 * measure on every wall. This module collects the *minimum* answers needed for
 * a preliminary range, records every guess as an explicit assumption, and
 * hands the result to the existing Range Engine.
 *
 * Pure types only — no React, no Supabase, no i18n, no IO.
 */

import type { GeometryOpening, RoomGeometry, RoomGeometryInput } from "@/domains/geometry";
import type { EngineLineInput } from "@/domains/estimating";

export type BallparkLocale = "en-US" | "es-US";

/* ------------------------------------------------------------------ *
 * Interview schema (data-driven; no hard-coded JSX per project type)
 * ------------------------------------------------------------------ */

export type BallparkQuestionKind =
  | "dimension" // a single measurement in feet (accepts feet + inches)
  | "choice" // one of a fixed option set
  | "count" // a whole number (doors, windows)
  | "text"; // free text (use of the space)

/** A selectable answer. `value` is what gets stored, never the label. */
export interface BallparkOption {
  value: string;
  /** i18n key under the `ballpark` namespace. */
  labelKey: string;
  /** Spoken words that select this option, per locale. Lowercase, accent-free. */
  match: Partial<Record<BallparkLocale, string[]>>;
}

/**
 * Show this question only when the condition holds. Data-driven so a new
 * project type is a new question array, not new component code.
 */
export interface BallparkCondition {
  questionId: string;
  /** Visible when the stored answer is one of these values. */
  equals?: string[];
  /** Visible when the stored answer is NOT one of these values. */
  notEquals?: string[];
}

export interface BallparkQuestion {
  id: string;
  kind: BallparkQuestionKind;
  /** i18n keys under the `ballpark` namespace. */
  promptKey: string;
  hintKey?: string;
  /** Unit shown next to a dimension/count field. */
  unit?: "ft" | "each";
  options?: BallparkOption[];
  /** A dimension question may also accept "sixteen by eighteen" (two values). */
  acceptsPair?: { lengthId: string; widthId: string };
  /** "I don't know" is offered (and widens the range) unless disabled. */
  allowUnknown?: boolean;
  condition?: BallparkCondition;
  /** Sensible starting value shown in the field. Always visible, never silent. */
  defaultValue?: string | number;
  /**
   * A refinement question: skipping it costs nothing because a documented
   * allowance already covers it, so it never widens the range.
   */
  optional?: boolean;
}


/** An interview: a reusable, named list of questions. */
export interface BallparkInterviewSchema {
  key: string;
  titleKey: string;
  questions: BallparkQuestion[];
}

/* ------------------------------------------------------------------ *
 * Answers
 * ------------------------------------------------------------------ */

export type BallparkAnswerStatus = "answered" | "unknown" | "skipped";

export interface BallparkAnswer {
  status: BallparkAnswerStatus;
  /** Present only when `status === "answered"`. */
  value?: string | number;
  /** The spoken words this answer came from, kept for the audit trail. */
  transcript?: string | null;
}

export type BallparkAnswers = Record<string, BallparkAnswer>;

/* ------------------------------------------------------------------ *
 * Assumptions and derived quantities
 * ------------------------------------------------------------------ */

/**
 * Every value the estimate uses, with where it came from. `assumed` values are
 * always rendered to the contractor — nothing guessed is ever hidden.
 */
export interface BallparkAssumption {
  key: string;
  /** i18n key for the label. */
  labelKey: string;
  /** Already-formatted value ("16 ft × 18 ft", "moderate", "288 SF"). */
  value: string;
  source: "answered" | "assumed" | "derived";
  /** Plain-language derivation, e.g. "50% of 68 LF perimeter". */
  basis?: string | null;
  /** The question this came from, so "Refine" can jump straight there. */
  questionId?: string | null;
}

/** An input the contractor did not give. Unknowns widen the range. */
export interface BallparkUnknown {
  questionId: string;
  promptKey: string;
  /** Extra band width contributed, in percent. */
  widenPct: number;
}

export interface BallparkQuantity {
  /** Pricebook key (stable, provider-agnostic). */
  itemKey: string;
  labelKey: string;
  /** Section label used for the range breakdown. */
  groupKey: string;
  quantity: number;
  unitKey: "square_foot" | "linear_foot" | "each";
  /** Plain-language derivation shown next to the number. */
  formula: string;
  /** True when the quantity rests on an assumption rather than a measurement. */
  isAssumed: boolean;
}

export interface BallparkDerived {
  /** Geometry in the same shape the measurement record uses (continuity). */
  geometryInput: RoomGeometryInput;
  geometry: RoomGeometry;
  quantities: BallparkQuantity[];
  assumptions: BallparkAssumption[];
  unknowns: BallparkUnknown[];
  /** Bathroom / closet / partition allowances, kept separate for the audit. */
  allowances: {
    partitionLf: number;
    bathroomAreaSf: number;
    closetAreaSf: number;
  };
}

/* ------------------------------------------------------------------ *
 * Pricing (provider-agnostic)
 * ------------------------------------------------------------------ */

export interface BallparkPriceEntry {
  itemKey: string;
  unitKey: "square_foot" | "linear_foot" | "each";
  laborHoursPerUnit: number;
  /** Waste-inclusive material cost per unit (canonical rule). */
  materialCostPerUnit: number;
  subcontractorCostPerUnit?: number;
  /**
   * Largest count a single residential scope line can plausibly carry for an
   * `each` item. A parsed size ("60\" vanity") or a stray decimal shift must
   * never be priced as a count; anything above this is reported for review
   * instead of being multiplied into the band.
   */
  maxPlausibleCount?: number;
}


/**
 * Replaceable pricing source. The sample book ships with the app; licensed
 * regional data can be dropped in later without touching the interview.
 */
export interface BallparkPricebook {
  key: string;
  /** True while the numbers are illustrative rather than market data. */
  isSampleData: boolean;
  laborRate: number;
  get(itemKey: string): BallparkPriceEntry | null;
}

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

export type BallparkConfidence = "high" | "medium" | "low";

export interface BallparkBand {
  low: number;
  expected: number;
  high: number;
}

export interface BallparkResult {
  currency: string;
  band: BallparkBand;
  confidence: BallparkConfidence;
  /** Total extra widening applied because of unknowns, in percent. */
  unknownWidenPct: number;
  unknowns: BallparkUnknown[];
  assumptions: BallparkAssumption[];
  quantities: BallparkQuantity[];
  lines: EngineLineInput[];
  derived: BallparkDerived;
  isSampleData: boolean;
  warnings: { code: string; messageKey: string }[];
  /** How the job is being sold. Presentation-only; scope is unchanged. */
  pricingMode?: import("@/domains/estimating").PricingMode;
  /** True when small-job mobilization / service-call economics applied. */
  isSmallJob?: boolean;
}

/** Persisted snapshot; resuming an interview must never lose an answer. */
export interface BallparkSessionSnapshot {
  version: 1;
  schemaKey: string;
  projectId: string;
  locale: BallparkLocale;
  answers: BallparkAnswers;
  updatedAt: string;
}

export type { GeometryOpening };
