/**
 * ONE totals derivation for every surface (D3).
 *
 * The Estimate tab, the proposal and any preview of a saved estimate all read
 * their numbers from here. Nothing else may call `calculateEngineEstimate`,
 * `withJobEconomics` or `calculateEstimate` directly on estimate line rows —
 * duplicated derivation is how one tab ends up right and another stale.
 */
import {
  calculateEngineEstimate,
  calculateEstimate,
  pricingStrategyOf,
  withJobEconomics,
  type EngineLineInput,
  type EstimateEngineConfig,
  type EstimateEngineResult,
  type EstimateTotals,
} from "@/domains/estimating";
import type { EstimateDTO, EstimateLineDTO } from "../types";

/** The subset of an estimate the cost model needs. */
export type EstimatePricingSource = Pick<
  EstimateDTO,
  | "currency"
  | "taxRate"
  | "defaultOverheadPct"
  | "defaultProfitPct"
  | "defaultContingencyPct"
  | "defaultLaborRate"
  | "pricingMethod"
  | "targetGrossMarginPct"
>;

/** Per-line contractor edits not yet persisted (Estimate tab drafts). */
export type LineDraft = Partial<
  Pick<
    EstimateLineDTO,
    | "quantity"
    | "laborHours"
    | "laborRate"
    | "materialCost"
    | "equipmentCost"
    | "subcontractorCost"
    | "otherCost"
    | "overheadPct"
    | "profitPct"
    | "contingencyPct"
  >
>;

export function estimateEngineConfig(
  estimate: EstimatePricingSource | null | undefined,
): EstimateEngineConfig {
  return {
    currency: estimate?.currency ?? "USD",
    taxRatePct: estimate?.taxRate ?? 0,
    defaultOverheadPct: estimate?.defaultOverheadPct ?? 0,
    defaultProfitPct: estimate?.defaultProfitPct ?? 0,
    defaultContingencyPct: estimate?.defaultContingencyPct ?? 0,
    pricingStrategy: estimate ? pricingStrategyOf(estimate) : undefined,
  };
}

export function toEngineLines(
  lines: EstimateLineDTO[],
  drafts: Record<string, LineDraft> = {},
): EngineLineInput[] {
  return lines.map((line): EngineLineInput => {
    const d = drafts[line.id] ?? {};
    return {
      id: line.id,
      description: line.description,
      groupLabel: line.groupLabel,
      categoryKey: line.categoryKey,
      tradeKey: line.tradeKey,
      unitKey: line.unitKey,
      quantity: d.quantity ?? line.quantity,
      laborHours: d.laborHours ?? line.laborHours,
      laborRate: d.laborRate ?? line.laborRate,
      materialCost: d.materialCost ?? line.materialCost,
      equipmentCost: d.equipmentCost ?? line.equipmentCost,
      subcontractorCost: d.subcontractorCost ?? line.subcontractorCost,
      otherCost: d.otherCost ?? line.otherCost,
      overheadPct: d.overheadPct ?? line.overheadPct,
      profitPct: d.profitPct ?? line.profitPct,
      contingencyPct: d.contingencyPct ?? line.contingencyPct,
      isTaxable: line.isTaxable,
    };
  });
}

export interface EstimateTotalsResult {
  config: EstimateEngineConfig;
  engineLines: EngineLineInput[];
  /** Per-line results aligned with `engineLines`, before job economics. */
  base: EstimateEngineResult;
  /** Totals the contractor is shown, small-job economics included. */
  engine: EstimateEngineResult;
  isSmallJob: boolean;
  /** Cost-bucket totals over the persisted rows (proposal presentation). */
  totals: EstimateTotals;
}

/**
 * The single canonical derivation. Callers pass the estimate header and its
 * active (non-archived) lines; drafts are optional live edits.
 */
export function computeEstimateTotals(
  estimate: EstimatePricingSource | null | undefined,
  lines: EstimateLineDTO[],
  drafts: Record<string, LineDraft> = {},
): EstimateTotalsResult {
  const config = estimateEngineConfig(estimate);
  const engineLines = toEngineLines(lines, drafts);
  const base = calculateEngineEstimate(engineLines, config);
  const economics = withJobEconomics(engineLines, config, {
    laborRate: estimate?.defaultLaborRate ?? 0,
  });
  return {
    config,
    engineLines,
    base,
    engine: economics.engine,
    isSmallJob: economics.isSmallJob,
    totals: calculateEstimate(
      engineLines.map((l) => ({
        quantity: l.quantity ?? 0,
        laborHours: l.laborHours ?? 0,
        laborRate: l.laborRate ?? 0,
        materialCost: l.materialCost ?? 0,
        equipmentCost: l.equipmentCost ?? 0,
        subcontractorCost: l.subcontractorCost ?? 0,
        otherCost: l.otherCost ?? 0,
        overheadPct: l.overheadPct ?? 0,
        profitPct: l.profitPct ?? 0,
        contingencyPct: l.contingencyPct ?? 0,
        isTaxable: l.isTaxable ?? false,
      })),
      config.taxRatePct,
    ),
  };
}
