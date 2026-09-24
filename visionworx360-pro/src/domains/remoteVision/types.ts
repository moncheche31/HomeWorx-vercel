import type { ConfirmedRunMeasurement } from "@/domains/scopeGrounding";
import type { EstimatorReading } from "@/features/estimating/services/narrationEstimator.shared";
import type { ContractorBreakdown } from "@/domains/estimating/contractorBreakdown";
/**
 * Module 011 — Remote Vision Estimate contracts.
 *
 * Deterministic and UI-free. Version 1 contains NO AI: every detection here is
 * produced by fixed keyword rules over the contractor's own description. The
 * interfaces are shaped so a future vision model (image recognition, rendering
 * comparison, object/material/room detection, quantity estimation) can be
 * dropped in behind `VisionAnalysisProvider` without touching callers.
 *
 * The estimating engine (Module 008) stays the single source of truth for
 * final math; this domain only produces *preliminary* ranges and assumptions.
 */

import type { GroundedScope, QuantityProvenance, SanityReport, ScopeClass } from "@/domains/scopeGrounding/types";

export type RemoteVisionLocale = "en-US" | "es-US";

/* ------------------------------------------------------------------ media */

export type RemoteVisionMediaKind =
  | "before_photo"
  | "after_rendering"
  | "floor_plan"
  | "walkthrough_video";

/** Lifecycle of a media item that is persisted to project storage. */
export type RemoteVisionUploadState = "local" | "uploading" | "uploaded" | "error";

/**
 * Model for an uploaded asset. `storagePath` is reserved for the future
 * project-media bucket persistence; local sessions keep `previewUrl` only.
 */
export interface RemoteVisionMedia {
  id: string;
  kind: RemoteVisionMediaKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl: string | null;
  storagePath: string | null;
  roomHint: string | null;
  createdAt: string;
  /** Video only — measured from the file's own metadata, never guessed. */
  durationSeconds?: number | null;
  /**
   * Video only — how many representative frames were extracted for the
   * deterministic vision pipeline. Frames are *evidence*, not measurements.
   */
  keyframeCount?: number;
  /** Data-URL previews of the extracted frames (kept out of localStorage). */
  keyframePreviews?: string[];
  uploadState?: RemoteVisionUploadState;
  uploadError?: string | null;
  uploadProgress?: number;
}

/* -------------------------------------------------------------- detection */

/** 0..1. Never presented to a customer, and never used as an AI probability. */
export type ConfidenceScore = number;

export type DetectionSource =
  | "description"
  | "vision_model"
  | "rendering_comparison"
  | "floor_plan"
  | "manual";

export interface DetectedFeatureBase {
  id: string;
  /** Stable machine key (e.g. "flooring.lvp"). */
  featureKey: string;
  /** Human-readable label in the requested locale. */
  label: string;
  confidence: ConfidenceScore;
  source: DetectionSource;
  /** Verbatim evidence (spoken phrase today, bounding-box ref in future). */
  evidence: string | null;
  /** Media the feature was detected in. Empty for description-only rules. */
  mediaIds: string[];
  quantity: number | null;
  /** Quantity used for pricing after trade-standard rounding/waste. */
  pricingQuantity?: number | null;
  unitKey: string | null;
  /** Grounding class — only explicit/incidental work is ever priced. */
  scopeClass?: ScopeClass;
  /** Verb the contractor actually used, resolved from their own sentence. */
  actionKey?: string | null;
  /** Reconciled component-level detail (cabinet makeup, etc.). */
  detail?: string | null;
  /** Where the quantity came from ("Why this quantity?"). */
  provenance?: QuantityProvenance;

}

export interface DetectedRoom extends DetectedFeatureBase {
  roomTypeKey: string;
}

export interface DetectedMaterial extends DetectedFeatureBase {
  materialCategory: "flooring" | "countertop" | "cabinet" | "wall" | "trim" | "other";
}

export type DetectedCabinet = DetectedFeatureBase;
export type DetectedFlooring = DetectedFeatureBase;
export type DetectedLighting = DetectedFeatureBase;
export type DetectedWindow = DetectedFeatureBase;
export type DetectedDoor = DetectedFeatureBase;
export type DetectedAppliance = DetectedFeatureBase;
export type DetectedFixture = DetectedFeatureBase;

export interface DetectedStructuralChange extends DetectedFeatureBase {
  changeKind: "wall_removal" | "beam" | "opening" | "framing" | "other";
}

export interface DetectedMechanicalChange extends DetectedFeatureBase {
  discipline: "electrical" | "plumbing" | "hvac" | "other";
}

/** Everything a vision provider can return. All lists may be empty. */
export interface VisionAnalysisResult {
  rooms: DetectedRoom[];
  materials: DetectedMaterial[];
  cabinets: DetectedCabinet[];
  flooring: DetectedFlooring[];
  lighting: DetectedLighting[];
  windows: DetectedWindow[];
  doors: DetectedDoor[];
  appliances: DetectedAppliance[];
  fixtures: DetectedFixture[];
  structuralChanges: DetectedStructuralChange[];
  mechanicalChanges: DetectedMechanicalChange[];
  /** Aggregate confidence for the whole analysis. */
  confidence: ConfidenceScore;
  /** Which provider produced this result (audit trail). */
  providerId: string;
  /** Included / incidental / observations / exclusions with provenance. */
  grounded?: GroundedScope;
  /** Pre-pricing sanity gate result. */
  sanity?: SanityReport;
}

export interface VisionAnalysisRequest {
  locale: RemoteVisionLocale;
  description: string;
  media: RemoteVisionMedia[];
  /**
   * Durable contractor-confirmed measurements. Authoritative: they outrank
   * anything re-parsed from the transcript for the same subject.
   */
  confirmedMeasurements?: ConfirmedRunMeasurement[];
  /**
   * Optional senior-estimator reading of the same narration (model-produced,
   * scope only — never pricing). It may fill gaps the deterministic lexicon
   * left; prerequisites and media-only findings arrive as approval-gated
   * suggestions. Absent = today's deterministic behaviour, unchanged.
   */
  estimatorReading?: EstimatorReading | null;
}

export interface VisionProviderCapabilities {
  imageRecognition: boolean;
  renderingComparison: boolean;
  objectDetection: boolean;
  materialRecognition: boolean;
  roomDetection: boolean;
  finishRecognition: boolean;
  quantityEstimation: boolean;
}

export interface VisionAnalysisProvider {
  id: string;
  capabilities: VisionProviderCapabilities;
  analyze(request: VisionAnalysisRequest): Promise<VisionAnalysisResult>;
}

/* ------------------------------------------------------------ assumptions */

export type AssumptionTopic =
  | "cabinet_grade"
  | "flooring_type"
  | "countertop_material"
  | "paint_grade"
  | "lighting_package"
  | "appliance_grade"
  | "structural_engineering";

export interface Assumption {
  id: string;
  topic: AssumptionTopic;
  /** Machine keys the contractor can pick from, including "unknown". */
  optionKeys: string[];
  selectedKey: string;
  /** True while the value is the engine's guess (not contractor-confirmed). */
  isAutomatic: boolean;
  confidence: ConfidenceScore;
  /** Verbatim phrase or rule that produced the guess. */
  basis: string | null;
}

/* -------------------------------------------------------------- estimates */

export type EstimateLevel = "economy" | "mid_range" | "premium";

export interface ScenarioDriver {
  featureKey: string;
  /** Canonical catalog/pricebook assembly used for the calculation. */
  assemblyKey?: string | null;
  label: string;
  costLow: number;
  costHigh: number;
  laborHours: number;
  crewHours?: number;
  /** Catalog assembly money vs a reviewable generic trade allowance. */
  pricingBasis?: "book_nce2026" | "generic_trade_allowance";
  needsReview?: boolean;
  /**
   * "ballpark_allowance" means the size was never stated and the ballpark
   * priced a published standard allowance. Always shown as an assumption.
   */
  quantityBasis?: "stated" | "ballpark_allowance";
}

/** A recognized scope feature that produced no money, and why. */
export interface UnpricedScopeFeature {
  featureKey: string;
  label: string;
  reason: string;
}

/**
 * Work priced in the BALLPARK from a standard allowance because no size was
 * stated. It contributes money to the range and must always be disclosed.
 */
export interface AllowanceScopeFeature {
  featureKey: string;
  label: string;
  quantity: number;
  unitKey: string;
  /** Which published rule of thumb supplied the assumed quantity. */
  basisKey?: "standard_cabinet" | "cabinet_run" | "standard" | "whole_structure" | null;
}


export interface EstimateScenario {
  level: EstimateLevel;
  costLow: number;
  costHigh: number;
  laborHours: number;
  durationDays: number;
  confidence: ConfidenceScore;
  /** Assumption ids that moved this number. */
  assumptionIds: string[];
  drivers: ScenarioDriver[];
  /**
   * Recognized, included work this scenario could NOT price. Surfaced to the
   * contractor for resolution — never rolled into the range as $0.
   */
  unpricedFeatures?: UnpricedScopeFeature[];
  /**
   * Work included in THIS (ballpark) range at a standard allowance because no
   * size was stated. Priced, but always disclosed as an assumption.
   */
  allowanceFeatures?: AllowanceScopeFeature[];

  /**
   * INVARIANT FLAG. True when recognized priceable scope exists but the
   * scenario produced no priced task or no money. A blocked scenario must not
   * be presented or committed as a valid $0 – $0 estimate.
   */
  pricingBlocked?: boolean;
  /**
   * Machine-readable diagnostic for a blocked scenario: no matcher priced any
   * included feature, or tasks priced but produced zero money. Null when the
   * scenario is a legitimate priced result (or has no included scope at all).
   */
  pricingIncompleteReason?: "no_priced_tasks" | "zero_money" | null;
  /**
   * INTERNAL ONLY. Contractor-facing cost split (labor $, material $, markup,
   * task and trade rollup). Never rendered in customer, realtor or buyer
   * output, never embedded in a share snapshot or PDF.
   */
  breakdown?: ContractorBreakdown;
}

/* -------------------------------------------------------------- questions */

export interface RemoteVisionQuestion {
  id: string;
  topic: string;
  promptKey: string;
  suggestions: string[];
}

/* ---------------------------------------------------------------- context */

/**
 * Contractor-entered measurements added AFTER media upload. These are FACTS
 * (source `contractor`), never inferred from a photo or a video frame.
 */
export interface RemoteVisionDimensions {
  id: string;
  roomLabel: string;
  lengthFt: number | null;
  widthFt: number | null;
  ceilingHeightFt: number | null;
}

export interface RemoteVisionContext {
  /** Speech-to-text note recorded after the media was uploaded. */
  voiceTranscript: string;
  /** Typed notes, kept separate so the transcript stays re-recordable. */
  typedNotes: string;
  dimensions: RemoteVisionDimensions[];
}

/* ---------------------------------------------------------------- session */

export interface RemoteVisionSession {
  projectId: string | null;
  projectName: string;
  description: string;
  media: RemoteVisionMedia[];
  /** Post-upload context: voice note, typed notes and measurements. */
  voiceTranscript: string;
  typedNotes: string;
  dimensions: RemoteVisionDimensions[];
  /** Contractor overrides keyed by assumption id. */
  assumptionOverrides: Record<string, string>;
  answers: Record<string, string>;
  editedNarrative: string | null;
  approvedNarrative: string | null;
  approvedAt: string | null;
  selectedLevel: EstimateLevel;
  /** Feature keys the contractor removed from the interpreted scope. */
  removedFeatureKeys?: string[];
  updatedAt: string;
}
