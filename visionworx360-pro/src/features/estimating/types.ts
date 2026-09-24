import type { TaskCostBasis } from "@/domains/estimating/costBasis";
import type { LineResolutionStatus } from "@/domains/estimating/resolution";

/** Serializable provenance recorded when Knowledge Base pricing is applied. */

export interface LinePricingProvenance {
  assemblyKey?: string | null;
  workItem?: string | null;
  origin?: string | null;
  matchScore?: number | null;
  matchReason?: string | null;
  /** Audit of how the applied numbers were derived. */
  quantity?: number | null;
  unitKey?: string | null;
  laborHoursPerUnit?: number | null;
  computedLaborHours?: number | null;
  crewSize?: number | null;
  /** Always false — crew size is descriptive and never multiplies hours. */
  crewSizeApplied?: boolean | null;
  materialAllowance?: number | null;
  wasteFactor?: number | null;
  /** Best rejected candidate when the line stayed unmatched. */
  candidateAssemblyKey?: string | null;
  candidateWorkItem?: string | null;
  candidateScore?: number | null;
  candidateReason?: string | null;
  minimumScore?: number | null;
  providerId?: string | null;
  scope?: string | null;
  datasetVersion?: string | null;
  regionalFactor?: number | null;
  suggestedMarkupPct?: number | null;
  markupApplied?: boolean | null;
  materialFactor?: number | null;
  equipmentFactor?: number | null;
  reason?: string | null;
  isSampleData?: boolean | null;
  /** Provider provenance recorded by the pricing bridge. */
  pricing?: {
    providerId?: string | null;
    scope?: string | null;
    datasetVersion?: string | null;
    isSampleData?: boolean | null;
    currency?: string | null;
  } | null;
}

import type { ScopeUnit } from "@/features/scope/types";
import type { LaborSettings } from "@/domains/estimating/laborHours";
import type { PricingMode } from "@/domains/estimating/pricingModes";
import type { PricingMethod } from "@/domains/estimating/pricingStrategy";
import type { PricingCopyMode } from "@/domains/estimating/copyPlan";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Legacy statuses (`in_review`, `ready`, `approved`) remain valid for
 * compatibility. The lineage model (Module 016) adds `sent`, `accepted`,
 * `declined` and `superseded`.
 */
export type EstimateStatus =
  | "draft"
  | "in_review"
  | "ready"
  | "approved"
  | "sent"
  | "accepted"
  | "declined"
  | "superseded";

/** Statuses the current UI exposes. Unchanged in Phase 1. */
export const LEGACY_ESTIMATE_STATUSES = [
  "draft",
  "in_review",
  "ready",
  "approved",
] as const satisfies readonly EstimateStatus[];

/** Subset of statuses the settable-status endpoint accepts today. */
export type LegacyEstimateStatus = (typeof LEGACY_ESTIMATE_STATUSES)[number];

/** A project can hold estimates, alternate options and change orders. */
export type EstimateDocumentKind = "estimate" | "alternate" | "change_order";

/** Explicit estimate/intake mode (Module 017 correction). */
export type EstimateIntakeMode = "ballpark" | "detailed";

export const ESTIMATE_INTAKE_MODES = ["ballpark", "detailed"] as const;

export function isEstimateIntakeMode(v: unknown): v is EstimateIntakeMode {
  return v === "ballpark" || v === "detailed";
}

/** A workspace-wide recent estimate row, with the project it belongs to. */
export interface RecentEstimateDTO {
  estimate: EstimateDTO;
  projectName: string | null;
}

export interface EstimateDTO {
  id: string;
  organizationId: string;
  projectId: string;
  version: number;
  parentEstimateId: string | null;
  /* ---- Module 016 lineage metadata (additive; safe defaults) ---- */
  /** estimate | alternate | change_order. */
  documentKind: EstimateDocumentKind;
  /** Root of this document's lineage. Originals point at themselves. */
  lineageRootId: string;
  /** 0 for the original; incremented for each revision inside a lineage. */
  revisionNumber: number;
  /** Human label for alternate options ("Option B"). Null otherwise. */
  optionLabel: string | null;
  /** Set when a revision supersedes this document. */
  supersededById: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  /** Non-null means the document (and its lines) are read-only. */
  lockedAt: string | null;
  title: string;
  notes: string | null;
  status: EstimateStatus;
  currency: string;
  taxRate: number;
  defaultOverheadPct: number;
  defaultProfitPct: number;
  defaultContingencyPct: number;
  defaultLaborRate: number;
  costCatalogRef: string | null;
  /**
   * Explicit estimate mode. `ballpark` never blocks on line-level pricing;
   * `detailed` keeps the Complete-pricing completion gate. Legacy rows default
   * to `detailed` so existing estimates behave exactly as before.
   */
  intakeMode: EstimateIntakeMode;
  /**
   * How the job is sold and presented: one total, labor + materials, or
   * labor only (owner supplies materials). Presentation only — scope,
   * quantities, assumptions and pricing history are identical in every mode.
   */
  pricingMode: PricingMode;
  /**
   * How markup is decided for THIS estimate (company default at creation, and
   * overridable per estimate). Existing rows are `overhead_profit` and keep
   * their saved percentages, so nothing is repriced silently.
   */
  pricingMethod: PricingMethod;
  /** Target gross profit margin %, used only in `target_gross_margin` mode. */
  targetGrossMarginPct: number;
  /**
   * INTERNAL labor-hour settings for this estimate: productivity multiplier,
   * crew size, productive hours per day and directly typed hour overrides.
   * Estimate-level values never overwrite the company defaults.
   */
  laborSettings: LaborSettings;
  /** Contractor-editable Good/Better/Best assumptions (V1 Range Engine). */
  rangeAssumptions: Record<string, JsonValue>;
  /** Last calculated range, frozen so reopening shows the same numbers. */
  rangeSnapshot: Record<string, JsonValue> | null;
  /** Structured-scope fingerprint this estimate was last synchronized against. */
  scopeSyncFingerprint: string | null;
  scopeSyncedAt: string | null;
  /** Pricing-engine stamp; older/absent means persisted pricing may be stale. */
  /**
   * True while the stored pricing numbers have NOT been confirmed by the
   * contractor — for example a legacy estimate carrying a provisional
   * company-default snapshot. Never treat these values as a deliberate choice.
   */
  pricingConfirmationRequired: boolean;
  /** Why confirmation is outstanding, in machine-readable form. */
  pricingConfirmationReason: string | null;
  /** Where the current pricing numbers came from (contractor, defaults, copy). */
  pricingSource: string | null;
  /** When the contractor last confirmed the pricing numbers. */
  pricingConfirmedAt: string | null;
  /** Set once pricing is an explicit contractor choice and protected. */
  pricingSettingsLockedAt: string | null;
  pricingEngineVersion: number;
  pricingRepricedAt: string | null;
  /* ---- Job-site location cost factors (NCE 2026 area modification) ---- */
  /**
   * Resolved book location the prices were built for. This ALWAYS comes from
   * the job site (property zip -> state average -> national baseline), never
   * from a hardcoded home state.
   */
  pricingLocation: string | null;
  /** `manual_override` | `zip_prefix` | `state_average` | `national_baseline`. */
  pricingLocationSource: string | null;
  /** Contractor-chosen book location that wins over the address. */
  pricingLocationOverride: string | null;
  /** Applied percentages; labor and material are separate, never blended. */
  pricingLocationFactors: {
    materialPct?: number;
    laborPct?: number;
    equipmentPct?: number;
    laborMultiplier?: number;
    materialMultiplier?: number;
    resolvedAt?: string;
  } | null;

  /* ---- "Use Previous Project as Template" provenance (internal only) ---- */
  /** Source estimate this document was copied from, if any. */
  copiedFromEstimateId: string | null;
  copiedFromProjectId: string | null;
  /** "Jackie's Kitchen — 2026-08-12". */
  copiedFromLabel: string | null;
  copiedSourceDatedAt: string | null;
  /** `copied` while the copied prices are being kept; `refreshed` after. */
  pricingCopyMode: PricingCopyMode | null;

  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface EstimateLineDTO {
  id: string;
  organizationId: string;
  projectId: string;
  estimateId: string;
  scopeItemId: string | null;
  scopeSectionId: string | null;
  roomId: string | null;
  groupLabel: string | null;
  description: string;
  categoryKey: string | null;
  subcategoryKey: string | null;
  tradeKey: string | null;
  quantity: number;
  unitKey: ScopeUnit | null;
  laborHours: number;
  laborRate: number;
  materialCost: number;
  equipmentCost: number;
  subcontractorCost: number;
  otherCost: number;
  overheadPct: number;
  profitPct: number;
  contingencyPct: number;
  isTaxable: boolean;
  isClientVisible: boolean;
  internalNotes: string | null;
  catalogItemKey: string | null;
  /** auto = guessed by the bridge; contractor = explicitly confirmed (trusted). */
  catalogMappingSource: "auto" | "contractor" | null;
  catalogConfirmedBy: string | null;
  catalogConfirmedAt: string | null;
  /** Quantity is a default placeholder, not a measured value. */
  isQuantityPlaceholder: boolean;
  /**
   * The line prices off a fabricated default quantity (a bare 1), not a
   * measurement or a contractor-entered number. Priced, but never "measured".
   */
  quantityIsAssumedDefault: boolean;
  /** The captured measurement this line's quantity was bound to, if any. */
  quantitySourceMeasurementId: string | null;
  quantityReviewedBy: string | null;
  quantityReviewedAt: string | null;
  /** knowledge_base | contractor | unmatched | null (never priced). */
  pricingSource:
    | "knowledge_base"
    | "contractor"
    | "unmatched"
    | "nce_2026_book"
    /** Material cost estimated by the assistant; labor is never estimated. */
    | "ai_estimated_material"
    | (string & {})
    | null;

  /** Canonical cost model for the task (fee vs production labor vs material…). */
  costBasis: TaskCostBasis | null;
  /** Where the cost basis came from: inferred | contractor | catalog. */
  costBasisSource: string | null;
  /** hours_per_unit | units_per_hour | total_hours. */
  laborConvention: string | null;
  /** Labor hours per unit of measure. Multiplied by quantity exactly once. */
  laborHoursPerUnit: number | null;
  /** Fixed setup / mobilization hours added on top of the per-unit total. */
  laborHoursSetup: number | null;
  /** Whether the line can be defensibly priced right now. */
  resolutionStatus: LineResolutionStatus;
  /** Why not, when unresolved. */
  unresolvedReason: string | null;

  /** Assembly expansion linked to this line, when its trade supports one. */
  assemblyExpansionId: string | null;
  /** not_expanded | auto_expanded_unreviewed | reviewed. */
  assemblyExpansionStatus: string | null;
  /** Set when this line IS an assembly component of another line. */
  parentLineId: string | null;


  /** Match + sample-data provenance for the applied Knowledge Base defaults. */
  pricingProvenance: LinePricingProvenance;
  pricedAt: string | null;
  /** True once a contractor edits any cost field. Automatic pricing skips it. */
  isPriceOverridden: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface EstimateAuditEventDTO {
  id: string;
  estimateId: string;
  actorUserId: string | null;
  eventType: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}
