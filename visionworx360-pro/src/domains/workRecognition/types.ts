import type { QuantitySource } from "@/domains/scopeGrounding/types";

/**
 * Generic work recognition + quantity resolution (ADR-059).
 *
 * This domain replaces per-trade text hacks. A work item is recognized from
 * contractor intent (action + subject), then a quantity is resolved through
 * ONE authority hierarchy that is identical for every trade:
 *
 *   1. explicit / confirmed measurement   (authoritative)
 *   2. media evidence                     (contextual; only when 1 is absent)
 *   3. derived geometry                   (computed from 1 with trade formulas)
 *   4. industry allowance                 (last resort, always disclosed)
 *
 * Nothing here knows about cabinets specifically.
 */

/** The quantity families the estimator can reason about. */
export type UnitFamily =
  | "area"
  | "length"
  | "count"
  | "volume"
  | "room_zone"
  | "opening"
  | "circuit_device"
  | "fixture"
  | "assembly";

export type ActionKey =
  | "install"
  | "replace"
  | "remove"
  | "repair"
  | "relocate"
  | "refinish"
  | "paint"
  | "build"
  | "modify";

/** How a quantity is computed from authoritative geometry. */
export type DerivationKey =
  | "floor_area"
  | "ceiling_area"
  | "wall_area"
  | "surface_area"
  | "perimeter"
  | "roof_area"
  | "volume"
  | "stated_count"
  | "run_length"
  | "none";

export interface RecognizedAction {
  action: ActionKey;
  /** Verbatim phrase that established the action. */
  evidence: string;
  /** True when the action came from the pattern default, not the contractor. */
  isDefault: boolean;
}

/** A zone (room or outdoor area) with whatever geometry was stated for it. */
export interface ZoneGeometry {
  id: string;
  /** `kitchen`, `deck`, `basement`, or `area` when unnamed. */
  key: string;
  label: string;
  widthFt: number | null;
  lengthFt: number | null;
  heightFt: number | null;
  /** width x length, when both are known. */
  areaSf: number | null;
  /** 2 x (w + l), when both are known. */
  perimeterLf: number | null;
  evidence: string;
  source: QuantitySource;
}

export interface WorkAssumption {
  id: string;
  /** Contractor-facing sentence: "2 coats assumed", "15% waste added". */
  message: string;
  /** Set when the assumption changes the priced quantity. */
  affectsPrice: boolean;
}

export interface ResolvedQuantity {
  /** Physical, exact. Waste and rounding never touch this. */
  quantity: number | null;
  /** What pricing multiplies: quantity + waste, rounded per unit family. */
  pricingQuantity: number | null;
  unitKey: string;
  family: UnitFamily;
  source: QuantitySource;
  evidence: string | null;
  rationale: string;
  isDefault: boolean;
  /** 0-1. Measurement-backed work is high; pure allowance is low. */
  confidence: number;
}

export interface ResolvedWorkItem {
  id: string;
  workTypeKey: string;
  label: string;
  trade: string;
  action: ActionKey;
  actionEvidence: string;
  quantity: number | null;
  pricingQuantity: number | null;
  unitKey: string;
  family: UnitFamily;
  provenanceSource: QuantitySource;
  provenanceEvidence: string | null;
  rationale: string;
  confidence: number;
  assumptions: WorkAssumption[];
  /** Exclusion ids that were checked and did NOT suppress this item. */
  exclusions: string[];
  /** Zone ids the quantity came from. */
  zoneIds: string[];
  measurementIds: string[];
  mediaIds: string[];
  /** True when only an industry allowance backs the number. */
  isAllowance: boolean;
}

export interface RecognizedExclusion {
  id: string;
  /** Work-type prefix or family the contractor ruled out. */
  suppresses: string[];
  label: string;
  evidence: string;
}

export interface WorkRecognitionResult {
  items: ResolvedWorkItem[];
  zones: ZoneGeometry[];
  exclusions: RecognizedExclusion[];
  /** Suppressed items, kept for the trace so nothing vanishes silently. */
  suppressed: Array<{ workTypeKey: string; exclusionId: string; evidence: string }>;
  /** Subjects seen but not requested — observation only, never priced. */
  observations: Array<{ workTypeKey: string; label: string; evidence: string }>;
  clarifications: Array<{ id: string; message: string; evidence: string | null }>;
}

/** Contractor-confirmed measurement rows from durable capture. */
export interface ConfirmedMeasurement {
  id?: string;
  label: string;
  subject: string | null;
  inches: number;
  status: string;
  rawText?: string | null;
}

export interface MediaSignal {
  mediaId: string;
  /** Work-type key the media supports, e.g. `railing.install`. */
  workTypeKey: string;
  /** Optional count the media establishes (visible windows, bays). */
  count?: number | null;
  note: string;
}

export interface WorkRecognitionInput {
  text: string;
  confirmedMeasurements?: ConfirmedMeasurement[];
  media?: MediaSignal[];
  /** Zones already confirmed in the project record (outranks parsed text). */
  zones?: ZoneGeometry[];
}
