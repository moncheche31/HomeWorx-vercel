/**
 * Contractor-facing (INTERNAL) cost breakdown.
 *
 * One data model for every estimating workflow — ballpark from photos/video,
 * detailed estimates, realtor / rendering projects, flipper prep, homeowner
 * proposals. Nothing here re-implements pricing: callers pass numbers the
 * estimating engine already produced and this module only aggregates and
 * rolls them up by trade.
 *
 * AUDIENCE RULE: this shape is internal only. It must never be embedded in a
 * customer-, realtor-, or buyer-facing proposal document, share snapshot,
 * print/PDF output, or client portal payload.
 */

import { normalizeTradeKey, type LaborTradeKey } from "./tradeTaxonomy";
import { roundMoney as money } from "./money";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

export interface ContractorBreakdownTask {
  id: string;
  label: string;
  tradeKey: LaborTradeKey;
  quantity?: number | null;
  unitKey?: string | null;
  /** Quantity is a fabricated default (never measured or confirmed on site). */
  quantityIsAssumedDefault?: boolean;
  laborHours: number;
  crewHours: number;
  laborCost: number;
  materialCost: number;
  otherCost: number;
  total: number;
  /** Audit-only identity of the exact preliminary pricing rule used. */
  assemblyKey?: string | null;
  pricingBasis?: "book_nce2026" | "generic_trade_allowance";
  needsReview?: boolean;
  quantityBasis?: "stated" | "ballpark_allowance";
}

export interface ContractorBreakdownTrade {
  tradeKey: LaborTradeKey;
  laborHours: number;
  laborCost: number;
  materialCost: number;
  otherCost: number;
  total: number;
  taskCount: number;
}

export interface ContractorBreakdown {
  laborHours: number;
  crewHours: number;
  /** Blended hourly rate actually implied by the priced work. */
  laborRate: number | null;
  laborCost: number;
  materialCost: number;
  /** Equipment + subcontractor + other + allowances. */
  otherCost: number;
  overhead: number;
  profit: number;
  contingency: number;
  tax: number;
  /** Overhead + profit + contingency, presented as one markup figure. */
  markup: number;
  total: number;
  durationDays: number | null;
  tasks: ContractorBreakdownTask[];
  trades: ContractorBreakdownTrade[];
}

export interface ContractorBreakdownTaskInput {
  id: string;
  label: string;
  tradeKey?: string | null;
  quantity?: number | null;
  unitKey?: string | null;
  quantityIsAssumedDefault?: boolean | null;
  laborHours?: number | null;
  crewHours?: number | null;
  laborCost?: number | null;
  materialCost?: number | null;
  otherCost?: number | null;
  total?: number | null;
  assemblyKey?: string | null;
  pricingBasis?: "book_nce2026" | "generic_trade_allowance";
  needsReview?: boolean | null;
  quantityBasis?: "stated" | "ballpark_allowance";
}

export interface ContractorBreakdownExtras {
  overhead?: number;
  profit?: number;
  contingency?: number;
  tax?: number;
  durationDays?: number | null;
}

/** Trades are always a pure rollup of the task list — never an independent number. */
export function rollupTrades(
  tasks: readonly ContractorBreakdownTask[],
): ContractorBreakdownTrade[] {
  const map = new Map<LaborTradeKey, ContractorBreakdownTrade>();
  for (const task of tasks) {
    const row = map.get(task.tradeKey) ?? {
      tradeKey: task.tradeKey,
      laborHours: 0,
      laborCost: 0,
      materialCost: 0,
      otherCost: 0,
      total: 0,
      taskCount: 0,
    };
    row.laborHours = round2(row.laborHours + task.laborHours);
    row.laborCost = money(row.laborCost + task.laborCost);
    row.materialCost = money(row.materialCost + task.materialCost);
    row.otherCost = money(row.otherCost + task.otherCost);
    row.total = money(row.total + task.total);
    row.taskCount += 1;
    map.set(task.tradeKey, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/**
 * Build the internal breakdown from already-priced tasks. Pure, deterministic
 * and safe to call on every render.
 */
export function buildContractorBreakdown(
  taskInputs: readonly ContractorBreakdownTaskInput[],
  extras: ContractorBreakdownExtras = {},
): ContractorBreakdown {
  const tasks: ContractorBreakdownTask[] = taskInputs.map((input) => {
    const laborCost = money(input.laborCost ?? 0);
    const materialCost = money(input.materialCost ?? 0);
    const otherCost = money(input.otherCost ?? 0);
    const laborHours = round2(input.laborHours ?? 0);
    return {
      id: input.id,
      label: input.label,
      tradeKey: normalizeTradeKey(input.tradeKey),
      quantity: input.quantity ?? null,
      unitKey: input.unitKey ?? null,
      quantityIsAssumedDefault: Boolean(input.quantityIsAssumedDefault),
      laborHours,
      crewHours: round2(input.crewHours ?? laborHours),
      laborCost,
      materialCost,
      otherCost,
      total: money(input.total ?? laborCost + materialCost + otherCost),
      assemblyKey: input.assemblyKey ?? null,
      pricingBasis: input.pricingBasis,
      needsReview: Boolean(input.needsReview),
      quantityBasis: input.quantityBasis,
    };
  });

  const sum = (pick: (t: ContractorBreakdownTask) => number) =>
    money(tasks.reduce((acc, t) => acc + pick(t), 0));
  /* Hours are not money: they keep their decimals. */
  const sumHours = (pick: (t: ContractorBreakdownTask) => number) =>
    round2(tasks.reduce((acc, t) => acc + pick(t), 0));

  const laborHours = sumHours((t) => t.laborHours);
  const laborCost = sum((t) => t.laborCost);
  const overhead = money(extras.overhead ?? 0);
  const profit = money(extras.profit ?? 0);
  const contingency = money(extras.contingency ?? 0);
  const tax = money(extras.tax ?? 0);

  return {
    laborHours,
    crewHours: sumHours((t) => t.crewHours),
    laborRate: laborHours > 0 ? round2(laborCost / laborHours) : null,
    laborCost,
    materialCost: sum((t) => t.materialCost),
    otherCost: sum((t) => t.otherCost),
    overhead,
    profit,
    contingency,
    tax,
    markup: money(overhead + profit + contingency),
    total: money(sum((t) => t.total) + overhead + profit + contingency + tax),
    durationDays: extras.durationDays ?? null,
    tasks,
    trades: rollupTrades(tasks),
  };
}

/** True when there is nothing worth showing the contractor. */
export function isEmptyBreakdown(breakdown: ContractorBreakdown | null | undefined): boolean {
  return !breakdown || breakdown.tasks.length === 0;
}
