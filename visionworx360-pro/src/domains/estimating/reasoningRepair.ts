/**
 * GENERIC REASONING REPAIR PLANNER.
 *
 * Turns the findings of the canonical calculation model into a safe, auditable
 * set of database patches. Three outcomes only, and they are decided by
 * provenance, never by magnitude:
 *
 *   repaired  — the line's own evidence proves the stored value contradicts
 *               the calculation it claims to be (per-unit rate stored as a
 *               total, extension that ignores quantity, markup applied twice).
 *   flagged   — something is inconsistent but the correct value is a judgement
 *               call. The contractor is asked; nothing is rewritten.
 *   preserved — the contractor typed or confirmed it. Untouchable, including a
 *               deliberate 0.1 hr.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import type { CanonicalLine, ReasoningCode, ReasoningFinding } from "./canonicalLine";

export type RepairAction = "repaired" | "flagged" | "preserved";

/** Findings whose corrected value is proven by the line's own inputs. */
const AUTO_REPAIRABLE: ReasoningCode[] = [
  "per_unit_hours_stored_as_total",
  "hours_scaled_twice",
  "hours_not_scaled_by_quantity",
  "labor_cost_disagrees_with_hours",
  "material_cost_disagrees_with_quantity",
  "waste_applied_inconsistently",
  "direct_cost_disagrees_with_components",
  "markup_embedded_in_line_cost",
  "contingency_or_tax_applied_at_line",
];

export interface LinePatch {
  labor_hours?: number;
  labor_hours_basis?: string;
  labor_hours_per_unit?: number | null;
  labor_hours_setup?: number;
  labor_hours_formula?: string;
  labor_hours_previous?: number;
  labor_hours_repaired_at?: string;
  labor_hours_flag?: string | null;
  labor_total?: number;
  material_total?: number;
  equipment_total?: number;
  subcontractor_total?: number;
  other_total?: number;
  direct_cost?: number;
  overhead_pct?: number;
  profit_pct?: number;
  contingency_pct?: number;
}

export interface RepairPlanEntry {
  lineId: string;
  description: string;
  action: RepairAction;
  codes: ReasoningCode[];
  reason: string;
  patch: LinePatch;
  before: { laborHours: number; directCost: number };
  after: { laborHours: number; directCost: number };
}

export interface RepairPlan {
  entries: RepairPlanEntry[];
  repaired: number;
  flagged: number;
  preserved: number;
}

export function planLineRepair(
  line: CanonicalLine,
  raw: {
    description?: string | null;
    laborHours?: number | null;
    directCost?: number | null;
    isPriceOverridden?: boolean | null;
  },
  now = new Date().toISOString(),
): RepairPlanEntry {
  const description = raw.description ?? "";
  const before = { laborHours: Number(raw.laborHours ?? 0), directCost: Number(raw.directCost ?? 0) };
  const codes = line.findings.map((f) => f.code);
  const reasonOf = (fs: ReasoningFinding[]) => fs.map((f) => f.message).join(" ");

  if (line.findings.length === 0) {
    return {
      lineId: line.id,
      description,
      action: "preserved",
      codes: [],
      reason: "Consistent with the canonical model.",
      patch: {},
      before,
      after: { laborHours: line.totalLaborHours, directCost: line.directCost },
    };
  }

  const autos = line.findings.filter(
    (f) => f.isRepairable && AUTO_REPAIRABLE.includes(f.code),
  );

  /* Contractor authority wins over every automatic correction of labor. */
  const laborAutos = autos.filter((f) => f.field === "laborHours" || f.field === "laborTotal");
  if (line.isLaborContractorOwned && laborAutos.length > 0 && autos.length === laborAutos.length) {
    return {
      lineId: line.id,
      description,
      action: "preserved",
      codes,
      reason: "Contractor-entered labor hours are authoritative and were left untouched.",
      patch: {},
      before,
      after: before,
    };
  }

  if (autos.length === 0) {
    return {
      lineId: line.id,
      description,
      action: "flagged",
      codes,
      reason: reasonOf(line.findings),
      patch: { labor_hours_flag: codes[0] ?? "review" },
      before,
      after: before,
    };
  }

  const patch: LinePatch = {};
  const has = (c: ReasoningCode) => autos.some((f) => f.code === c);

  if (!line.isLaborContractorOwned && (has("per_unit_hours_stored_as_total") || has("hours_scaled_twice") || has("hours_not_scaled_by_quantity"))) {
    patch.labor_hours = line.totalLaborHours;
    patch.labor_hours_previous = before.laborHours;
    patch.labor_hours_basis = line.laborHoursBasis;
    patch.labor_hours_per_unit = line.hoursPerUnit;
    patch.labor_hours_setup = line.setupHours;
    patch.labor_hours_formula = line.laborHoursFormula;
    patch.labor_hours_repaired_at = now;
    patch.labor_hours_flag = null;
  }
  /* Extensions are only rewritten when the hours behind them are settled:
   * either they were just repaired, or the stored hours already agree with the
   * canonical calculation. An unresolved hours disagreement is never quietly
   * baked into a cost. */
  const hoursSettled =
    patch.labor_hours != null ||
    Math.abs(line.totalLaborHours - before.laborHours) <= Math.max(before.laborHours * 0.001, 1e-6);
  if (!raw.isPriceOverridden && hoursSettled) {
    patch.labor_total = line.laborCost;
    patch.material_total = line.materialCost;
    patch.equipment_total = line.equipmentCost;
    patch.subcontractor_total = line.subcontractorCost;
    patch.other_total = line.otherCost;
    patch.direct_cost = line.directCost;
  }
  if (has("markup_embedded_in_line_cost")) {
    patch.overhead_pct = 0;
    patch.profit_pct = 0;
  }
  if (has("contingency_or_tax_applied_at_line")) patch.contingency_pct = 0;

  return {
    lineId: line.id,
    description,
    action: "repaired",
    codes,
    reason: reasonOf(autos),
    patch,
    before,
    after: { laborHours: line.totalLaborHours, directCost: line.directCost },
  };
}

export function summarizePlan(entries: RepairPlanEntry[]): RepairPlan {
  const count = (a: RepairAction) => entries.filter((e) => e.action === a).length;
  return {
    entries,
    repaired: count("repaired"),
    flagged: count("flagged"),
    preserved: count("preserved"),
  };
}
