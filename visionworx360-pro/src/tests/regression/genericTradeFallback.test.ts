/**
 * GENERIC TRADE FALLBACK — recognized work is never a silent $0.
 *
 * A real remodel ("remove 6 LF of wall, remove the closet, install an LVL,
 * build the built-in bookcases") returned a $0 – $0 suggested price because no
 * catalog assembly covered the closet or the built-ins, and the cost graph
 * zeroed every uncatalogued line. These tests defend the repair:
 *
 *  - recognized work with a quantity and a trade is priced from a documented
 *    generic trade rate and flagged as an allowance needing review,
 *  - work with no usable quantity or no identifiable trade stays explicitly
 *    unpriced (never a silent zero),
 *  - one unmatched line never erases the priced lines around it,
 *  - a nonempty recognized scope can never produce a valid $0 – $0 quote.
 */

import { describe, expect, it } from "vitest";
import {
  buildCanonicalCostGraph,
  type CanonicalCostLine,
} from "@/domains/estimating/canonicalCostGraph";
import {
  resolveGenericTradeFallback,
  unitFamily,
  GENERIC_TRADE_RATES,
} from "@/domains/estimating/genericTradeFallback";
import type { EstimateEngineConfig } from "@/domains/estimating/engine/types";
import { pricingSnapshotFromStrategy } from "@/domains/estimating/ballparkCostBasis";
import { normalizePricingStrategy } from "@/domains/estimating/pricingStrategy";

const strategy = normalizePricingStrategy({
  pricingMethod: "target_gross_margin",
  targetGrossMarginPct: 40,
});
const config: EstimateEngineConfig = {
  currency: "USD",
  taxRatePct: 0,
  pricingStrategy: strategy,
};
const pricing = pricingSnapshotFromStrategy(strategy, { laborRate: 85 });

/** An uncatalogued line as the intake writes it: no rate, no cost, unresolved. */
const unpriced = (over: Partial<CanonicalCostLine>): CanonicalCostLine => ({
  id: "x",
  description: "",
  tradeKey: null,
  unitKey: "each",
  quantity: 1,
  laborHours: 0,
  laborRate: 0,
  materialCost: 0,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  overheadPct: 0,
  profitPct: 0,
  contingencyPct: 0,
  isTaxable: false,
  resolutionStatus: "unresolved",
  ...over,
});

/** The reported project: wall demo + closet removal + LVL + built-ins. */
const bookcaseProjectLines = (): CanonicalCostLine[] => [
  unpriced({
    id: "wall",
    description: "Remove approximately 6 LF of wall",
    tradeKey: "demolition",
    unitKey: "linear_foot",
    quantity: 6,
  }),
  unpriced({
    id: "closet",
    description: "Remove 6 LF closet",
    tradeKey: null,
    unitKey: "linear_foot",
    quantity: 6,
  }),
  unpriced({
    id: "lvl",
    description: "Install LVL structural beam",
    tradeKey: "framing",
    unitKey: "linear_foot",
    quantity: 12,
  }),
  unpriced({
    id: "bookcases",
    description: "Build built-in bookcases to match the rendering",
    tradeKey: "finish_carpentry",
    unitKey: "linear_foot",
    quantity: 10,
  }),
];

describe("generic trade fallback rates", () => {
  it("covers every trade across every unit family", () => {
    for (const [trade, families] of Object.entries(GENERIC_TRADE_RATES)) {
      for (const [family, rate] of Object.entries(families)) {
        const positive = rate.laborHoursPerUnit > 0 || rate.materialCostPerUnit > 0;
        expect(positive, `${trade}/${family}`).toBe(trade === "unassigned" ? false : true);
      }
    }
  });

  it("maps units to a family and never drops an unknown unit", () => {
    expect(unitFamily("linear_foot")).toBe("linear");
    expect(unitFamily("square_foot")).toBe("area");
    expect(unitFamily("cubic_yard")).toBe("volume");
    expect(unitFamily("wat")).toBe("count");
  });

  it("refuses to price with no quantity, no trade, or a fee basis", () => {
    expect(
      resolveGenericTradeFallback({ description: "Mystery item", quantity: 0 }).refusal,
    ).toBe("no-quantity");
    expect(
      resolveGenericTradeFallback({ description: "Miscellaneous", quantity: 3 }).refusal,
    ).toBe("no-trade");
    expect(
      resolveGenericTradeFallback({
        description: "Building permit",
        tradeKey: "general_conditions",
        quantity: 1,
        costBasis: "permit_fee",
      }).refusal,
    ).toBe("fee-basis");
  });
});

describe("A. the built-in bookcase project type prices instead of quoting $0", () => {
  const graph = buildCanonicalCostGraph(bookcaseProjectLines(), config, { pricing });

  it("produces a nonzero low / expected / high band", () => {
    expect(graph.band.low).toBeGreaterThan(0);
    expect(graph.band.expected).toBeGreaterThan(0);
    expect(graph.band.high).toBeGreaterThanOrEqual(graph.band.expected);
    expect(graph.isValidQuote).toBe(true);
  });

  it("prices the structural and carpentry work rather than dropping it", () => {
    expect(graph.fallbackPricedLineIds).toContain("lvl");
    expect(graph.fallbackPricedLineIds).toContain("bookcases");
    expect(graph.fallbackPricedLineIds).toContain("wall");
  });

  it("flags every fallback-priced line as an assumption needing review", () => {
    for (const id of graph.fallbackPricedLineIds) {
      expect(graph.assumedLineIds).toContain(id);
    }
    expect(graph.needsReview).toBe(true);
  });

  it("keeps the quarter-hour labor and whole-dollar money invariants", () => {
    for (const l of graph.lines) {
      expect(Math.round(Number(l.laborHours ?? 0) * 4) / 4).toBeCloseTo(
        Number(l.laborHours ?? 0),
        6,
      );
    }
    for (const v of [graph.band.low, graph.band.expected, graph.band.high]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe("C. invariant: recognized scope can never be a valid $0 – $0 quote", () => {
  it("marks an all-zero band with real scope as an invalid quote", () => {
    /* Nothing to price against: no trade wording, no quantity. */
    const graph = buildCanonicalCostGraph(
      [unpriced({ id: "a", description: "Miscellaneous item", quantity: 0 })],
      config,
      { pricing },
    );
    expect(graph.band.expected).toBe(0);
    expect(graph.isValidQuote).toBe(false);
    expect(graph.invalidReason).toBe("scope_present_but_unpriced");
    expect(graph.unresolvedLineIds).toContain("a");
  });

  it("never silently zeroes a line: it is priced or explicitly unresolved", () => {
    const graph = buildCanonicalCostGraph(
      [
        ...bookcaseProjectLines(),
        unpriced({ id: "vague", description: "Miscellaneous", quantity: 0 }),
      ],
      config,
      { pricing },
    );
    const accounted = new Set([
      ...graph.fallbackPricedLineIds,
      ...graph.unresolvedLineIds,
      ...graph.rolledUpLineIds,
    ]);
    for (const id of ["wall", "closet", "lvl", "bookcases", "vague"]) {
      expect(accounted.has(id), id).toBe(true);
    }
  });
});

describe("D. partial matching: one unknown item does not erase the priced ones", () => {
  it("keeps catalog-priced work intact alongside an unpriceable line", () => {
    const catalogPriced: CanonicalCostLine = {
      ...unpriced({
        id: "drywall",
        description: "Hang and finish drywall",
        tradeKey: "drywall",
        unitKey: "square_foot",
        quantity: 400,
      }),
      laborHours: 14,
      laborRate: 85,
      materialCost: 1.45,
      resolutionStatus: "resolved",
    };
    const withUnknown = buildCanonicalCostGraph(
      [catalogPriced, unpriced({ id: "vague", description: "Miscellaneous", quantity: 0 })],
      config,
      { pricing },
    );
    const alone = buildCanonicalCostGraph([catalogPriced], config, { pricing });

    expect(withUnknown.band.expected).toBe(alone.band.expected);
    expect(withUnknown.band.expected).toBeGreaterThan(0);
    expect(withUnknown.unresolvedLineIds).toEqual(["vague"]);
    expect(withUnknown.isValidQuote).toBe(true);
  });

  it("can be disabled explicitly, and then reports the unpriced lines", () => {
    const graph = buildCanonicalCostGraph(bookcaseProjectLines(), config, {
      pricing,
      genericTradeFallback: false,
    });
    expect(graph.fallbackPricedLineIds).toEqual([]);
    expect(graph.unresolvedLineIds).toHaveLength(4);
    expect(graph.isValidQuote).toBe(false);
  });
});
