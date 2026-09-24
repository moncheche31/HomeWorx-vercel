/**
 * BALLPARK COST BASIS — the fixed cost side of a preliminary estimate.
 *
 * A ballpark band (low / recommended / high) is ONE scope priced ONCE. The
 * contractor may sell that scope anywhere inside the band, but the COST of
 * doing the work does not move because they picked a different price. Cost
 * must therefore be carried forward from the engine run that produced the
 * band, never re-derived backwards from the selected selling price.
 *
 * Reverse-deriving cost (see `decomposeSellingPrice`) is only valid for a
 * canonical price produced by the active pricing method. Applying it to a
 * contractor-selected Low/High silently rewrites job cost so the displayed
 * gross margin always equals the target — mathematically misleading. This
 * module exists so that never happens: cost fields are INVARIANT, and only
 * selling price, tax, realized gross profit and realized gross margin move.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import type { EstimateEngineTotals } from "./engine/types";
import { usesTargetGrossMargin, type PricingStrategy } from "./pricingStrategy";
import { roundMoney as money } from "./money";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Provenance of the pricing settings in force when the band was produced. */
export interface BallparkPricingSnapshot {
  method: "overhead_profit" | "target_gross_margin";
  targetGrossMarginPct: number | null;
  overheadPct: number | null;
  profitPct: number | null;
  contingencyPct: number | null;
  laborRate: number | null;
}

/**
 * Everything needed to present truthful internal economics at ANY selected
 * price inside the band. Persisted alongside the band in `range_snapshot`.
 */
export interface BallparkCostBasis {
  currency: string;
  laborHours: number;
  laborCost: number;
  materialCost: number;
  equipmentCost: number;
  subcontractorCost: number;
  otherCost: number;
  directCost: number;
  contingency: number;
  /** Cost of goods sold: the number realized gross profit is measured against. */
  jobCost: number;
  /** Canonical overhead / profit from the engine run. Reference only. */
  overhead: number;
  profit: number;
  /** The canonical (recommended) selling price this cost basis produced. */
  canonicalSubtotal: number;
  canonicalGrandTotal: number;
  taxableSubtotal: number;
  pricing: BallparkPricingSnapshot;
  engineVersion: number | null;
  computedAt: string | null;
}

export function pricingSnapshotFromStrategy(
  strategy: PricingStrategy | null | undefined,
  extras: { contingencyPct?: number | null; laborRate?: number | null } = {},
): BallparkPricingSnapshot {
  const target = strategy && usesTargetGrossMargin(strategy);
  return {
    method: target ? "target_gross_margin" : "overhead_profit",
    targetGrossMarginPct: target ? num(strategy.targetGrossMarginPct) : null,
    overheadPct: target ? null : num(strategy?.overheadPct),
    profitPct: target ? null : num(strategy?.profitPct),
    contingencyPct: extras.contingencyPct == null ? null : num(extras.contingencyPct),
    laborRate: extras.laborRate == null ? null : num(extras.laborRate),
  };
}

/**
 * Capture the cost side of an engine run. The engine already applied the ONE
 * active pricing method, so nothing here re-prices anything.
 */
export function costBasisFromEngineTotals(
  totals: EstimateEngineTotals,
  options: {
    currency: string;
    pricing: BallparkPricingSnapshot;
    engineVersion?: number | null;
    computedAt?: string | null;
  },
): BallparkCostBasis {
  return {
    currency: options.currency,
    laborHours: round2(totals.laborHours),
    laborCost: money(totals.laborTotal),
    materialCost: money(totals.materialTotal + totals.productTotal + totals.allowanceTotal),
    equipmentCost: money(totals.equipmentTotal),
    subcontractorCost: money(totals.subcontractorTotal),
    otherCost: money(totals.otherTotal),
    directCost: money(totals.directCost),
    contingency: money(totals.contingency),
    jobCost: money(totals.jobCost),
    overhead: money(totals.overhead),
    profit: money(totals.profit),
    canonicalSubtotal: money(totals.subtotal),
    canonicalGrandTotal: money(totals.grandTotal),
    taxableSubtotal: money(totals.taxable),
    pricing: options.pricing,
    engineVersion: options.engineVersion ?? null,
    computedAt: options.computedAt ?? null,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object";

/**
 * Read a persisted cost basis. Returns null when the snapshot predates cost
 * capture — callers MUST then present the internal breakdown as unavailable
 * rather than inventing one.
 */
export function readBallparkCostBasis(snapshot: unknown): BallparkCostBasis | null {
  if (!isRecord(snapshot)) return null;
  const raw = isRecord(snapshot.costBasis)
    ? snapshot.costBasis
    : isRecord(snapshot.ballpark) && isRecord((snapshot.ballpark as Record<string, unknown>).costBasis)
      ? ((snapshot.ballpark as Record<string, unknown>).costBasis as Record<string, unknown>)
      : null;
  if (!raw) return null;
  const jobCost = num(raw.jobCost);
  if (!(jobCost > 0)) return null;
  const pricing = isRecord(raw.pricing) ? raw.pricing : {};
  return {
    currency: typeof raw.currency === "string" ? raw.currency : "USD",
    laborHours: num(raw.laborHours),
    laborCost: num(raw.laborCost),
    materialCost: num(raw.materialCost),
    equipmentCost: num(raw.equipmentCost),
    subcontractorCost: num(raw.subcontractorCost),
    otherCost: num(raw.otherCost),
    directCost: num(raw.directCost),
    contingency: num(raw.contingency),
    jobCost,
    overhead: num(raw.overhead),
    profit: num(raw.profit),
    canonicalSubtotal: num(raw.canonicalSubtotal),
    canonicalGrandTotal: num(raw.canonicalGrandTotal),
    taxableSubtotal: num(raw.taxableSubtotal),
    pricing: {
      method:
        pricing.method === "target_gross_margin" ? "target_gross_margin" : "overhead_profit",
      targetGrossMarginPct:
        pricing.targetGrossMarginPct == null ? null : num(pricing.targetGrossMarginPct),
      overheadPct: pricing.overheadPct == null ? null : num(pricing.overheadPct),
      profitPct: pricing.profitPct == null ? null : num(pricing.profitPct),
      contingencyPct: pricing.contingencyPct == null ? null : num(pricing.contingencyPct),
      laborRate: pricing.laborRate == null ? null : num(pricing.laborRate),
    },
    engineVersion: raw.engineVersion == null ? null : num(raw.engineVersion),
    computedAt: typeof raw.computedAt === "string" ? raw.computedAt : null,
  };
}

/**
 * THE helper for presenting a contractor-selected ballpark price.
 *
 * Every cost field is copied verbatim from the basis. Only the selling price,
 * tax, gross profit and gross margin are recomputed — so Low shows a genuinely
 * thinner realized margin and High a genuinely fatter one, against the SAME
 * job cost. Never call `decomposeSellingPrice` for this.
 */
export function totalsForSelectedBallparkPrice(
  basis: BallparkCostBasis,
  selectedSellingPriceInclTax: number,
  taxRatePct: number | null | undefined,
): EstimateEngineTotals {
  const grandTotal = Math.max(0, money(num(selectedSellingPriceInclTax)));
  const taxRate = Math.max(0, num(taxRatePct)) / 100;
  const subtotal = money(grandTotal / (1 + taxRate));
  const tax = money(grandTotal - subtotal);
  /* Realized, not target: gross profit is what is left over the FIXED cost. */
  const grossProfit = money(subtotal - basis.jobCost);
  const grossMarginPct = subtotal > 0 ? round2((grossProfit / subtotal) * 100) : 0;

  return {
    lineCount: 0,
    laborHours: basis.laborHours,
    crewHours: 0,
    laborTotal: basis.laborCost,
    materialTotal: basis.materialCost,
    productTotal: 0,
    equipmentTotal: basis.equipmentCost,
    subcontractorTotal: basis.subcontractorCost,
    otherTotal: basis.otherCost,
    allowanceTotal: 0,
    directCost: basis.directCost,
    overhead: basis.overhead,
    profit: basis.profit,
    contingency: basis.contingency,
    jobCost: basis.jobCost,
    grossProfit,
    grossMarginPct,
    subtotal,
    taxable: basis.taxableSubtotal,
    tax,
    grandTotal,
  };
}
