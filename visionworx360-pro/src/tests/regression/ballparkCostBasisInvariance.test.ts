/**
 * REGRESSION — a ballpark band position changes PRICE ONLY.
 *
 * Defect this locks out: the estimate tab used to reverse-derive job cost from
 * the selected selling price, so Low, Recommended and High all displayed the
 * configured target gross margin. Cost must be invariant and the realized
 * margin must actually move with the selection.
 */
import { describe, expect, it } from "vitest";

import {
  costBasisFromEngineTotals,
  pricingSnapshotFromStrategy,
  readBallparkCostBasis,
  totalsForSelectedBallparkPrice,
} from "@/domains/estimating/ballparkCostBasis";
import { calculateEngineEstimate } from "@/domains/estimating/engine/calculate";
import type { EngineLineInput } from "@/domains/estimating/engine/types";
import { pricingStrategyOf } from "@/domains/estimating/pricingStrategy";
import {
  mergeRangeSnapshot,
  readBallparkSlot,
  readFinishTierSlot,
  writeBallparkSlot,
  writeFinishTierSlot,
} from "@/domains/estimating/rangeSnapshotEnvelope";
import { applyBallparkBandPosition } from "@/domains/estimating/ballparkPosition";

const line = (over: Partial<EngineLineInput> & { id: string }): EngineLineInput => ({
  quantity: 1,
  laborRate: 85,
  materialCost: 0,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  overheadPct: 0,
  profitPct: 0,
  contingencyPct: 0,
  isTaxable: true,
  ...over,
});

/** One archetype per trade so the fix is proven trade-agnostic. */
const TRADES: Record<string, EngineLineInput[]> = {
  kitchenCabinets: [
    line({ id: "k1", description: "Cabinet install", quantity: 24, laborHoursPerUnit: 1.2, laborRate: 85, materialCost: 9800 }),
    line({ id: "k2", description: "Countertop", quantity: 1, laborHours: 8, laborRate: 85, materialCost: 4200 }),
  ],
  garageConversion: [
    line({ id: "g1", description: "Framing", quantity: 320, laborHoursPerUnit: 0.05, laborRate: 78, materialCost: 2400 }),
    line({ id: "g2", description: "Drywall", quantity: 1400, laborHoursPerUnit: 0.02, laborRate: 72, materialCost: 1850 }),
  ],
  bathroom: [
    line({ id: "b1", description: "Tile", quantity: 180, laborHoursPerUnit: 0.35, laborRate: 82, materialCost: 2600 }),
    line({ id: "b2", description: "Fixtures", quantity: 4, laborHours: 10, laborRate: 90, materialCost: 3100 }),
  ],
  handyman: [
    line({ id: "h1", description: "Punch list", quantity: 1, laborHours: 6, laborRate: 70, materialCost: 180 }),
  ],
  roofing: [
    line({ id: "r1", description: "Shingle tear-off and install", quantity: 26, laborHoursPerUnit: 1.1, laborRate: 76, materialCost: 6400 }),
  ],
  siteConcrete: [
    line({ id: "s1", description: "Slab pour", quantity: 640, laborHoursPerUnit: 0.06, laborRate: 80, materialCost: 5200, equipmentCost: 900 }),
  ],
};

const TARGET_STRATEGY = pricingStrategyOf({
  pricingMethod: "target_gross_margin",
  targetGrossMarginPct: 40,
  defaultOverheadPct: 10,
  defaultProfitPct: 10,
});
const OP_STRATEGY = pricingStrategyOf({
  pricingMethod: "overhead_profit",
  targetGrossMarginPct: null,
  defaultOverheadPct: 12,
  defaultProfitPct: 8,
});

function basisFor(lines: EngineLineInput[], strategy = TARGET_STRATEGY, taxRatePct = 0) {
  const run = calculateEngineEstimate(lines, { currency: "USD", taxRatePct, pricingStrategy: strategy });
  return {
    basis: costBasisFromEngineTotals(run.totals, {
      currency: "USD",
      pricing: pricingSnapshotFromStrategy(strategy, { contingencyPct: 0, laborRate: 85 }),
      engineVersion: 2,
      computedAt: "2026-01-01T00:00:00.000Z",
    }),
    totals: run.totals,
  };
}

describe.each(Object.entries(TRADES))("ballpark cost invariance — %s", (_trade, lines) => {
  const { basis, totals } = basisFor(lines);
  const recommended = totals.grandTotal;
  const low = Math.round(recommended * 0.85 * 100) / 100;
  const high = Math.round(recommended * 1.2 * 100) / 100;

  const atLow = totalsForSelectedBallparkPrice(basis, low, 0);
  const atMid = totalsForSelectedBallparkPrice(basis, recommended, 0);
  const atHigh = totalsForSelectedBallparkPrice(basis, high, 0);

  it("keeps job cost and direct cost identical at low, recommended and high", () => {
    expect(atLow.jobCost).toBe(basis.jobCost);
    expect(atMid.jobCost).toBe(basis.jobCost);
    expect(atHigh.jobCost).toBe(basis.jobCost);
    expect(new Set([atLow.directCost, atMid.directCost, atHigh.directCost]).size).toBe(1);
  });

  it("keeps labor hours, labor cost and material cost identical", () => {
    for (const t of [atLow, atMid, atHigh]) {
      expect(t.laborHours).toBe(basis.laborHours);
      expect(t.laborTotal).toBe(basis.laborCost);
      expect(t.materialTotal).toBe(basis.materialCost);
    }
  });

  it("moves the selling price with the selection", () => {
    expect(atLow.grandTotal).toBeLessThan(atMid.grandTotal);
    expect(atHigh.grandTotal).toBeGreaterThan(atMid.grandTotal);
  });

  it("reports a genuinely different realized gross margin at each position", () => {
    expect(atLow.grossMarginPct).toBeLessThan(atMid.grossMarginPct);
    expect(atHigh.grossMarginPct).toBeGreaterThan(atMid.grossMarginPct);
  });

  it("hits the configured target only at the canonical recommended price", () => {
    expect(atMid.grossMarginPct).toBeCloseTo(40, 0);
    expect(Math.abs(atLow.grossMarginPct - 40)).toBeGreaterThan(1);
    expect(Math.abs(atHigh.grossMarginPct - 40)).toBeGreaterThan(1);
  });

  it("never back-solves cost under overhead + profit either", () => {
    const op = basisFor(lines, OP_STRATEGY);
    const opLow = totalsForSelectedBallparkPrice(op.basis, op.totals.grandTotal * 0.85, 0);
    expect(opLow.jobCost).toBe(op.basis.jobCost);
    /* The configured O/P snapshot stays as canonical reference. */
    expect(opLow.overhead).toBe(op.basis.overhead);
    expect(opLow.profit).toBe(op.basis.profit);
    expect(opLow.grossProfit).toBeLessThan(op.totals.grossProfit);
  });
});

describe("tax handling at a selected ballpark price", () => {
  it("splits the selected price into subtotal and tax without touching cost", () => {
    const { basis, totals } = basisFor(TRADES.kitchenCabinets, TARGET_STRATEGY, 8.25);
    const selected = totals.grandTotal;
    const out = totalsForSelectedBallparkPrice(basis, selected, 8.25);
    expect(out.grandTotal).toBeCloseTo(selected, 1);
    expect(out.subtotal + out.tax).toBeCloseTo(out.grandTotal, 1);
    expect(out.jobCost).toBe(basis.jobCost);
  });
});

describe("no fabricated cost basis", () => {
  it("returns null for a legacy snapshot with no cost basis", () => {
    expect(readBallparkCostBasis({ kind: "ballpark", band: { low: 1, expected: 2, high: 3 } })).toBeNull();
  });

  it("reads a persisted cost basis from the envelope", () => {
    const { basis } = basisFor(TRADES.bathroom);
    const snapshot = writeBallparkSlot(null, { kind: "ballpark", band: { low: 1, expected: 2, high: 3 }, costBasis: basis });
    expect(readBallparkCostBasis(readBallparkSlot(snapshot))?.jobCost).toBe(basis.jobCost);
  });
});

describe("range snapshot envelope — no more slot collision", () => {
  const ballpark = { kind: "ballpark", mode: "ballpark", currency: "USD", band: { low: 100, expected: 120, high: 150 } };
  const tiers = { currency: "USD", calculatedAt: "2026-01-01", tiers: [{ tier: "better", low: 1, mid: 2, high: 3 }] };

  it("keeps finish tiers when a ballpark is saved", () => {
    const withTiers = writeFinishTierSlot(null, tiers);
    const next = writeBallparkSlot(withTiers, ballpark);
    expect(readFinishTierSlot(next)).toEqual(tiers);
    expect(readBallparkSlot(next)).toEqual(ballpark);
  });

  it("keeps the ballpark and its selected band position when finish tiers are saved", () => {
    const positioned = applyBallparkBandPosition(ballpark, "high");
    const envelope = writeBallparkSlot(null, positioned);
    const next = writeFinishTierSlot(envelope, tiers);
    const slot = readBallparkSlot(next) as Record<string, unknown>;
    expect(slot.selectedBandPosition).toBe("high");
    expect(readFinishTierSlot(next)).toEqual(tiers);
  });

  it("upgrades legacy top-level snapshots without destroying them", () => {
    expect(readBallparkSlot(ballpark)).toEqual(ballpark);
    expect(readFinishTierSlot(tiers)).toEqual(tiers);
    const upgraded = mergeRangeSnapshot(ballpark, tiers);
    expect(readBallparkSlot(upgraded)).toEqual(ballpark);
    expect(readFinishTierSlot(upgraded)).toEqual(tiers);
  });

  it("routes an unknown snapshot shape while carrying both slots forward", () => {
    const envelope = writeFinishTierSlot(writeBallparkSlot(null, ballpark), tiers);
    const next = mergeRangeSnapshot(envelope, { note: "other" }) as Record<string, unknown>;
    expect(next.note).toBe("other");
    expect(readBallparkSlot(next)).toEqual(ballpark);
    expect(readFinishTierSlot(next)).toEqual(tiers);
  });
});

describe("finish tiers stay a separate concept from band position", () => {
  it("uses one factor table for the quality tiers", async () => {
    const levels = await import("@/domains/estimating/preliminaryLevels");
    const range = await import("@/domains/estimating/range/calculate");
    expect(levels.LEVEL_TIER).toEqual({ economy: "good", recommended: "better", premium: "best" });
    /* preliminaryLevels must consume the range tier spec, not clone it. */
    expect(range.TIER_SPEC[levels.LEVEL_TIER.economy]).toBeTruthy();
  });

  it("a band position never changes material or labor assumptions", () => {
    const { basis } = basisFor(TRADES.roofing);
    const a = totalsForSelectedBallparkPrice(basis, 1000, 0);
    const b = totalsForSelectedBallparkPrice(basis, 5000, 0);
    expect(a.laborHours).toBe(b.laborHours);
    expect(a.materialTotal).toBe(b.materialTotal);
  });
});
