/**
 * One cost model, two presentations.
 *
 * A preliminary (ballpark) estimate and a final detailed estimate must be
 * expressible in the SAME cost model: direct cost -> contingency -> job cost
 * -> pricing method -> selling price -> tax. A preliminary range may widen
 * around that model to express uncertainty, but its recommended value must
 * never come from a second, contradictory formula.
 *
 * This module holds the exact inverse of the engine's pricing math, so a saved
 * ballpark band (which stores only money, not lines) can be decomposed back
 * into the same shape the detailed engine produces, and the contractor's
 * financial summary can read one interface in both modes.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import type { EstimateEngineTotals } from "./engine/types";
import { roundMoney as money } from "./money";
import {
  DEFAULT_PRICING_STRATEGY,
  usesTargetGrossMargin,
  type PricingStrategy,
} from "./pricingStrategy";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface DecomposeOptions {
  strategy?: PricingStrategy | null;
  contingencyPct?: number | null;
  taxRatePct?: number | null;
  /**
   * Cost split of the DIRECT cost, when it is known (the ballpark keeps one).
   * Purely presentational: it never changes the selling price.
   */
  split?: { labor?: number; material?: number; other?: number } | null;
}

/**
 * Turn a selling price (tax included) back into the canonical cost model.
 *
 * Exact inverse of the engine:
 *   overhead+profit : subtotal = direct × (1+oh) × (1+p) × (1+c)
 *   target margin   : jobCost  = subtotal × (1 − margin), jobCost = direct × (1+c)
 */
export function decomposeSellingPrice(
  sellingPriceInclTax: number,
  options: DecomposeOptions = {},
): EstimateEngineTotals {
  const strategy = options.strategy ?? DEFAULT_PRICING_STRATEGY;
  const grandTotal = Math.max(0, money(num(sellingPriceInclTax)));
  const taxRate = Math.max(0, num(options.taxRatePct)) / 100;
  const subtotal = money(grandTotal / (1 + taxRate));
  const tax = money(grandTotal - subtotal);
  const c = Math.max(0, num(options.contingencyPct)) / 100;

  let directCost = 0;
  let overhead = 0;
  let profit = 0;

  if (usesTargetGrossMargin(strategy)) {
    const jobCost = money(subtotal * (1 - strategy.targetGrossMarginPct / 100));
    directCost = money(jobCost / (1 + c));
  } else {
    const oh = Math.max(0, num(strategy.overheadPct)) / 100;
    const p = Math.max(0, num(strategy.profitPct)) / 100;
    directCost = money(subtotal / ((1 + oh) * (1 + p) * (1 + c)));
    overhead = money(directCost * oh);
    profit = money((directCost + overhead) * p);
  }

  const contingency = money((directCost + overhead + profit) * c);
  const jobCost = money(directCost + contingency);
  const grossProfit = money(Math.max(0, subtotal - jobCost));
  const grossMarginPct = subtotal > 0 ? round2((grossProfit / subtotal) * 100) : 0;

  const splitLabor = Math.max(0, num(options.split?.labor));
  const splitMaterial = Math.max(0, num(options.split?.material));
  const splitOther = Math.max(0, num(options.split?.other));
  const splitSum = splitLabor + splitMaterial + splitOther;
  const scale = splitSum > 0 ? directCost / splitSum : 0;

  return {
    lineCount: 0,
    laborHours: 0,
    crewHours: 0,
    laborTotal: money(splitLabor * scale),
    materialTotal: money(splitMaterial * scale),
    productTotal: 0,
    equipmentTotal: 0,
    subcontractorTotal: 0,
    otherTotal: splitSum > 0 ? money(splitOther * scale) : directCost,
    allowanceTotal: 0,
    directCost,
    overhead,
    profit,
    contingency,
    jobCost,
    grossProfit,
    grossMarginPct,
    subtotal,
    taxable: 0,
    tax,
    grandTotal,
  };
}
