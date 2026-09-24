/**
 * Canonical estimating formulas (Pricing Integrity, Phase 1).
 *
 * There is exactly ONE approved way to turn a line's inputs into money, and it
 * lives in `calculateLine` (src/domains/estimating/calculations.ts). Every
 * other module — the SQL pricing bridge, the completion preview, the engine,
 * the range builder — must produce the same number for the same inputs.
 *
 * This module is the written contract. It adds no new math; it names the rules
 * so a future change cannot quietly reintroduce a double count.
 *
 * No React, no Supabase, no i18n, no IO.
 */

import { calculateLine, round2, type EstimateLineTotals } from "../calculations";

/**
 * The canonical formulas, in application order. Kept as data so tests and the
 * pricing-audit UI can display exactly what the engine did.
 */
export const CANONICAL_FORMULAS = {
  laborHoursPerUnit: "defaultLaborHours, else 1 / productionRate",
  laborHours: "quantity × laborHoursPerUnit — crew size NEVER multiplies",
  crewHours: "laborHours ÷ crewSize — scheduling only, not cost",
  laborTotal: "laborHours × laborRate",
  materialCostPerUnit: "materialAllowance × (1 + wasteFactor) × materialFactor",
  materialTotal: "materialCostPerUnit × quantity — waste applied exactly once",
  otherPerUnitCosts: "equipment / subcontractor / other × quantity",
  directCost: "labor + material + equipment + subcontractor + other",
  overhead: "directCost × overheadPct",
  profit: "(directCost + overhead) × profitPct",
  contingency: "(directCost + overhead + profit) × contingencyPct",
  tax: "taxable subtotal × taxRate",
  markup: "suggestedMarkupPct is provenance only — it is NEVER applied",
} as const;

/**
 * Stored `material_cost` on an estimate line is ALWAYS waste-inclusive and
 * per-unit: the pricing bridge folds `wasteFactor` in when it writes the line.
 * Consumers must therefore never re-apply waste on top of a stored line.
 */
export const STORED_MATERIAL_COST_IS_WASTE_INCLUSIVE = true;

/** The single approved line calculator. Import this, never a local copy. */
export const calculateCanonicalLine = calculateLine;

export type { EstimateLineTotals };

/** Why a line contributes little or nothing to the estimate total. */
export type PricingCollapseReason =
  | "no-quantity"
  | "placeholder-quantity"
  | "no-pricing"
  | null;

export interface CollapseCheckLine {
  quantity: number;
  unitKey: string | null;
  isQuantityPlaceholder: boolean;
  laborHours: number;
  laborRate: number;
  materialCost: number;
  equipmentCost: number;
  subcontractorCost: number;
  otherCost: number;
}

/** Units where a quantity of 1 is a real count rather than an unset default. */
export const COUNTED_UNITS = new Set(["each", "lump_sum", "allowance", "other"]);

/**
 * Root-cause detector for "the estimate collapsed to (almost) $0".
 *
 * In every real case observed, the money was not lost by the math: the line
 * was priced per square foot while its quantity was still the default 1, or it
 * was never priced at all. This names which of the two happened so the UI can
 * ask for the missing input instead of showing a wrong total.
 */
export function detectPricingCollapse(line: CollapseCheckLine): PricingCollapseReason {
  const qty = Number(line.quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) return "no-quantity";

  const measured = !!line.unitKey && !COUNTED_UNITS.has(line.unitKey);
  if (qty === 1 && (line.isQuantityPlaceholder || measured)) return "placeholder-quantity";

  const direct = round2(
    round2(Number(line.laborHours ?? 0) * Number(line.laborRate ?? 0)) +
      round2(Number(line.materialCost ?? 0) * qty) +
      round2(Number(line.equipmentCost ?? 0) * qty) +
      round2(Number(line.subcontractorCost ?? 0) * qty) +
      round2(Number(line.otherCost ?? 0) * qty),
  );
  return direct > 0 ? null : "no-pricing";
}
