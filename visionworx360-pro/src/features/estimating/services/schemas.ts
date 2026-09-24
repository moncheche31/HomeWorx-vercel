import { z } from "zod";
import { LEGACY_ESTIMATE_STATUSES } from "../types";
import { roundQuarterHour } from "@/domains/estimating/laborTime";

/**
 * GLOBAL LABOR-TIME INVARIANT: hours arriving from any client — including a
 * contractor typing them by hand — are snapped to the quarter hour before they
 * reach the write path. Their intent is kept; the tenths are not.
 */
const laborHoursField = (max: number) =>
  z.number().min(0).max(max).transform(roundQuarterHour);

const uuid = z.string().uuid();

export const listEstimatesSchema = z.object({
  projectId: uuid,
  includeArchived: z.boolean().optional().default(false),
});

/**
 * Workspace-wide recent estimates (dashboard). Mode-agnostic on purpose: a
 * ballpark estimate is a real saved estimate and must appear here without any
 * line-level pricing.
 */
export const listRecentEstimatesSchema = z.object({
  limit: z.number().int().min(1).max(20).optional().default(6),
});


export const getEstimateSchema = z.object({ estimateId: uuid });

export const createFromScopeSchema = z.object({
  projectId: uuid,
  title: z.string().trim().max(160).optional(),
});

export const createVersionSchema = z.object({ estimateId: uuid });
export const applyKnowledgePricingSchema = z.object({ estimateId: uuid });
export const syncFromScopeSchema = z.object({ estimateId: uuid });
export const scopeSyncStateSchema = z.object({ estimateId: uuid });
export const reviseAndSyncSchema = z.object({ estimateId: uuid });

/**
 * Ballpark refinement: the contractor corrects one inferred quantity (or clears
 * the correction with `quantity: null`) and the band recalculates.
 */
export const refineBallparkAssumptionSchema = z.object({
  estimateId: uuid,
  itemId: z.string().min(1).max(200),
  itemKey: z.string().min(1).max(120),
  quantity: z.number().min(0).max(100000).nullable(),
});

/**
 * Clarification round finished ("Improve accuracy"). The band is re-derived
 * through the pipeline that already owns this estimate — never through the
 * intake pricer when canonical cost lines exist.
 */
export const refreshBallparkClarificationSchema = z.object({ estimateId: uuid });

/**
 * Phase 1 keeps the settable statuses restricted to the legacy set. The new
 * lineage statuses (sent/accepted/declined/superseded) exist in the database
 * but are only writable through the dedicated transitions added in later
 * phases, so no caller can bypass transition rules today.
 */
export const setStatusSchema = z.object({
  estimateId: uuid,
  status: z.enum(LEGACY_ESTIMATE_STATUSES),
});

/**
 * Contractor selects where inside the saved preliminary band this estimate is
 * being sold. Scope, quantities and pricing settings are untouched.
 */
export const setBallparkBandPositionSchema = z.object({
  estimateId: uuid,
  position: z.enum(["low", "expected", "high"]),
});



const rangeAllowanceSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().max(160).nullable().optional(),
  amount: z.number().min(0).max(10_000_000),
  isTaxable: z.boolean().optional(),
});

const rangeAdjustmentSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().max(240),
  kind: z.enum(["add", "reduce"]),
  low: z.number().min(0).max(10_000_000),
  high: z.number().min(0).max(10_000_000),
});

/** Contractor-editable assumptions behind the Good / Better / Best range. */
export const rangeAssumptionsSchema = z.object({
  tier: z.enum(["good", "better", "best"]),
  laborRate: z.number().min(0).max(100000).nullable(),
  overheadPct: z.number().min(0).max(500).nullable(),
  profitPct: z.number().min(0).max(500).nullable(),
  contingencyPct: z.number().min(0).max(500).nullable(),
  regionalFactor: z.number().min(0.25).max(3),
  allowances: z.array(rangeAllowanceSchema).max(50),
  markupOnAllowances: z.boolean(),
  adjustments: z.array(rangeAdjustmentSchema).max(100),
  excludedLineIds: z.array(z.string().uuid()).max(5000),
});

/** Frozen tiered range result (Good/Better/Best engine). */
const tieredRangeSnapshotSchema = z.object({
  currency: z.string().trim().max(8),
  calculatedAt: z.string().max(40),
  tiers: z
      .array(
        z.object({
          tier: z.enum(["good", "better", "best"]),
          low: z.number(),
          mid: z.number(),
          high: z.number(),
      }),
    )
    .max(3),
});

/**
 * Frozen ballpark band produced by the multi-input ballpark engine.
 *
 * One snapshot per estimate: saving again overwrites this object, so repeated
 * saves are idempotent and never create extra rows or scope lines.
 */
const ballparkRangeSnapshotSchema = z.object({
  kind: z.literal("ballpark"),
  mode: z.literal("ballpark").optional(),
  /* Engine that produced this band; drives stale-snapshot detection on open. */
  engineVersion: z.number().int().positive().max(1000).optional(),
  currency: z.string().trim().max(8),

  calculatedAt: z.string().max(40).optional(),
  savedAt: z.string().max(40).optional(),
  intakeMethod: z.enum(["onsite", "photos", "description"]).nullable().optional(),
  band: z.object({ low: z.number(), expected: z.number(), high: z.number() }),
  /*
   * Contractor's selling POSITION inside the band. Never a scope or quality
   * change: the same band, sold low, recommended or high.
   */
  selectedBandPosition: z.enum(["low", "expected", "high"]).optional(),
  confidence: z.enum(["high", "medium", "low"]),
  unknownWidenPct: z.number(),
  assumptions: z.array(z.record(z.unknown())).max(500).optional(),
  unknowns: z.array(z.record(z.unknown())).max(500).optional(),
  quantities: z.array(z.record(z.unknown())).max(500).optional(),
  geometry: z.record(z.unknown()).nullable().optional(),
  isSampleData: z.boolean().optional(),
}).passthrough();


/** Frozen result stored with the estimate so reopening shows the same numbers. */
export const rangeSnapshotSchema = z
  .union([ballparkRangeSnapshotSchema, tieredRangeSnapshotSchema])
  .nullable();


export const updateEstimateSchema = z.object({
  estimateId: uuid,
  title: z.string().trim().min(1).max(160).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  defaultOverheadPct: z.number().min(0).max(500).optional(),
  defaultProfitPct: z.number().min(0).max(500).optional(),
  defaultContingencyPct: z.number().min(0).max(500).optional(),
  defaultLaborRate: z.number().min(0).max(100000).optional(),
  rangeAssumptions: rangeAssumptionsSchema.optional(),
  rangeSnapshot: rangeSnapshotSchema.optional(),
  intakeMode: z.enum(["ballpark", "detailed"]).optional(),
  /* Presentation only: switching never rebuilds the estimate. */
  pricingMode: z.enum(["total", "labor_materials", "labor_only"]).optional(),
  /*
   * Mutually exclusive pricing method + its target margin. Changing this is an
   * explicit contractor action; it is never written implicitly.
   */
  pricingMethod: z.enum(["overhead_profit", "target_gross_margin"]).optional(),
  targetGrossMarginPct: z.number().min(0).max(99.99).optional(),
  /*
   * Internal labor settings. Contractor authority: a typed-in hour override is
   * stored verbatim and is never reset by a later assumption revision.
   */
  laborSettings: z
    .object({
      productivityMultiplier: z.number().min(0.5).max(2.5).nullable().optional(),
      laborRate: z.number().min(0).max(100000).nullable().optional(),
      crewSize: z.number().min(1).max(50).nullable().optional(),
      productiveHoursPerDay: z.number().min(1).max(24).nullable().optional(),
      hourOverrides: z.record(z.string(), z.number().min(0).max(100000)).optional(),
      includeNonInstallTime: z.boolean().nullable().optional(),
    })
    .optional(),
});

export const convertEstimateSchema = z.object({
  estimateId: uuid,
});

export const archiveEstimateSchema = z.object({
  estimateId: uuid,
  archived: z.boolean(),
});

const unit = z.enum([
  "each", "linear_foot", "square_foot", "cubic_foot", "cubic_yard", "sheet",
  "board_foot", "gallon", "pound", "hour", "day", "allowance", "lump_sum", "other",
]);

export const createLineSchema = z.object({
  estimateId: uuid,
  description: z.string().trim().min(1).max(300),
  groupLabel: z.string().trim().max(160).nullable().optional(),
  categoryKey: z.string().trim().max(80).nullable().optional(),
  subcategoryKey: z.string().trim().max(80).nullable().optional(),
  tradeKey: z.string().trim().max(80).nullable().optional(),
  quantity: z.number().min(0).optional(),
  unitKey: unit.nullable().optional(),
});

export const updateLineSchema = z.object({
  lineId: uuid,
  description: z.string().trim().min(1).max(300).optional(),
  groupLabel: z.string().trim().max(160).nullable().optional(),
  categoryKey: z.string().trim().max(80).nullable().optional(),
  subcategoryKey: z.string().trim().max(80).nullable().optional(),
  tradeKey: z.string().trim().max(80).nullable().optional(),
  quantity: z.number().min(0).optional(),
  unitKey: unit.nullable().optional(),
  laborHours: laborHoursField(1_000_000).optional(),
  laborRate: z.number().min(0).optional(),
  materialCost: z.number().min(0).optional(),
  equipmentCost: z.number().min(0).optional(),
  subcontractorCost: z.number().min(0).optional(),
  otherCost: z.number().min(0).optional(),
  overheadPct: z.number().min(0).max(500).optional(),
  profitPct: z.number().min(0).max(500).optional(),
  contingencyPct: z.number().min(0).max(500).optional(),
  isTaxable: z.boolean().optional(),
  isClientVisible: z.boolean().optional(),
  internalNotes: z.string().trim().max(4000).nullable().optional(),
});

export const archiveLineSchema = z.object({ lineId: uuid, archived: z.boolean() });

/* ---- Unmatched line pricing & quantity completion (Phase 1) ---- */

const money = z.number().min(0).max(10_000_000);

/** Explicit, contractor-confirmed mapping of a line to a Knowledge Base item. */
export const confirmLineCatalogSchema = z.object({
  lineId: uuid,
  assemblyKey: z.string().trim().min(1).max(120),
  quantity: z.number().min(0).max(10_000_000).optional(),
  unitKey: unit.nullable().optional(),
  description: z.string().trim().min(1).max(300).optional(),
});

/** Contractor-entered pricing. Protected from automatic repricing. */
export const manualLinePricingSchema = z.object({
  lineId: uuid,
  quantity: z.number().min(0).max(10_000_000).optional(),
  unitKey: unit.nullable().optional(),
  description: z.string().trim().min(1).max(300).optional(),
  laborHours: laborHoursField(1_000_000).optional(),
  laborRate: z.number().min(0).max(100_000).optional(),
  materialCost: money.optional(),
  equipmentCost: money.optional(),
  subcontractorCost: money.optional(),
  otherCost: money.optional(),
});

/** Mark a placeholder quantity as reviewed without pricing the line. */
export const reviewLineQuantitySchema = z.object({
  lineId: uuid,
  quantity: z.number().min(0).max(10_000_000).optional(),
  unitKey: unit.nullable().optional(),
  description: z.string().trim().min(1).max(300).optional(),
});

export const listAuditSchema = z.object({ estimateId: uuid, limit: z.number().min(1).max(200).optional() });

/** Phase 3 — create a new editable revision from an existing estimate. */
export const createRevisionSchema = z.object({ estimateId: uuid });

/**
 * Apply a recognized composite assembly (e.g. platform floor) to one line.
 * Component keys are resolved directly — never free-text searched.
 */
export const applyCompositeSchema = z.object({
  lineId: uuid,
  compositeKey: z.string().trim().min(1).max(120),
  quantity: z.number().gt(0).max(10_000_000),
  unitKey: unit.nullable().optional(),
  description: z.string().trim().min(1).max(300).optional(),
  components: z
    .array(
      z.object({
        assemblyKey: z.string().trim().min(1).max(120),
        role: z.string().trim().min(1).max(80),
        quantityFactor: z.number().gt(0).max(1000),
      }),
    )
    .min(1)
    .max(12),
});

/** Labor-hour integrity sweep. Omit estimateId to scan the whole workspace. */
export const repairLaborHoursSchema = z.object({
  estimateId: z.string().uuid().optional(),
  dryRun: z.boolean().optional(),
});

/** Cost-basis / unit / plausibility audit across an estimate or the workspace. */
export const auditCostBasisSchema = z.object({
  estimateId: z.string().uuid().optional(),
  /** Report only. When false, mechanically provable repairs are written. */
  dryRun: z.boolean().optional(),
});
