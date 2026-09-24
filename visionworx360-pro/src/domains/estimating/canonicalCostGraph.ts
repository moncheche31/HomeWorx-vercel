/**
 * THE CANONICAL COST GRAPH — one costing pipeline for ballpark and detailed.
 *
 * Before this module the app had TWO authoritative costing paths: the detailed
 * estimate priced `estimate_line_items` through the Module 008 engine, while a
 * scope-driven ballpark refresh priced the structured scope through the sample
 * pricebook and wrote its own independent `costBasis` into
 * `estimates.range_snapshot`. The two could — and did — disagree by more than
 * 2x on the same project ($24,708 of live line cost against a $54,582
 * scope-recalc job cost), which is a correctness failure, not a rounding one.
 *
 * The rule this module enforces:
 *
 *   When an estimate has canonical cost lines, those lines ARE the cost graph.
 *   The preliminary band is derived from them. The scope pricer may only
 *   bootstrap a band for an estimate that has no lines yet.
 *
 * So the reconciliation delta between the preliminary recommended value and
 * the detailed selling price is zero by construction: they are the same number
 * out of the same engine run.
 *
 * Uncertainty (Low / High) expresses RISK AROUND THE SAME SCOPE — assumed
 * quantities, allowances and unresolved lines — never extra scope. Cost is
 * invariant across the band.
 *
 * Pure module: no React, no Supabase, no i18n, no IO.
 */

import { calculateEngineEstimate } from "./engine/calculate";
import type {
  EngineLineInput,
  EngineLineResult,
  EstimateEngineConfig,
  EstimateEngineTotals,
} from "./engine/types";
import { roundMoney as money } from "./money";
import {
  costBasisFromEngineTotals,
  type BallparkCostBasis,
  type BallparkPricingSnapshot,
} from "./ballparkCostBasis";
import { fallbackLaborHours, resolveGenericTradeFallback } from "./genericTradeFallback";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/**
 * A canonical estimate line: the engine input plus the evidence/rollup state
 * that decides how much uncertainty it contributes and whether it is priced at
 * all.
 */
export interface CanonicalCostLine extends EngineLineInput {
  /** `resolved` | `unresolved`. Unresolved lines carry no defensible cost. */
  resolutionStatus?: string | null;
  /** The quantity is a system default (usually 1), not evidence. */
  quantityIsAssumedDefault?: boolean | null;
  isQuantityPlaceholder?: boolean | null;
  /** Canonical task cost basis (`permit_fee`, `allowance`, …). */
  costBasis?: string | null;
  /**
   * This line's cost is already inside a composite parent line. It stays
   * visible to the contractor and contributes ZERO money. Parent + child are
   * never both priced.
   */
  rolledUpIntoLineId?: string | null;
}

export interface CanonicalBand {
  low: number;
  expected: number;
  high: number;
}

export interface CanonicalCostDriver {
  lineId: string;
  description: string;
  tradeKey: string | null;
  directCost: number;
  laborHours: number;
  /** Share of total direct cost, 0-100. */
  sharePct: number;
}

export interface CanonicalCostGraph {
  currency: string;
  totals: EstimateEngineTotals;
  lines: EngineLineResult[];
  band: CanonicalBand;
  costBasis: BallparkCostBasis;
  /** Half-width of the band as a percentage of expected. */
  uncertaintyPct: number;
  /** Lines that contributed no money because a composite parent covers them. */
  rolledUpLineIds: string[];
  /** Lines excluded from pricing because they have no defensible basis. */
  unresolvedLineIds: string[];
  /** Lines priced from an assumed / allowance quantity rather than evidence. */
  assumedLineIds: string[];
  drivers: CanonicalCostDriver[];
  /** Any assumption / unconfirmed-evidence condition that must be reviewed. */
  needsReview: boolean;
  reviewReasons: string[];
  /**
   * Recognized work the catalog does not cover, priced from generic trade
   * rates. These are allowances awaiting review — never silent zeros.
   */
  fallbackPricedLineIds: string[];
  /**
   * VALIDITY GUARD. A band of $0 is only a legitimate quote when the estimate
   * genuinely has no scope. Scope that exists but could not be priced is an
   * INCOMPLETE estimate state — the UI must show the pricing failure and the
   * unresolved items instead of presenting "$0 – $0" as a real number.
   */
  isValidQuote: boolean;
  invalidReason: CanonicalInvalidReason;
}

export type CanonicalInvalidReason = "scope_present_but_unpriced" | null;




/** Base uncertainty applied even to a fully evidenced estimate. */
export const BASE_UNCERTAINTY_PCT = 8;
/** Additional uncertainty at 100% assumed / allowance / unresolved cost. */
export const RISK_UNCERTAINTY_PCT = 22;
export const MAX_UNCERTAINTY_PCT = 35;

const isUnresolved = (line: CanonicalCostLine): boolean =>
  String(line.resolutionStatus ?? "").toLowerCase() === "unresolved";

const isAssumed = (line: CanonicalCostLine): boolean =>
  line.quantityIsAssumedDefault === true ||
  line.isQuantityPlaceholder === true ||
  String(line.costBasis ?? "") === "allowance";

const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * The line carries no cost at all: the catalog never priced it. Recognized work
 * in this state must be fallback-priced or explicitly unpriced, never zeroed.
 */
const hasNoCost = (line: CanonicalCostLine): boolean =>
  n(line.laborHours) * n(line.laborRate) <= 0 &&
  n(line.laborHoursPerUnit) * n(line.laborRate) <= 0 &&
  n(line.materialCost) <= 0 &&
  n(line.equipmentCost) <= 0 &&
  n(line.subcontractorCost) <= 0 &&
  n(line.otherCost) <= 0 &&
  line.product == null;


/**
 * Price the canonical cost graph.
 *
 * Composite children are zeroed rather than dropped, so the contractor still
 * sees every task while the parent carries the money exactly once. Unresolved
 * lines are zeroed too: an undefensible quantity must never become money.
 */
export function buildCanonicalCostGraph(
  lines: readonly CanonicalCostLine[],
  config: EstimateEngineConfig,
  options: {
    pricing: BallparkPricingSnapshot;
    engineVersion?: number | null;
    computedAt?: string | null;
    /** Evidence that is recorded but not confirmed (e.g. ceiling height). */
    unconfirmedEvidence?: readonly string[];
    /** Extra review reasons from the caller (scope reconciliation, etc.). */
    reviewReasons?: readonly string[];
    /**
     * Price recognized-but-uncatalogued work from generic trade rates instead
     * of zeroing it. Default ON: a silent $0 is never an acceptable answer.
     */
    genericTradeFallback?: boolean;
    /** Blended labor rate used when an unpriced line carries none. */
    fallbackLaborRate?: number | null;
  },
): CanonicalCostGraph {
  const rolledUpLineIds: string[] = [];
  const unresolvedLineIds: string[] = [];
  const assumedLineIds: string[] = [];
  const fallbackPricedLineIds: string[] = [];
  const fallbackEnabled = options.genericTradeFallback !== false;

  const priced: EngineLineInput[] = lines.map((line) => {
    const zero = { ...line, laborHours: 0, laborHoursPerUnit: null, productionRate: null, materialCost: 0, equipmentCost: 0, subcontractorCost: 0, otherCost: 0, product: null };
    if (line.rolledUpIntoLineId) {
      rolledUpLineIds.push(line.id);
      return zero;
    }
    /*
     * A line the catalog could not price is still real work. Price it from
     * generic trade rates as an explicit allowance; only refuse when there is
     * genuinely nothing to price against (no quantity, no identifiable trade,
     * or a fee basis that legitimately carries no labor).
     */
    if (isUnresolved(line) || hasNoCost(line)) {
      if (fallbackEnabled) {
        const { pricing } = resolveGenericTradeFallback(
          {
            description: line.description ?? null,
            tradeKey: line.tradeKey ?? null,
            quantity: line.quantity,
            unitKey: line.unitKey ?? null,
            laborRate: line.laborRate,
            costBasis: line.costBasis ?? null,
          },
          { laborRate: options.fallbackLaborRate ?? null },
        );
        if (pricing) {
          fallbackPricedLineIds.push(line.id);
          assumedLineIds.push(line.id);
          return {
            ...line,
            tradeKey: line.tradeKey ?? pricing.tradeKey,
            laborHours: fallbackLaborHours(line.quantity, pricing.laborHoursPerUnit),
            laborHoursPerUnit: null,
            productionRate: null,
            laborRate: pricing.laborRate,
            materialCost: pricing.materialCost,
            equipmentCost: 0,
            subcontractorCost: 0,
            otherCost: 0,
            product: null,
          } satisfies EngineLineInput;
        }
      }
      unresolvedLineIds.push(line.id);
      return zero;
    }
    if (isAssumed(line)) assumedLineIds.push(line.id);
    return line;
  });


  const engine = calculateEngineEstimate(priced, config);
  const totals = engine.totals;

  /* Risk share: how much of the priced cost rests on an assumption. */
  const byId = new Map(engine.lines.map((l) => [l.id, l] as const));
  let riskyCost = 0;
  for (const id of assumedLineIds) riskyCost += byId.get(id)?.directCost ?? 0;
  const riskShare = totals.directCost > 0 ? Math.min(1, riskyCost / totals.directCost) : 0;

  const unresolvedPenalty = Math.min(6, unresolvedLineIds.length * 1.5);
  const uncertaintyPct = round2(
    Math.min(
      MAX_UNCERTAINTY_PCT,
      BASE_UNCERTAINTY_PCT + RISK_UNCERTAINTY_PCT * riskShare + unresolvedPenalty,
    ),
  );

  /*
   * The band is uncertainty around ONE canonical selling price. Expected IS
   * the canonical selling price the detailed estimate shows — no separate
   * arithmetic, so the reconciliation delta is exactly zero.
   */
  const expected = money(totals.grandTotal);
  const band: CanonicalBand = {
    low: money(expected * (1 - uncertaintyPct / 100)),
    expected,
    high: money(expected * (1 + uncertaintyPct / 100)),
  };

  const drivers: CanonicalCostDriver[] = engine.lines
    .filter((l) => l.directCost > 0)
    .sort((a, b) => b.directCost - a.directCost)
    .slice(0, 10)
    .map((l) => {
      const src = lines.find((s) => s.id === l.id);
      return {
        lineId: l.id,
        description: src?.description ?? l.id,
        tradeKey: src?.tradeKey ?? null,
        directCost: money(l.directCost),
        laborHours: round2(l.laborHours),
        sharePct: totals.directCost > 0 ? round2((l.directCost / totals.directCost) * 100) : 0,
      };
    });

  const reviewReasons = [...(options.reviewReasons ?? [])];
  if (assumedLineIds.length > 0) reviewReasons.push("assumedQuantities");
  if (fallbackPricedLineIds.length > 0) reviewReasons.push("genericFallbackPricing");
  if (unresolvedLineIds.length > 0) reviewReasons.push("unresolvedScope");

  for (const field of options.unconfirmedEvidence ?? []) {
    reviewReasons.push(`unconfirmed:${field}`);
  }

  /*
   * VALIDITY GUARD. Meaningful scope with an all-zero band means the pricing
   * pipeline failed (no catalog match, no measurement, everything unresolved).
   * That is not a $0 quote — it is an incomplete estimate, and it must say so.
   * A genuinely empty estimate stays a valid zero.
   */
  const hasScope = lines.length > 0;
  const isZeroBand = band.expected <= 0 && band.high <= 0;
  const invalidReason: CanonicalInvalidReason =
    hasScope && isZeroBand ? "scope_present_but_unpriced" : null;
  if (invalidReason) reviewReasons.push("unpricedScope");

  return {
    currency: config.currency,
    totals,
    lines: engine.lines,
    band,
    costBasis: costBasisFromEngineTotals(totals, {
      currency: config.currency,
      pricing: options.pricing,
      engineVersion: options.engineVersion ?? null,
      computedAt: options.computedAt ?? null,
    }),
    uncertaintyPct,
    rolledUpLineIds,
    unresolvedLineIds,
    assumedLineIds,
    drivers,
    fallbackPricedLineIds,
    needsReview: reviewReasons.length > 0,
    reviewReasons: [...new Set(reviewReasons)],

    isValidQuote: invalidReason == null,
    invalidReason,
  };

}

/**
 * Reconciliation proof: the preliminary recommended value against the detailed
 * canonical selling price. Any non-zero delta is an architecture regression.
 */
export function reconcileBandToCanonical(
  band: CanonicalBand,
  canonicalGrandTotal: number,
): { delta: number; reconciled: boolean } {
  const delta = money(band.expected) - money(canonicalGrandTotal);
  return { delta, reconciled: delta === 0 };
}
