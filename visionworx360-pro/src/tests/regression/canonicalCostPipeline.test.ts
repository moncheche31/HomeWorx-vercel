/**
 * UNIVERSAL ESTIMATING ENGINE — one canonical cost pipeline.
 *
 * These tests exist because two authoritative costing paths were live at the
 * same time: the detailed estimate priced canonical cost lines while a
 * scope-driven ballpark refresh priced the structured scope independently, and
 * the two disagreed by more than 2x on the same project. Every assertion here
 * defends the single-pipeline architecture.
 */

import { describe, expect, it } from "vitest";
import {
  buildCanonicalCostGraph,
  reconcileBandToCanonical,
  type CanonicalCostLine,
} from "@/domains/estimating/canonicalCostGraph";
import {
  resolveCompositeExclusivity,
  rollUpMap,
} from "@/domains/estimating/compositeExclusivity";
import {
  applyCostInvariants,
  classifyCostInvariant,
} from "@/domains/ballpark/costInvariants";
import {
  classifyProject,
  evaluateMarketSanity,
} from "@/domains/estimating/marketSanity";
import { semanticSurfaceForLine } from "@/domains/estimating/quantityEvidence";
import { calculateEngineEstimate } from "@/domains/estimating/engine/calculate";
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

const line = (over: Partial<CanonicalCostLine> = {}): CanonicalCostLine => ({
  id: "l1",
  description: "Hang and finish drywall",
  tradeKey: "drywall",
  unitKey: "square_foot",
  quantity: 1039,
  laborHours: 18.75,
  laborRate: 85,
  materialCost: 1.45,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  overheadPct: 0,
  profitPct: 0,
  contingencyPct: 0,
  isTaxable: false,
  ...over,
});

describe("one canonical cost pipeline", () => {
  it("derives the ballpark expected value FROM the detailed selling price, delta zero", () => {
    const lines = [line(), line({ id: "l2", description: "Paint walls and ceiling", quantity: 1039, laborHours: 14.5, materialCost: 0.55 })];
    const graph = buildCanonicalCostGraph(lines, config, { pricing });
    const detailed = calculateEngineEstimate(lines, config);

    expect(graph.band.expected).toBe(detailed.totals.grandTotal);
    expect(reconcileBandToCanonical(graph.band, detailed.totals.grandTotal)).toEqual({
      delta: 0,
      reconciled: true,
    });
  });

  it("keeps Low/Expected/High as uncertainty around ONE cost, never extra scope", () => {
    const graph = buildCanonicalCostGraph([line()], config, { pricing });
    expect(graph.band.low).toBeLessThan(graph.band.expected);
    expect(graph.band.high).toBeGreaterThan(graph.band.expected);
    /* Cost is invariant across the band. */
    expect(graph.costBasis.jobCost).toBe(graph.totals.jobCost);
    expect(graph.band.expected).toBe(graph.costBasis.canonicalGrandTotal);
  });

  it("widens the band for assumed quantities instead of pretending to be precise", () => {
    const firm = buildCanonicalCostGraph([line()], config, { pricing });
    const assumed = buildCanonicalCostGraph(
      [line({ quantityIsAssumedDefault: true })],
      config,
      { pricing },
    );
    expect(assumed.uncertaintyPct).toBeGreaterThan(firm.uncertaintyPct);
    expect(assumed.band.expected).toBe(firm.band.expected);
  });

  it("never inherits an unresolved line's undefensible catalog money", () => {
    /*
     * The unresolved line's own 8 hours are discarded. It is re-priced from a
     * generic trade allowance instead — recognized work is never a silent $0,
     * but it never keeps numbers it could not defend either.
     */
    const graph = buildCanonicalCostGraph(
      [line(), line({ id: "l2", resolutionStatus: "unresolved", quantity: 1, laborHours: 8 })],
      config,
      { pricing },
    );
    expect(graph.fallbackPricedLineIds).toEqual(["l2"]);
    expect(graph.assumedLineIds).toContain("l2");

    const baseline = buildCanonicalCostGraph([line()], { ...config }, { pricing }).totals
      .grandTotal;
    expect(graph.totals.grandTotal).toBeGreaterThan(baseline);
    /* Its own inherited 8 hours at $85 would have been far more than this. */
    expect(graph.totals.grandTotal).toBeLessThan(baseline + 8 * 85);

    const noFallback = buildCanonicalCostGraph(
      [line(), line({ id: "l2", resolutionStatus: "unresolved", quantity: 1, laborHours: 8 })],
      config,
      { pricing, genericTradeFallback: false },
    );
    expect(noFallback.unresolvedLineIds).toEqual(["l2"]);
    expect(noFallback.totals.grandTotal).toBe(baseline);
  });


  it("reports the top direct-cost drivers for contractor audit", () => {
    const graph = buildCanonicalCostGraph(
      [line(), line({ id: "l2", materialCost: 20, laborHours: 40 })],
      config,
      { pricing },
    );
    expect(graph.drivers[0]!.lineId).toBe("l2");
    expect(graph.drivers[0]!.sharePct).toBeGreaterThan(0);
  });

  it("marks an unconfirmed ceiling height as needing review, not as measured truth", () => {
    const graph = buildCanonicalCostGraph([line()], config, {
      pricing,
      unconfirmedEvidence: ["ceilingHeightFt"],
    });
    expect(graph.needsReview).toBe(true);
    expect(graph.reviewReasons).toContain("unconfirmed:ceilingHeightFt");
  });

  it("does not claim review-free confidence while assumptions remain", () => {
    const graph = buildCanonicalCostGraph([line({ quantityIsAssumedDefault: true })], config, {
      pricing,
    });
    expect(graph.needsReview).toBe(true);
    expect(graph.reviewReasons).toContain("assumedQuantities");
  });
});

describe("composite / atomic exclusivity", () => {
  it("rolls a bath rough-in's supply lines into the parent instead of pricing both", () => {
    const decisions = resolveCompositeExclusivity([
      { id: "parent", itemKey: "bath.rough_in" },
      { id: "child", itemKey: "plumbing.supply_lines" },
    ]);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ childId: "child", parentId: "parent" });
  });

  it("rolls circuits and code protection into a moderate electrical package", () => {
    const decisions = resolveCompositeExclusivity([
      { id: "pkg", itemKey: "electrical.moderate" },
      { id: "circuits", itemKey: "electrical.basic" },
      { id: "gfci", itemKey: "electrical.protection" },
    ]);
    expect(decisions.map((d) => d.childId).sort()).toEqual(["circuits", "gfci"]);
  });

  it("treats a raised platform floor as the new substrate, so subfloor prep is not charged twice", () => {
    const decisions = resolveCompositeExclusivity([
      { id: "platform", itemKey: "framing.raised_floor" },
      { id: "prep", itemKey: "flooring.subfloor_prep" },
    ]);
    expect(decisions[0]!.childId).toBe("prep");
  });

  it("charges the parent exactly once — children contribute zero money", () => {
    const rolled = rollUpMap(
      resolveCompositeExclusivity([
        { id: "parent", itemKey: "bath.rough_in" },
        { id: "child", itemKey: "plumbing.supply_lines" },
      ]),
    );
    const lines: CanonicalCostLine[] = [
      line({ id: "parent", quantity: 1, unitKey: "each", laborHours: 16, materialCost: 1200 }),
      line({
        id: "child",
        quantity: 1,
        unitKey: "each",
        laborHours: 4,
        materialCost: 320,
        rolledUpIntoLineId: rolled.get("child") ?? null,
      }),
    ];
    const graph = buildCanonicalCostGraph(lines, config, { pricing });
    const parentOnly = buildCanonicalCostGraph([lines[0]!], config, { pricing });

    expect(graph.rolledUpLineIds).toEqual(["child"]);
    expect(graph.totals.directCost).toBe(parentOnly.totals.directCost);
    expect(graph.totals.laborHours).toBe(parentOnly.totals.laborHours);
  });

  it("rolls up nothing when no composite parent is present", () => {
    expect(
      resolveCompositeExclusivity([
        { id: "a", itemKey: "plumbing.supply_lines" },
        { id: "b", itemKey: "electrical.basic" },
      ]),
    ).toEqual([]);
  });
});

describe("cost-basis invariants on every path", () => {
  it("gives a permit zero labor while keeping its money", () => {
    const report = applyCostInvariants([
      line({
        id: "s1:permits.allowance",
        description: "Electrical permit and inspection",
        unitKey: "each",
        quantity: 1,
        laborHours: 2,
        laborHoursPerUnit: 2,
        materialCost: 650,
      }),
    ]);
    const out = report.lines[0]!;
    expect(report.feeLineIds).toEqual(["s1:permits.allowance"]);
    expect(out.laborHours).toBe(0);
    expect(out.laborHoursPerUnit).toBeNull();
    expect(out.otherCost).toBe(170);
  });

  it("bills structural engineering as a professional service, not carpenter labor", () => {
    const report = applyCostInvariants([
      line({
        id: "s2:structural.engineering",
        description: "Structural engineering letter for LVL beam",
        unitKey: "each",
        quantity: 1,
        laborHoursPerUnit: 1,
        laborHours: 1,
        materialCost: 0,
      }),
    ]);
    const out = report.lines[0]!;
    expect(report.professionalLineIds).toEqual(["s2:structural.engineering"]);
    expect(out.laborHours).toBe(0);
    expect(out.subcontractorCost).toBe(85);
  });

  it("classifies fees and professional services from wording when the key is silent", () => {
    expect(classifyCostInvariant({ description: "Building permit fee" })).toBe("fee");
    expect(classifyCostInvariant({ description: "Architectural drawings" })).toBe("professional");
    expect(classifyCostInvariant({ description: "Hang and finish drywall" })).toBeNull();
  });

  it("leaves installation labor alone", () => {
    const report = applyCostInvariants([line({ id: "s3:drywall.hang_finish" })]);
    expect(report.lines[0]!.laborHours).toBe(18.75);
    expect(report.feeLineIds).toEqual([]);
  });
});

describe("semantic surface model — no quantity contamination", () => {
  it("refuses to bind whole-floor area to floor patching", () => {
    expect(
      semanticSurfaceForLine({
        description: "Patch and repair floor as needed",
        unitKey: "square_foot",
      }),
    ).toBeNull();
  });

  it("refuses to bind room floor area to shower wall tile", () => {
    expect(
      semanticSurfaceForLine({ description: "Shower wall tile", unitKey: "square_foot" }),
    ).toBeNull();
  });

  it("refuses to bind whole-room drywall surface to a drywall repair", () => {
    expect(
      semanticSurfaceForLine({ description: "Drywall repair at damaged area", unitKey: "square_foot" }),
    ).toBeNull();
  });

  it("still binds legitimate whole-surface drywall and paint to wall area", () => {
    expect(semanticSurfaceForLine({ description: "Hang and finish drywall", unitKey: "square_foot" })).toBe("wallArea");
    expect(semanticSurfaceForLine({ description: "Paint walls and ceiling", unitKey: "square_foot" })).toBe("wallArea");
  });

  it("keeps a shower niche out of the whole-surface path", () => {
    expect(semanticSurfaceForLine({ description: "Shower niche", unitKey: "square_foot" })).toBeNull();
  });
});

describe("cost-book override consistency", () => {
  it("moves ballpark and detailed by the same amount when a labor rate is overridden", () => {
    const base = [line()];
    const overridden = [line({ laborRate: 110 })];
    const baseGraph = buildCanonicalCostGraph(base, config, { pricing });
    const overGraph = buildCanonicalCostGraph(overridden, config, { pricing });
    const detailed = calculateEngineEstimate(overridden, config);

    expect(overGraph.band.expected).toBe(detailed.totals.grandTotal);
    expect(overGraph.band.expected).toBeGreaterThan(baseGraph.band.expected);
  });
});

describe("market sanity diagnostic (advisory only)", () => {
  it("flags an unusually high garage conversion without changing the price", () => {
    const result = evaluateMarketSanity({
      projectClass: "garage_conversion",
      finishedAreaSf: 279,
      sellingPrice: 90970,
      drivers: [],
    });
    expect(result.verdict).toBe("unusually_high");
    expect(result.messageKey).toBe("sanityHigh");
    expect(result.sellingPrice).toBe(90970);
  });

  it("passes a defensible garage conversion", () => {
    const result = evaluateMarketSanity({
      projectClass: "garage_conversion",
      finishedAreaSf: 279,
      sellingPrice: 44965,
      drivers: [],
    });
    expect(result.verdict).toBe("within");
    expect(result.messageKey).toBeNull();
  });

  it("flags an unusually low estimate too", () => {
    const result = evaluateMarketSanity({
      projectClass: "garage_conversion",
      finishedAreaSf: 279,
      sellingPrice: 5000,
      drivers: [],
    });
    expect(result.verdict).toBe("unusually_low");
  });

  it("says nothing when the project class is unknown", () => {
    expect(
      evaluateMarketSanity({ projectClass: null, finishedAreaSf: 279, sellingPrice: 90970 }).verdict,
    ).toBe("unknown");
  });

  it("limits the driver list to the top five", () => {
    const drivers = Array.from({ length: 10 }, (_, i) => ({
      lineId: `l${i}`,
      description: `d${i}`,
      tradeKey: null,
      directCost: 100 - i,
      laborHours: 1,
      sharePct: 10,
    }));
    expect(
      evaluateMarketSanity({
        projectClass: "garage_conversion",
        finishedAreaSf: 279,
        sellingPrice: 200000,
        drivers,
      }).topDrivers,
    ).toHaveLength(5);
  });

  it("classifies a garage conversion from project wording", () => {
    expect(classifyProject("Master Suite Garage Conversion")).toBe("garage_conversion");
    expect(classifyProject("Hall bathroom remodel")).toBe("bathroom_remodel");
    expect(classifyProject("")).toBeNull();
  });
});
