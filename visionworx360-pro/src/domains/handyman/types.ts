/**
 * HANDYMAN / SMALL-SERVICE WORK — contracts.
 *
 * VisionWorx360 Pro is one product for remodelers, handymen and service
 * contractors. This domain adds the *small job* half of that promise without
 * forking the estimator: a handyman task is recognised, quantified, priced and
 * rolled up through the same money rules the remodeling side already uses.
 *
 * Three rules govern everything here:
 *
 *  1. NO FABRICATED PRICES. A task that no configured pricing source can price
 *     resolves to `pricing_needed`, never to $0 and never to a guess.
 *  2. ONE MOBILIZATION PER VISIT. Fifteen punch-list items at one address is
 *     one trip, not fifteen service calls.
 *  3. PROVIDER-AGNOSTIC PRICING. Contractor-custom, our curated internal
 *     library, a future licensed import (Craftsman / RSMeans class data) and
 *     optional market reference data all implement the same interface. No
 *     proprietary data is embedded in this repository.
 *
 * Pure types — no React, no Supabase, no i18n, no IO.
 */

export type HandymanLocale = "en-US" | "es-US";

export interface HandymanText {
  "en-US": string;
  "es-US": string;
}

/** Units a small job can legitimately be sold in. */
export type TaskUnit =
  | "each"
  | "linear_foot"
  | "square_foot"
  | "hour"
  | "day"
  | "allowance";

export type TaskCategory =
  | "plumbing"
  | "electrical"
  | "drywall"
  | "paint"
  | "flooring"
  | "cabinets"
  | "doors_windows_trim"
  | "deck_fence"
  | "exterior"
  | "bath_accessories"
  | "shelving_storage"
  | "mounting"
  | "weatherproofing"
  | "carpentry"
  | "general";

/**
 * Work that travels with a task. `standard` is included by default because it
 * is always part of doing the job right; `conditional` is offered but never
 * silently added; `question` means the uncertainty is cost-significant enough
 * to be worth one question.
 */
export type CompanionInclusion = "standard" | "conditional" | "question";

export interface CompanionWork {
  id: string;
  label: HandymanText;
  inclusion: CompanionInclusion;
}

export interface HandymanTask {
  /** Canonical, stable task id. Never a display label. */
  id: string;
  category: TaskCategory;
  label: HandymanText;
  /** Natural-language phrasings, lowercase. Voice intake matches on these. */
  aliases: string[];
  unit: TaskUnit;
  /**
   * Key into an existing internal pricing primitive (ballpark pricebook /
   * canonical assembly). Absent means: recognised but not priceable from our
   * own validated data — the contractor supplies the number.
   */
  priceRef?: string;
  /** Units of `priceRef` consumed per unit of this task. Default 1. */
  priceFactor?: number;
  /** Quantity assumed when the narration gives none. */
  typicalQuantity?: number;
  /** Floor on billable labor for a single occurrence of this task. */
  minLaborHours?: number;
  companions?: CompanionWork[];
  /** Question ids (see `questions.ts`) this task can trigger. */
  questions?: string[];
}

/* ------------------------------------------------------------------ *
 * Pricing source layer
 * ------------------------------------------------------------------ */

export type PricingSourceKind =
  /** The contractor's own rates. Always outranks everything else. */
  | "contractor_custom"
  /** Our curated internal task/assembly library (sample-grade today). */
  | "internal_curated"
  /** A licensed dataset the organization imported. None ships in this repo. */
  | "licensed_import"
  /** Optional future market reference data. Advisory, never authoritative. */
  | "market_reference";

export type RateConfidence = "high" | "medium" | "low";

export type RateReviewStatus =
  | "validated"
  | "sample"
  | "contractor_supplied"
  | "imported"
  | "unreviewed";

/** Everything needed to defend a number in front of a client. */
export interface RateProvenance {
  sourceId: string;
  kind: PricingSourceKind;
  /** ZIP, metro or market code the rate was priced for. */
  market?: string | null;
  /** ISO date the rate takes effect. */
  effectiveDate?: string | null;
  /** Dataset / library version. */
  version?: string | null;
  confidence: RateConfidence;
  reviewStatus: RateReviewStatus;
}

export interface TaskRate {
  unit: TaskUnit;
  laborHoursPerUnit: number;
  materialCostPerUnit: number;
  /** Flat/service-task money that does not scale with quantity. */
  flatAmount?: number;
  provenance: RateProvenance;
}

export interface PricingLookupContext {
  market?: string | null;
  /** Finish tier or other selection hints a source may honour. */
  hints?: Record<string, string | number | boolean | null | undefined>;
}

export interface PricingSource {
  id: string;
  kind: PricingSourceKind;
  /** Higher wins. Contractor custom sits above every baseline source. */
  priority: number;
  lookup(taskId: string, context: PricingLookupContext): TaskRate | null;
}

export type PricingNeededReason =
  | "no_source_rate"
  | "unit_mismatch"
  | "task_unrecognized";

/* ------------------------------------------------------------------ *
 * Recognition + estimating
 * ------------------------------------------------------------------ */

export interface TaskInstance {
  /** Null when the phrase was heard but matched no task in the library. */
  taskId: string | null;
  quantity: number;
  unit: TaskUnit | null;
  /** The exact narration fragment this instance came from. */
  sourceText: string;
  /** True when quantity came from the narration rather than a default. */
  quantityStated: boolean;
}

export interface TaskLine {
  taskId: string | null;
  label: HandymanText;
  sourceText: string;
  quantity: number;
  unit: TaskUnit | null;
  laborHours: number;
  laborCost: number;
  materialCost: number;
  subtotal: number;
  pricingNeeded: boolean;
  pricingNeededReason?: PricingNeededReason;
  provenance?: RateProvenance;
  companions: CompanionWork[];
}

/** Contractor-configurable small-job economics. Never silently hard-coded. */
export interface ServiceMinimumConfig {
  /** Truck, drive time, materials run, invoicing — once per visit. */
  mobilizationFee: number;
  /** Setup, protection, cleanup and haul-away — once per visit. */
  setupCleanupHours: number;
  /** Nobody rolls a truck for less than this many billable hours. */
  minimumLaborHours: number;
  /** Optional hard invoice floor. Null means derive it from the above. */
  minimumCharge: number | null;
  /** Apply per visit (correct for punch lists) rather than per line. */
  applyPerVisit: boolean;
}

export interface PunchListEstimate {
  lines: TaskLine[];
  /** One mobilization for the whole visit. */
  mobilization: number;
  setupCleanupCost: number;
  laborHours: number;
  laborCost: number;
  materialCost: number;
  /** Lines + visit costs, before the minimum floor. */
  subtotal: number;
  /** Floor applied because the visit is smaller than the service minimum. */
  minimumCharge: number;
  total: number;
  pricingNeededCount: number;
  unrecognizedCount: number;
  /** Ids of the clarification questions worth asking. Capped and ranked. */
  questionIds: string[];
}
