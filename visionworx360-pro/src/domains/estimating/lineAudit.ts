/**
 * Estimate line audit and safe repair planning.
 *
 * One shared pass over any estimate line — legacy row, freshly derived line,
 * ballpark task — that answers four questions in a fixed order:
 *
 *   1. What KIND of cost is this?          (`costBasis`)
 *   2. Is the scope unit legal for it?     (`costBasis` unit compatibility)
 *   3. Are the labor hours defensible?     (`laborPlausibility`)
 *   4. Can the defect be PROVEN, or only suspected?
 *
 * The last question decides everything downstream. A defect is REPAIRABLE only
 * when it is mechanically provable from the line's own evidence — a permit
 * priced in hours, a per-unit rate stored where a total belongs, a unit that
 * the basis forbids. Everything else is FLAGGED for the contractor.
 *
 * Contractor authority is absolute: a value a human typed or confirmed is
 * never repaired, only ever flagged.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import {
  classifyCostBasis,
  defaultUnitForBasis,
  isFeeBasis,
  isLaborBearingBasis,
  isUnitCompatibleWithBasis,
  type TaskCostBasis,
} from "./costBasis";
import { assessHoursPlausibility, type PlausibilityAssessment } from "./laborPlausibility";
import { COUNTED_UNITS } from "./pricing/canonical";
import { resolveTradeKey } from "./tradeInference";
import type { LaborTradeKey } from "./tradeTaxonomy";

const round4 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 10000) / 10000;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export type LineAuditCode =
  /** A permit / municipal fee carrying labor hours or an hour-based quantity. */
  | "fee_modeled_as_labor"
  /** The scope unit is not legal for the task's cost basis. */
  | "unit_incompatible"
  /** Hours look like a per-unit rate sitting in the total column. */
  | "per_unit_stored_as_total"
  /** Measured unit still at the default quantity of 1 — nothing was measured. */
  | "placeholder_quantity"
  /** Installation work priced at zero labor. */
  | "missing_install_labor"
  /** Line carries no cost of any kind. */
  | "unpriced_line"
  /** Derived hours outside the defensible band for the trade/unit. */
  | "implausible_hours"
  /** A contractor value that looks wrong. Reported, never touched. */
  | "contractor_value_questionable";

export type LineAuditSeverity = "error" | "warning" | "info";

export interface AuditableLine {
  id: string;
  description?: string | null;
  quantity: number;
  unitKey: string | null;
  tradeKey?: string | null;
  categoryKey?: string | null;
  laborHours: number;
  laborRate: number;
  materialCost: number;
  equipmentCost?: number | null;
  subcontractorCost?: number | null;
  otherCost?: number | null;
  /** Explicit basis stored on the line, when the schema carries one. */
  costBasis?: string | null;
  /** Per-unit rate from the catalog / knowledge base, when known. */
  catalogHoursPerUnit?: number | null;
  /** Total hours the pricing bridge computed, when recorded in provenance. */
  computedLaborHours?: number | null;
  pricingSource?: string | null;
  isContractorOwned?: boolean;
  isQuantityPlaceholder?: boolean;
}

export interface LineAuditFinding {
  code: LineAuditCode;
  severity: LineAuditSeverity;
  message: string;
  /** True when the fix is provable from this line's own evidence. */
  repairable: boolean;
}

export interface LineRepair {
  /** Fields to write, already computed. Only present when provable. */
  patch: Partial<{
    laborHours: number;
    unitKey: string;
    otherCost: number;
    costBasis: TaskCostBasis;
  }>;
  reason: LineAuditCode;
  /** Audit trail entry describing before → after. */
  note: string;
}

export interface LineAuditResult {
  id: string;
  basis: TaskCostBasis;
  basisEvidence: string[];
  tradeKey: LaborTradeKey;
  findings: LineAuditFinding[];
  plausibility: PlausibilityAssessment;
  /** Provable repair, or null when the line may only be flagged. */
  repair: LineRepair | null;
  /** Contractor-facing one-liner explaining how the line is costed. */
  basisLabel: string;
}

const BASIS_LABELS: Record<TaskCostBasis, string> = {
  labor_production: "Production labor",
  labor_lump_sum: "Lump-sum labor",
  labor_time_and_material: "Time & material labor",
  material_unit: "Material (per unit)",
  material_lump_sum: "Material (lump sum)",
  equipment: "Equipment",
  subcontract: "Subcontract",
  permit_fee: "Permit / fee — direct cost",
  other_direct_cost: "Other direct cost",
  allowance: "Allowance",
  composite_task: "Composite task",
};

export const costBasisLabel = (basis: TaskCostBasis): string => BASIS_LABELS[basis];

const hasAnyCost = (line: AuditableLine, qty: number): boolean =>
  num(line.laborHours) * num(line.laborRate) > 0 ||
  num(line.materialCost) * qty > 0 ||
  num(line.equipmentCost) * qty > 0 ||
  num(line.subcontractorCost) * qty > 0 ||
  num(line.otherCost) * qty > 0;

/** Audit a single line. Deterministic, side-effect free, safe on every render. */
export function auditLine(line: AuditableLine): LineAuditResult {
  const qty = num(line.quantity);
  const hours = num(line.laborHours);
  const contractorOwned =
    !!line.isContractorOwned || line.pricingSource === "contractor";

  const classification = classifyCostBasis({
    description: line.description,
    unitKey: line.unitKey,
    tradeKey: line.tradeKey,
    categoryKey: line.categoryKey,
    storedBasis: line.costBasis,
    isContractorOwned: contractorOwned && !!line.costBasis,
  });
  const basis = classification.basis;
  const tradeKey = resolveTradeKey(line.tradeKey, line.description);

  const findings: LineAuditFinding[] = [];
  let repair: LineRepair | null = null;
  const setRepair = (next: LineRepair) => {
    if (!repair) repair = next;
  };

  /* 1 — a fee is never labor. Mechanically provable, always repairable. */
  if (isFeeBasis(basis)) {
    const feeUnitWrong = line.unitKey === "hour" || line.unitKey === "day";
    if (hours > 0 || feeUnitWrong) {
      findings.push({
        code: "fee_modeled_as_labor",
        severity: "error",
        message:
          "Permits, inspections and municipal fees are direct costs, not labor. Hours and hour-based units are not valid on a fee line.",
        repairable: !contractorOwned,
      });
      if (!contractorOwned) {
        const feeValue = round4(hours * num(line.laborRate) + num(line.otherCost));
        setRepair({
          patch: {
            laborHours: 0,
            costBasis: basis,
            ...(feeUnitWrong ? { unitKey: defaultUnitForBasis(basis) } : {}),
            ...(hours > 0 && feeValue > 0 ? { otherCost: feeValue } : {}),
          },
          reason: "fee_modeled_as_labor",
          note: `Fee line re-based: ${hours} hr → 0 hr, fee carried as direct cost${
            feeUnitWrong ? `, unit ${line.unitKey} → ${defaultUnitForBasis(basis)}` : ""
          }.`,
        });
      }
    }
  }

  /* 2 — unit compatibility with the basis. */
  if (line.unitKey && !isUnitCompatibleWithBasis(basis, line.unitKey)) {
    const provable = isFeeBasis(basis) || basis === "allowance";
    findings.push({
      code: "unit_incompatible",
      severity: provable ? "error" : "warning",
      message: `Unit "${line.unitKey}" is not valid for ${BASIS_LABELS[basis].toLowerCase()}.`,
      repairable: provable && !contractorOwned,
    });
    if (provable && !contractorOwned) {
      setRepair({
        patch: { unitKey: defaultUnitForBasis(basis), costBasis: basis },
        reason: "unit_incompatible",
        note: `Unit ${line.unitKey} → ${defaultUnitForBasis(basis)} for ${basis}.`,
      });
    }
  }

  /* 3 — per-unit rate stored as the total. Provable from the line's own provenance. */
  const perUnit = num(line.catalogHoursPerUnit);
  const computed = num(line.computedLaborHours);
  if (
    !contractorOwned &&
    isLaborBearingBasis(basis) &&
    qty > 1 &&
    perUnit > 0 &&
    Math.abs(hours - perUnit) < 1e-6 &&
    computed > hours
  ) {
    findings.push({
      code: "per_unit_stored_as_total",
      severity: "error",
      message: `Stored hours equal the per-unit rate (${perUnit}) rather than the total (${computed}).`,
      repairable: true,
    });
    setRepair({
      patch: { laborHours: round4(computed), costBasis: basis },
      reason: "per_unit_stored_as_total",
      note: `Labor hours ${hours} → ${round4(computed)} (${qty} × ${perUnit} hr/unit).`,
    });
  }

  /* 4 — placeholder quantity on a measured unit: never repairable, always ask. */
  const measuredUnit = !!line.unitKey && !COUNTED_UNITS.has(line.unitKey) && line.unitKey !== "hour";
  if (measuredUnit && (qty === 1 || line.isQuantityPlaceholder) && qty <= 1) {
    findings.push({
      code: "placeholder_quantity",
      severity: "warning",
      message: `Priced per ${line.unitKey} but the quantity is still the default 1 — hours and material are per-unit rates, not a real total.`,
      repairable: false,
    });
  }

  /* 5 — installation work at zero hours. */
  if (isLaborBearingBasis(basis) && hours <= 0) {
    findings.push({
      code: hasAnyCost(line, qty) ? "missing_install_labor" : "unpriced_line",
      severity: "error",
      message: hasAnyCost(line, qty)
        ? "Installation is in scope but the line carries no labor hours. Mark it material-only if that is intended."
        : "Line carries no labor, material or direct cost at all.",
      repairable: false,
    });
  }

  /* 6 — plausibility band. */
  const plausibility = assessHoursPlausibility({
    basis,
    tradeKey,
    unitKey: line.unitKey,
    quantity: qty,
    totalHours: hours,
    isContractorOwned: contractorOwned,
  });
  if (plausibility.verdict === "implausibly_low" || plausibility.verdict === "implausibly_high") {
    findings.push({
      code: "implausible_hours",
      severity: "warning",
      message: plausibility.message ?? "Derived hours are outside the defensible range.",
      repairable: false,
    });
  }

  /* 7 — questionable contractor values are reported, never repaired. */
  if (contractorOwned && findings.some((f) => f.severity === "error")) {
    findings.push({
      code: "contractor_value_questionable",
      severity: "info",
      message: "Contractor-entered values are preserved. Review is suggested, nothing was changed.",
      repairable: false,
    });
  }

  return {
    id: line.id,
    basis,
    basisEvidence: classification.evidence,
    tradeKey,
    findings,
    plausibility,
    repair: contractorOwned ? null : repair,
    basisLabel: BASIS_LABELS[basis],
  };
}

export interface EstimateAuditSummary {
  totalLines: number;
  cleanLines: number;
  repairableLines: number;
  flaggedLines: number;
  contractorProtectedLines: number;
  byCode: Record<LineAuditCode, number>;
  results: LineAuditResult[];
}

const EMPTY_COUNTS = (): Record<LineAuditCode, number> => ({
  fee_modeled_as_labor: 0,
  unit_incompatible: 0,
  per_unit_stored_as_total: 0,
  placeholder_quantity: 0,
  missing_install_labor: 0,
  unpriced_line: 0,
  implausible_hours: 0,
  contractor_value_questionable: 0,
});

/** Audit a whole estimate and produce repaired/flagged counts by category. */
export function auditEstimateLines(lines: readonly AuditableLine[]): EstimateAuditSummary {
  const results = lines.map(auditLine);
  const byCode = EMPTY_COUNTS();
  let repairableLines = 0;
  let flaggedLines = 0;
  let cleanLines = 0;
  let contractorProtectedLines = 0;

  for (const r of results) {
    for (const f of r.findings) byCode[f.code] += 1;
    if (r.findings.length === 0) cleanLines += 1;
    else if (r.repair) repairableLines += 1;
    else flaggedLines += 1;
    if (r.findings.some((f) => f.code === "contractor_value_questionable")) {
      contractorProtectedLines += 1;
    }
  }

  return {
    totalLines: results.length,
    cleanLines,
    repairableLines,
    flaggedLines,
    contractorProtectedLines,
    byCode,
    results,
  };
}
