/**
 * Universal regression matrix for the contractor-selectable ballpark band
 * position (Low / Recommended / High).
 *
 * Invariants, trade-agnostic:
 *  - selecting a position changes the contractor-facing selling price
 *  - the selection persists on the snapshot (survives reload)
 *  - scope, quantities, assumptions and the band itself never change
 *  - pricing method stays mutually exclusive (no O+P and target margin at once)
 *  - legacy "needs confirmation" warnings survive a selection change
 *  - customer-facing output exposes no internal cost / margin math
 */
import { describe, expect, it } from "vitest";

import {
  BALLPARK_BAND_POSITIONS,
  applyBallparkBandPosition,
  priceForBandPosition,
  readBallparkBandPosition,
  type BallparkBandPosition,
} from "@/domains/estimating/ballparkPosition";
import { readBallparkSummary } from "@/features/estimating/services/ballparkSummary";
import { computeAsIllustrated } from "@/domains/proposal/asIllustrated";

interface TradeCase {
  name: string;
  band: { low: number; expected: number; high: number };
  needsReview?: boolean;
  pricing: Record<string, unknown>;
}

const TRADES: TradeCase[] = [
  {
    name: "kitchen cabinets",
    band: { low: 5200, expected: 6027.37, high: 7400 },
    pricing: { pricingMethod: "target_gross_margin", targetGrossMarginPct: 38 },
  },
  {
    name: "garage conversion",
    band: { low: 41000, expected: 52500, high: 64000 },
    needsReview: true,
    pricing: { pricingMethod: "overhead_profit", defaultOverheadPct: 10, defaultProfitPct: 12 },
  },
  {
    name: "bathroom remodel",
    band: { low: 18400, expected: 22750, high: 27900 },
    pricing: { pricingMethod: "target_gross_margin", targetGrossMarginPct: 42 },
  },
  {
    name: "handyman small job",
    band: { low: 380, expected: 465, high: 610 },
    pricing: { pricingMethod: "overhead_profit", defaultOverheadPct: 8, defaultProfitPct: 15 },
  },
  {
    name: "roofing",
    band: { low: 14200, expected: 17600, high: 21850 },
    pricing: { pricingMethod: "target_gross_margin", targetGrossMarginPct: 30 },
  },
  {
    name: "site / concrete",
    band: { low: 9100, expected: 11400, high: 14750 },
    pricing: { pricingMethod: "overhead_profit", defaultOverheadPct: 9, defaultProfitPct: 11 },
  },
];

const snapshotFor = (trade: TradeCase) => ({
  kind: "ballpark" as const,
  version: 2,
  savedAt: "2026-01-04T00:00:00.000Z",
  needsReview: trade.needsReview === true,
  currency: "USD",
  band: trade.band,
  scope: { items: ["a", "b", "c"], assumptions: ["standard access"] },
  labor: { laborRate: 78, tasks: [{ id: "t1", description: "install", adjustedHours: 6 }] },
  pricing: trade.pricing,
});

describe.each(TRADES)("ballpark band selection — $name", (trade) => {
  it("prices each position from the saved band", () => {
    expect(priceForBandPosition(trade.band, "low")).toBe(trade.band.low);
    expect(priceForBandPosition(trade.band, "expected")).toBe(trade.band.expected);
    expect(priceForBandPosition(trade.band, "high")).toBe(trade.band.high);
  });

  it("defaults to recommended, then persists the contractor choice", () => {
    const base = snapshotFor(trade);
    expect(readBallparkBandPosition(base)).toBe("expected");

    for (const position of BALLPARK_BAND_POSITIONS) {
      const stamped = applyBallparkBandPosition(base, position);
      // Reload = re-read the persisted snapshot.
      expect(readBallparkBandPosition(JSON.parse(JSON.stringify(stamped)))).toBe(position);
    }
  });

  it("changes the contractor-facing selling price when the position changes", () => {
    const prices = BALLPARK_BAND_POSITIONS.map((position) => {
      const summary = readBallparkSummary(applyBallparkBandPosition(snapshotFor(trade), position));
      expect(summary).not.toBeNull();
      expect(summary?.selectedPosition).toBe(position);
      return summary!.selected;
    });

    expect(prices[0]).toBeLessThan(prices[1]!);
    expect(prices[1]).toBeLessThan(prices[2]!);
    expect(new Set(prices).size).toBe(3);
  });

  it("never mutates scope, assumptions, band or pricing settings", () => {
    const base = snapshotFor(trade);
    const frozen = JSON.parse(JSON.stringify(base));

    for (const position of BALLPARK_BAND_POSITIONS) {
      const next = applyBallparkBandPosition(base, position) as Record<string, unknown>;
      expect(next.scope).toEqual(frozen.scope);
      expect(next.band).toEqual(frozen.band);
      expect(next.labor).toEqual(frozen.labor);
      expect(next.pricing).toEqual(frozen.pricing);
    }
    // Input untouched.
    expect(base).toEqual(frozen);
  });

  it("keeps the pricing method mutually exclusive across selections", () => {
    for (const position of BALLPARK_BAND_POSITIONS) {
      const next = applyBallparkBandPosition(snapshotFor(trade), position) as Record<string, unknown>;
      const pricing = next.pricing as Record<string, unknown>;
      const usesMargin = pricing.pricingMethod === "target_gross_margin";
      expect(usesMargin ? pricing.targetGrossMarginPct : pricing.defaultProfitPct).toBeDefined();
      expect(usesMargin ? pricing.defaultProfitPct : pricing.targetGrossMarginPct).toBeUndefined();
    }
  });

  it("preserves a legacy needs-confirmation warning through selection", () => {
    const base = snapshotFor(trade);
    for (const position of BALLPARK_BAND_POSITIONS) {
      const next = applyBallparkBandPosition(base, position) as Record<string, unknown>;
      expect(next.needsReview).toBe(trade.needsReview === true);
    }
  });

  it("anchors the customer-facing figure on the selection without exposing internals", () => {
    const seen: Record<BallparkBandPosition, number> = { low: 0, expected: 0, high: 0 };
    for (const position of BALLPARK_BAND_POSITIONS) {
      const summary = readBallparkSummary(applyBallparkBandPosition(snapshotFor(trade), position))!;
      const illustrated = computeAsIllustrated({
        band: { low: summary.low, expected: summary.expected, high: summary.high, selected: summary.selected },
        scopeText: "standard scope",
        presentation: "contractor",
      });
      expect(illustrated).not.toBeNull();
      seen[position] = illustrated!.amount;

      const serialized = JSON.stringify(illustrated);
      for (const leak of ["laborRate", "laborHours", "directCost", "overhead", "grossProfit", "marginPct"]) {
        expect(serialized).not.toContain(leak);
      }
    }
    expect(seen.low).toBeLessThan(seen.high);
  });
});
