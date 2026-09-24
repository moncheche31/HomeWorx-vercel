/**
 * Pricing basis trace assembly.
 *
 * Turns the raw database trace (`public.line_pricing_basis`) into the
 * contractor-facing comparison rows the Pricing basis drawer renders:
 *
 *   VisionWorx baseline: 0.08 hr/SF
 *   Your company:        0.10 hr/SF
 *   This estimate:       0.12 hr/SF
 *   Effective:           0.12 hr/SF
 *
 * CONTRACTOR-ONLY. Nothing here may reach a customer/realtor/buyer proposal.
 *
 * Pure module — no React, no IO.
 */

import { resolveField, type PrecedenceLayers } from "./precedence";
import type {
  CostBookField,
  CostBookSource,
  CostBookValues,
  PricingBasisTrace,
} from "./types";

export interface BasisComparisonRow {
  field: CostBookField;
  baseline: number | null;
  company: number | null;
  estimate: number | null;
  effective: number | null;
  effectiveSource: CostBookSource;
  /** True when at least one contractor layer differs from the baseline. */
  isCustomized: boolean;
}

/** Fields worth comparing in the drawer, in display order. */
export const COMPARISON_FIELDS: readonly CostBookField[] = [
  "hoursPerUnit",
  "setupHours",
  "minTaskHours",
  "laborRate",
  "materialUnitCost",
  "wasteFactor",
  "crewSize",
  "equipmentCost",
  "otherCost",
  "directUnitCost",
] as const;

const layersFor = (trace: PricingBasisTrace): PrecedenceLayers => ({
  catalogBaseline: trace.catalogEntry?.baseline ?? null,
  companyOverride: trace.catalogEntry?.company ?? null,
  estimateOverride: trace.estimateOverride as CostBookValues,
  lineManual: trace.isPriceOverridden
    ? {
        hoursPerUnit: trace.effective.hoursPerUnit,
        laborRate: trace.effective.laborRate,
        materialUnitCost: trace.effective.materialUnitCost,
        equipmentCost: trace.effective.equipmentCost,
        otherCost: trace.effective.otherCost,
      }
    : null,
});

const val = (values: CostBookValues | null | undefined, field: CostBookField): number | null => {
  const v = values?.[field];
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Build the baseline / company / this-estimate / effective comparison rows. */
export function buildBasisComparison(trace: PricingBasisTrace): BasisComparisonRow[] {
  const layers = layersFor(trace);
  const rows: BasisComparisonRow[] = [];

  for (const field of COMPARISON_FIELDS) {
    const baseline = val(trace.catalogEntry?.baseline, field);
    const company = val(trace.catalogEntry?.company ?? null, field);
    const estimate = val(trace.estimateOverride as CostBookValues, field);
    if (baseline === null && company === null && estimate === null) continue;

    const resolved = resolveField(field, layers);
    rows.push({
      field,
      baseline,
      company,
      estimate,
      effective: resolved.value,
      effectiveSource: resolved.source,
      isCustomized: company !== null || estimate !== null,
    });
  }

  return rows;
}

/** Source label shown as the line's headline authority. */
export function primaryBasisSource(trace: PricingBasisTrace): CostBookSource {
  if (trace.isPriceOverridden) return "line_manual";
  const estimateKeys = Object.keys(trace.estimateOverride ?? {}).filter(
    (k) => k !== "note" && k !== "at",
  );
  if (estimateKeys.length > 0) return "estimate_override";
  if (trace.catalogEntry?.isCustomized) return "company_override";
  if (trace.catalogEntry) return "catalog_baseline";
  return "none";
}

/**
 * The labor story: raw productivity math and the normalized billable hours.
 * Both are shown so a contractor can see the quarter-hour rule at work.
 */
export function laborTraceRows(trace: PricingBasisTrace): {
  formula: string | null;
  raw: number | null;
  normalized: number | null;
  rate: number | null;
} {
  return {
    formula: trace.effective.laborFormula ?? null,
    raw: trace.effective.laborHoursRaw ?? null,
    normalized: trace.effective.laborHours ?? null,
    rate: trace.effective.laborRate ?? null,
  };
}

/** Guard used by proposal surfaces: internal basis data must never leak. */
export function stripInternalBasis<T extends Record<string, unknown>>(row: T): Omit<
  T,
  | "pricingBasis"
  | "catalogEntry"
  | "estimateOverride"
  | "laborHours"
  | "laborRate"
  | "materialCost"
  | "directCost"
> {
  const clone = { ...row } as Record<string, unknown>;
  for (const key of [
    "pricingBasis",
    "catalogEntry",
    "estimateOverride",
    "laborHours",
    "laborRate",
    "materialCost",
    "directCost",
  ]) {
    delete clone[key];
  }
  return clone as never;
}
