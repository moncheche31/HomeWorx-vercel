/**
 * Contractor Cost Book — contracts.
 *
 * The Cost Book is a TRANSPARENCY + OVERRIDE layer over the canonical pricing
 * engine. It never prices anything itself: it only decides which baseline
 * number the engine should consume for a task, and records where that number
 * came from so the estimator is never a black box.
 *
 * Pure module — no React, no Supabase, no IO.
 */

/** Where an effective value came from, highest authority first. */
export type CostBookSource =
  | "line_manual" /** Contractor typed the cost straight onto the line. */
  | "estimate_override" /** Cost Book override scoped to THIS estimate. */
  | "company_override" /** Organization Cost Book default. */
  | "jurisdiction" /** Verified local schedule (permits). */
  | "catalog_baseline" /** VisionWorx catalog baseline. */
  | "none";

/** Human-facing precedence order. Index 0 wins. */
export const COST_BOOK_PRECEDENCE: readonly CostBookSource[] = [
  "line_manual",
  "estimate_override",
  "company_override",
  "jurisdiction",
  "catalog_baseline",
] as const;

/**
 * How a contractor thinks about a rate. These are DISPLAY/EDIT shapes; the
 * canonical internal basis stays hours-per-unit + material $/unit so gross
 * margin is applied exactly once by the pricing strategy.
 */
export type CostBookRateType =
  | "hours_per_unit"
  | "units_per_hour"
  | "total_hours"
  | "material_unit_cost"
  | "material_allowance"
  | "direct_unit_cost"
  | "equipment_cost"
  | "other_direct_cost"
  | "percent_of_valuation";

/** Fields the Cost Book can override, keyed canonically. */
export interface CostBookValues {
  hoursPerUnit?: number | null;
  setupHours?: number | null;
  minTaskHours?: number | null;
  laborRate?: number | null;
  materialUnitCost?: number | null;
  wasteFactor?: number | null;
  crewSize?: number | null;
  equipmentCost?: number | null;
  otherCost?: number | null;
  /**
   * Contractor direct-cost-per-unit shortcut ("I do painting at $1.50/SF").
   * DIRECT COST, never a selling price: the pricing strategy still adds
   * margin on top exactly once.
   */
  directUnitCost?: number | null;
}

export type CostBookField = keyof CostBookValues;

/** One field's resolved value plus the full stack behind it. */
export interface EffectiveValue {
  field: CostBookField;
  value: number | null;
  source: CostBookSource;
  stack: { source: CostBookSource; value: number | null }[];
}

export type EffectiveValueMap = Partial<Record<CostBookField, EffectiveValue>>;

/** Baseline + company override for one catalog task. */
export interface CostBookEntry {
  assemblyKey: string;
  workItem: string | null;
  tradeKey: string | null;
  categoryKey: string | null;
  unitKey: string | null;
  costBasis: string | null;
  catalogVersion: number | null;
  sourceVersion: string | null;
  productivityConvention: string | null;
  baseline: CostBookValues;
  company: CostBookValues | null;
  companyNote: string | null;
  companyUpdatedAt: string | null;
  isCustomized: boolean;
}

/** Contractor-facing trace shown in the Pricing basis drawer. */
export interface PricingBasisTrace {
  lineId: string;
  description: string | null;
  tradeKey: string | null;
  categoryKey: string | null;
  unitKey: string | null;
  quantity: number;
  quantityBasis: string | null;
  quantityBasisNote: string | null;
  quantityBasisFormula: string | null;
  quantityIsAssumedDefault: boolean;
  costBasis: string | null;
  resolutionStatus: string | null;
  pricingSource: string | null;
  isPriceOverridden: boolean;
  catalogItemKey: string | null;
  catalogEntry: CostBookEntry | null;
  /** Values actually used by the engine for this line. */
  effective: {
    hoursPerUnit: number | null;
    setupHours: number | null;
    /** Labor before quarter-hour normalization. */
    laborHoursRaw: number | null;
    /** Authoritative labor after quarter-hour normalization. */
    laborHours: number | null;
    laborRate: number | null;
    laborFormula: string | null;
    materialUnitCost: number | null;
    equipmentCost: number | null;
    subcontractorCost: number | null;
    otherCost: number | null;
    laborTotal: number | null;
    materialTotal: number | null;
    directCost: number | null;
  };
  estimateOverride: CostBookValues & { note?: string | null; at?: string | null };
  /** Per-field source labels stamped by the database trigger. */
  sources: Partial<Record<CostBookField | "laborRate", CostBookSource>>;
}

/** Scope a contractor picks when saving an override. */
export type CostBookOverrideScope = "estimate" | "company";
