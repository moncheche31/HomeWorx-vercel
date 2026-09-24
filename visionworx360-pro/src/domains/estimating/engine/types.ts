/**
 * Intelligent Estimating Engine — contracts (Module 008).
 *
 * The engine is the single source of estimating truth for every VisionWorx360
 * and HomeWorx360 product. It is:
 *   - pure (no React, no Supabase, no i18n, no network)
 *   - input-agnostic (manual scope, voice, AI, photo/video, knowledge base,
 *     supplier catalog all produce the same `EngineLineInput`)
 *   - provenance-preserving (every resolved value records where it came from)
 *   - copy-on-write (overrides never mutate the source record)
 */

import type { ValuedCostField } from "../valueProvenance";
import type { PricingMethod, PricingStrategy } from "../pricingStrategy";

/** Where a resolved value came from. Superset of the 007A provenance origins. */
export type ValueSource =
  | "knowledge-base"
  | "supplier-catalog"
  | "regional-pricing"
  | "organization-default"
  | "user-override"
  | "ai-recommendation"
  | "engine-derived";

export interface ValueProvenance {
  source: ValueSource;
  /** Provider / dataset identifier, when applicable. */
  sourceId?: string | null;
  sourceVersion?: string | null;
  /** ISO 8601 timestamp of the value. */
  valueAt?: string | null;
  /** Suggested value before any contractor override. */
  suggestedValue?: number | null;
  confidence?: "high" | "medium" | "low" | null;
}

/** A numeric field plus the provenance of the number actually used. */
export interface ResolvedValue {
  value: number;
  provenance: ValueProvenance;
}

export type ResolvedFieldMap = Record<string, ValueProvenance>;

/** Optional real product attached to a line (vanity, faucet, flooring…). */
export interface LineProductSelection {
  productId: string;
  vendorKey?: string | null;
  sku?: string | null;
  name?: string | null;
  /** Frozen unit price snapshot; never re-priced retroactively. */
  unitPrice: number;
  quantityPerUnit?: number | null;
  currency?: string | null;
  snapshotAt?: string | null;
}

/**
 * One estimable unit of work. Every producer (scope builder, voice, AI,
 * knowledge base assembly) normalizes to this shape.
 */
export interface EngineLineInput {
  id: string;
  description?: string;
  groupLabel?: string | null;
  categoryKey?: string | null;
  tradeKey?: string | null;

  quantity: number;
  unitKey?: string | null;

  /** Explicit labor hours. When null the engine derives from production rate. */
  laborHours?: number | null;
  /** Labor hours consumed per unit of measure. */
  laborHoursPerUnit?: number | null;
  /** Units produced per crew hour (inverse of laborHoursPerUnit). */
  productionRate?: number | null;
  /** Workers in the crew. Used to convert labor hours to crew (calendar) hours. */
  crewSize?: number | null;
  laborRate: number;

  /** Per-unit costs. Scaled by quantity (material also by waste). */
  materialCost: number;
  equipmentCost: number;
  subcontractorCost: number;
  otherCost: number;

  /** Material waste percentage, e.g. 10 = 10% extra material purchased. */
  wasteFactorPct?: number | null;

  overheadPct: number;
  profitPct: number;
  contingencyPct: number;
  isTaxable: boolean;

  product?: LineProductSelection | null;

  /** Provenance for any of the fields above, keyed by field name. */
  provenance?: ResolvedFieldMap;
  /** Legacy 007A valued fields, accepted for interop. */
  valuedFields?: Record<string, ValuedCostField> | null;
}

export interface EngineLineResult {
  id: string;
  /** Billable quantity as entered. */
  quantity: number;
  /** Quantity of material actually purchased (quantity × waste factor). */
  materialQuantity: number;
  laborHours: number;
  /** Calendar hours for the crew: labor hours ÷ crew size. */
  crewHours: number;
  crewSize: number;

  laborTotal: number;
  materialTotal: number;
  productTotal: number;
  equipmentTotal: number;
  subcontractorTotal: number;
  otherTotal: number;

  directCost: number;
  overhead: number;
  profit: number;
  contingency: number;
  subtotal: number;
  taxable: number;
  tax: number;
  total: number;

  provenance: ResolvedFieldMap;
}

/** Project-level allowances applied on top of the line roll-up. */
export interface EstimateAllowances {
  /** Flat amounts in estimate currency. */
  travel?: number | null;
  disposal?: number | null;
  permit?: number | null;
  /** Additional named allowances (mobilization, dumpster, storage…). */
  other?: { key: string; amount: number; isTaxable?: boolean }[];
  /** Whether allowances participate in overhead/profit/contingency. */
  markupApplies?: boolean;
  isTaxable?: boolean;
}

export interface EstimateEngineConfig {
  currency: string;
  taxRatePct: number;
  /** Defaults applied to allowances (lines carry their own percentages). */
  defaultOverheadPct?: number;
  defaultProfitPct?: number;
  defaultContingencyPct?: number;
  allowances?: EstimateAllowances;
  /**
   * How markup is decided. Omitted / `overhead_profit` keeps the legacy
   * behaviour exactly (line overhead % then profit %). `target_gross_margin`
   * zeroes line overhead/profit and grosses the job cost up to the target.
   */
  pricingStrategy?: PricingStrategy;
}

export interface EstimateEngineTotals {
  lineCount: number;
  laborHours: number;
  crewHours: number;

  laborTotal: number;
  materialTotal: number;
  productTotal: number;
  equipmentTotal: number;
  subcontractorTotal: number;
  otherTotal: number;
  allowanceTotal: number;

  directCost: number;
  overhead: number;
  profit: number;
  contingency: number;
  /** Direct cost + contingency. The cost base a pricing method is applied to. */
  jobCost: number;
  /** Selling price before tax minus job cost. */
  grossProfit: number;
  /** Gross profit as a percentage of the selling price before tax. */
  grossMarginPct: number;
  subtotal: number;
  taxable: number;
  tax: number;
  /** Final selling price. */
  grandTotal: number;
}

export interface EstimateEnginePricing {
  method: PricingMethod;
  targetGrossMarginPct: number;
  overheadPct: number;
  profitPct: number;
}

export interface EstimateEngineResult {
  currency: string;
  /** The pricing method actually applied to this roll-up. */
  pricing: EstimateEnginePricing;
  totals: EstimateEngineTotals;
  lines: EngineLineResult[];
  /** Non-blocking issues (missing rate, zero quantity, etc.). */
  warnings: { lineId?: string; code: string; message: string }[];
}
