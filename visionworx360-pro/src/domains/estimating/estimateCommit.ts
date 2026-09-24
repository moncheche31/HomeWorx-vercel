/**
 * Canonical approved-estimate commit contract (shared by ALL intake modes).
 *
 * On-site Walkthrough, Estimate from Photos or Video, and Describe Your
 * Project are three ways to CAPTURE a job — not three estimating systems.
 * Each one converts its own approved review state into the canonical payload
 * below, and exactly one commit service turns that payload into durable
 * scope + a durable project estimate. No intake mode may create estimates on
 * its own.
 */

import type { ContractorBreakdown } from "./contractorBreakdown";
import type { QuantityBasis } from "@/domains/provenance";

export type EstimateIntakeSource = "walkthrough" | "photos_video" | "describe";

/** Ballpark snapshots record the intake method with the ballpark vocabulary. */
export const INTAKE_METHOD_BY_SOURCE: Record<EstimateIntakeSource, "onsite" | "photos" | "description"> = {
  walkthrough: "onsite",
  photos_video: "photos",
  describe: "description",
};

/** One scope section per intake source keeps re-approval idempotent. */
export const INTAKE_SECTION_NAME: Record<EstimateIntakeSource, string> = {
  walkthrough: "Walkthrough",
  photos_video: "Photos & Video Scope",
  describe: "Described Scope",
};

export function intakeSectionKey(source: EstimateIntakeSource): string {
  return `intake:${source}`;
}

/** Stable per-item identity so approving twice updates instead of duplicating. */
export function intakeScopeItemKey(source: EstimateIntakeSource, key: string): string {
  return `${source}:${key}`.slice(0, 80);
}

export const CANONICAL_UNITS = [
  "each", "linear_foot", "square_foot", "cubic_foot", "cubic_yard", "sheet", "board_foot",
  "gallon", "pound", "hour", "day", "allowance", "lump_sum", "other",
] as const;

export type CanonicalUnit = (typeof CANONICAL_UNITS)[number];

export function normalizeUnitKey(unit: string | null | undefined): CanonicalUnit | null {
  if (!unit) return null;
  return (CANONICAL_UNITS as readonly string[]).includes(unit) ? (unit as CanonicalUnit) : null;
}

export interface CanonicalScopeItemInput {
  /** Intake-stable key (feature key, draft key). Drives idempotency. */
  key: string;
  title: string;
  roomId?: string | null;
  tradeKey?: string | null;
  categoryKey?: string | null;
  subcategoryKey?: string | null;
  actionKey?: string | null;
  /** Exact stated geometry. Never rounded. */
  quantity?: number | null;
  /** Rounded pricing quantity when it differs from the exact geometry. */
  pricingQuantity?: number | null;
  unitKey?: string | null;
  description?: string | null;
  internalNotes?: string | null;
  /** true => contractor stated it; false => inferred and needs verification. */
  confirmed?: boolean;
  /**
   * How the number was arrived at. Carried through the commit so a derived
   * quantity can still be re-derived later instead of freezing as authority.
   */
  quantityBasis?: QuantityBasis | null;
  /** Human-readable audit basis, e.g. "18 ft x 16 ft = 288 SF; +10% waste". */
  quantityBasisNote?: string | null;
}

export interface CanonicalBallparkSelection {
  level: string;
  low: number;
  expected?: number | null;
  high: number;
  confidence: "high" | "medium" | "low";
  laborHours?: number | null;
  crewHours?: number | null;
  durationDays?: number | null;
  currency?: string;
  /** INTERNAL ONLY — contractor economics. Never sent to external audiences. */
  breakdown?: ContractorBreakdown | null;
}

export interface CanonicalEstimateCommit {
  projectId: string;
  intakeSource: EstimateIntakeSource;
  title?: string | null;
  /** Approved grounded work items. Omit when the intake already wrote scope. */
  items?: CanonicalScopeItemInput[];
  ballpark?: CanonicalBallparkSelection | null;
  assumptions?: Array<Record<string, unknown>>;
  exclusions?: Array<Record<string, unknown>>;
  measurements?: Array<Record<string, unknown>>;
  quantities?: Array<Record<string, unknown>>;
  /** Approved narrative scope of work, when the intake produced one. */
  narrativeText?: string | null;
  /** Replay/provenance reference kept with the estimate for auditing. */
  provenance?: Record<string, unknown> | null;
  /**
   * Pricing presentation the CONTRACTOR stated in the intake ("labor-only
   * quote"). It is a hard constraint on the customer-facing price, so it is
   * carried through the commit instead of being lost with the transcript.
   */
  pricingMode?: "total" | "labor_materials" | "labor_only" | null;
}

export interface EstimateCommitResult {
  estimateId: string;
  /** True only when a brand new estimate row was inserted. */
  createdEstimate: boolean;
  /** True when an issued estimate was revised instead of edited in place. */
  createdRevision: boolean;
  scopeItemsWritten: number;
  scopeItemsArchived: number;
  linesImported: number;
  ballparkSaved: boolean;
}

/**
 * Frozen ballpark band written to `estimates.range_snapshot`. The shape is the
 * same one the estimate page, dashboard and listings already read, so a
 * photos/video or described ballpark is indistinguishable downstream from one
 * produced by the ballpark interview.
 */
export function buildBallparkSnapshot(
  source: EstimateIntakeSource,
  ballpark: CanonicalBallparkSelection,
  extras: { assumptions?: Array<Record<string, unknown>>; quantities?: Array<Record<string, unknown>> } = {},
  now: string = new Date().toISOString(),
): Record<string, unknown> {
  const expected =
    typeof ballpark.expected === "number" && Number.isFinite(ballpark.expected)
      ? ballpark.expected
      : Math.round((ballpark.low + ballpark.high) / 2);
  return {
    kind: "ballpark",
    mode: "ballpark",
    currency: ballpark.currency ?? "USD",
    calculatedAt: now,
    savedAt: now,
    intakeMethod: INTAKE_METHOD_BY_SOURCE[source],
    band: { low: ballpark.low, expected, high: ballpark.high },
    confidence: ballpark.confidence,
    unknownWidenPct: 0,
    level: ballpark.level,
    laborHours: ballpark.laborHours ?? null,
    crewHours: ballpark.crewHours ?? null,
    durationDays: ballpark.durationDays ?? null,
    /* Internal economics travel with the estimate, never with client output. */
    contractorBreakdown: ballpark.breakdown ?? null,
    assumptions: extras.assumptions ?? [],
    quantities: extras.quantities ?? [],
  };
}

/** Minimal durable session so the ballpark surfaces can resume this estimate. */
export function buildCommitSession(
  input: {
    estimateId: string;
    projectId: string;
    intakeSource: EstimateIntakeSource;
    confidence: "high" | "medium" | "low";
    narrativeText?: string | null;
    provenance?: Record<string, unknown> | null;
    assumptions?: Array<Record<string, unknown>>;
    quantities?: Array<Record<string, unknown>>;
  },
  now: string = new Date().toISOString(),
): Record<string, unknown> {
  return {
    schemaKey: "estimate-commit",
    schemaVersion: 1,
    estimateId: input.estimateId,
    projectId: input.projectId,
    intakeSource: INTAKE_METHOD_BY_SOURCE[input.intakeSource],
    currentStage: "results",
    answers: {},
    transcripts: {},
    photoReferences: [],
    photoAnalysis: {},
    confirmedValues: {},
    inferredValues: {},
    assumedValues: {},
    contractorOverrides: {},
    derivedGeometry: {},
    derivedQuantities: input.quantities ?? [],
    unknowns: [],
    rangeInputs: {},
    rangeSnapshot: null,
    confidence: input.confidence,
    description: input.narrativeText ?? "",
    observations: [],
    provenance: input.provenance ?? null,
    updatedAt: now,
  };
}

/** Numeric confidence (0..1) mapped onto the shared ballpark confidence band. */
export function confidenceBand(score: number | null | undefined): "high" | "medium" | "low" {
  if (typeof score !== "number" || !Number.isFinite(score)) return "low";
  const normalized = score > 1 ? score / 100 : score;
  if (normalized >= 0.75) return "high";
  if (normalized >= 0.5) return "medium";
  return "low";
}
