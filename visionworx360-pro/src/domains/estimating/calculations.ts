/**
 * Pure estimating math engine.
 *
 * UI-independent, transport-independent, persistence-independent. Every
 * consumer (Contractor Edition UI, future proposals, reporting, job costing)
 * MUST calculate through this module so numbers never diverge.
 *
 * No React. No Supabase. No i18n.
 */

export interface EstimateLineCostInput {
  quantity: number;
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
}

export interface EstimateLineTotals {
  laborTotal: number;
  materialTotal: number;
  equipmentTotal: number;
  subcontractorTotal: number;
  otherTotal: number;
  directCost: number;
  overhead: number;
  profit: number;
  contingency: number;
  taxable: number;
  tax: number;
  total: number;
}

export interface EstimateTotals extends EstimateLineTotals {
  lineCount: number;
  subtotal: number;
  grandTotal: number;
}

export const round2 = (value: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

/**
 * MONEY POLICY: every monetary output below is whole dollars (half-up).
 * Quantities, hours and percentages keep their decimals.
 */
import { roundMoney as money } from "./money";
import { roundQuarterHour } from "./laborTime";
export { roundMoney, moneyPct, sumMoney, isWholeDollars } from "./money";

const num = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const pct = (base: number, percent: number) => money((base * num(percent)) / 100);

/** Calculate one line. Cost fields other than labor are per-unit and scale with quantity. */
export function calculateLine(
  line: EstimateLineCostInput,
  taxRatePct: number,
): EstimateLineTotals {
  const qty = num(line.quantity);
  const laborHours = roundQuarterHour(line.laborHours);
  const laborTotal = money(laborHours * num(line.laborRate));
  const materialTotal = money(num(line.materialCost) * qty);
  const equipmentTotal = money(num(line.equipmentCost) * qty);
  const subcontractorTotal = money(num(line.subcontractorCost) * qty);
  const otherTotal = money(num(line.otherCost) * qty);

  const directCost = money(
    laborTotal + materialTotal + equipmentTotal + subcontractorTotal + otherTotal,
  );
  const overhead = pct(directCost, line.overheadPct);
  const profit = pct(directCost + overhead, line.profitPct);
  const contingency = pct(directCost + overhead + profit, line.contingencyPct);
  const subtotal = money(directCost + overhead + profit + contingency);
  const taxable = line.isTaxable ? subtotal : 0;
  const tax = pct(taxable, taxRatePct);

  return {
    laborTotal,
    materialTotal,
    equipmentTotal,
    subcontractorTotal,
    otherTotal,
    directCost,
    overhead,
    profit,
    contingency,
    taxable,
    tax,
    total: money(subtotal + tax),
  };
}

/** Aggregate an estimate from its lines. Archived/excluded lines must be filtered by the caller. */
export function calculateEstimate(
  lines: EstimateLineCostInput[],
  taxRatePct: number,
): EstimateTotals {
  const acc: EstimateTotals = {
    lineCount: lines.length,
    laborTotal: 0,
    materialTotal: 0,
    equipmentTotal: 0,
    subcontractorTotal: 0,
    otherTotal: 0,
    directCost: 0,
    overhead: 0,
    profit: 0,
    contingency: 0,
    taxable: 0,
    tax: 0,
    total: 0,
    subtotal: 0,
    grandTotal: 0,
  };

  for (const line of lines) {
    const r = calculateLine(line, taxRatePct);
    acc.laborTotal = money(acc.laborTotal + r.laborTotal);
    acc.materialTotal = money(acc.materialTotal + r.materialTotal);
    acc.equipmentTotal = money(acc.equipmentTotal + r.equipmentTotal);
    acc.subcontractorTotal = money(acc.subcontractorTotal + r.subcontractorTotal);
    acc.otherTotal = money(acc.otherTotal + r.otherTotal);
    acc.directCost = money(acc.directCost + r.directCost);
    acc.overhead = money(acc.overhead + r.overhead);
    acc.profit = money(acc.profit + r.profit);
    acc.contingency = money(acc.contingency + r.contingency);
    acc.taxable = money(acc.taxable + r.taxable);
    acc.tax = money(acc.tax + r.tax);
    acc.total = money(acc.total + r.total);
  }

  acc.subtotal = money(acc.directCost + acc.overhead + acc.profit + acc.contingency);
  acc.grandTotal = money(acc.subtotal + acc.tax);
  return acc;
}
