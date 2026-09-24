/**
 * Rate-type translation for the Cost Book.
 *
 * Contractors think in different units for the same fact ("0.08 hr/SF" vs
 * "12.5 SF/hr" vs "$1.50/SF"). We accept every shape at the edit surface and
 * store ONE canonical basis so the engine cannot double-count.
 *
 * Hard rule: a direct-cost unit rate is NOT a selling price. Gross margin /
 * overhead+profit are applied once, later, by the pricing strategy.
 *
 * Pure module — no React, no IO.
 */

import { roundQuarterHour } from "@/domains/estimating/laborTime";
import { roundMoney } from "@/domains/estimating/money";
import type { CostBookRateType } from "./types";

const finite = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** hours per unit -> units per hour. */
export function unitsPerHour(hoursPerUnit: unknown): number | null {
  const h = finite(hoursPerUnit);
  if (h <= 0) return null;
  return Math.round((1 / h) * 100) / 100;
}

/** units per hour -> hours per unit (canonical). */
export function hoursPerUnitFromRate(unitsPerHourValue: unknown): number | null {
  const r = finite(unitsPerHourValue);
  if (r <= 0) return null;
  return Math.round((1 / r) * 10000) / 10000;
}

/** Normalize whatever the contractor typed into canonical hours per unit. */
export function toHoursPerUnit(
  rateType: CostBookRateType,
  value: unknown,
  quantity?: unknown,
): number | null {
  switch (rateType) {
    case "hours_per_unit":
      return finite(value) > 0 ? Math.round(finite(value) * 10000) / 10000 : null;
    case "units_per_hour":
      return hoursPerUnitFromRate(value);
    case "total_hours": {
      const q = finite(quantity);
      const total = finite(value);
      if (total <= 0 || q <= 0) return null;
      return Math.round((total / q) * 10000) / 10000;
    }
    default:
      return null;
  }
}

/**
 * Authoritative labor hours for a task: setup + quantity x hours-per-unit,
 * normalized to the quarter-hour grid. Exact math stays in full precision
 * until this final normalization.
 */
export function laborHoursFor(input: {
  quantity: unknown;
  hoursPerUnit?: unknown;
  setupHours?: unknown;
}): { raw: number; normalized: number } {
  const raw = finite(input.setupHours) + finite(input.hoursPerUnit) * finite(input.quantity);
  return { raw, normalized: roundQuarterHour(raw) };
}

/**
 * Informational direct cost per unit. Display only — it explains the line, it
 * never replaces the labor productivity basis.
 */
export function directCostPerUnit(input: {
  quantity: unknown;
  directCost: unknown;
}): number | null {
  const q = finite(input.quantity);
  if (q <= 0) return null;
  return Math.round((finite(input.directCost) / q) * 100) / 100;
}

/** Direct cost implied by a contractor's $/unit direct-cost rate. */
export function directCostFromUnitRate(unitRate: unknown, quantity: unknown): number {
  return roundMoney(finite(unitRate) * finite(quantity));
}

/** Rate types that describe labor productivity rather than money. */
export const LABOR_RATE_TYPES: readonly CostBookRateType[] = [
  "hours_per_unit",
  "units_per_hour",
  "total_hours",
] as const;

/** True when the rate type expresses money, so whole-dollar rules apply. */
export function isMoneyRateType(rateType: CostBookRateType): boolean {
  return !LABOR_RATE_TYPES.includes(rateType) && rateType !== "percent_of_valuation";
}
