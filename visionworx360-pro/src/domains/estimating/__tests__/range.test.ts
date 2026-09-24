import { describe, expect, it } from "vitest";
import {
  buildEstimateRange,
  buildRangeNarrative,
  normalizeAssumptions,
  recommendationsToAdjustments,
  DEFAULT_RANGE_ASSUMPTIONS,
  MAX_REDUCTION_PCT,
  type EngineLineInput,
  type EstimateEngineConfig,
} from "../index";

const config: EstimateEngineConfig = {
  currency: "USD",
  taxRatePct: 7,
  defaultOverheadPct: 10,
  defaultProfitPct: 15,
  defaultContingencyPct: 5,
};

const line = (id: string, over: Partial<EngineLineInput> = {}): EngineLineInput => ({
  id,
  description: `Line ${id}`,
  groupLabel: "Garage",
  quantity: 10,
  laborHours: 8,
  laborRate: 75,
  materialCost: 20,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  overheadPct: 10,
  profitPct: 15,
  contingencyPct: 5,
  isTaxable: true,
  ...over,
});

const lines = [line("a"), line("b", { groupLabel: "Electrical", laborHours: 4 })];

describe("V1 estimate range engine", () => {
  it("produces Good < Better < Best midpoints", () => {
    const range = buildEstimateRange(lines, config, DEFAULT_RANGE_ASSUMPTIONS);
    const [good, better, best] = range.tiers;
    expect(good.mid).toBeLessThan(better.mid);
    expect(better.mid).toBeLessThan(best.mid);
    expect(good.low).toBeLessThanOrEqual(good.high);
  });

  it("is deterministic for identical inputs", () => {
    const a = buildEstimateRange(lines, config, { tier: "best", regionalFactor: 1.2 });
    const b = buildEstimateRange(lines, config, { tier: "best", regionalFactor: 1.2 });
    expect(a).toEqual(b);
  });

  it("selects the persisted tier and rounds the band", () => {
    const range = buildEstimateRange(lines, config, { tier: "good" });
    expect(range.selected.tier).toBe("good");
    expect(range.selected.low % 10).toBe(0);
    expect(range.selected.high % 10).toBe(0);
  });

  it("groups sections by scope section label", () => {
    const range = buildEstimateRange(lines, config, DEFAULT_RANGE_ASSUMPTIONS);
    expect(range.selected.sections.map((s) => s.label).sort()).toEqual(["Electrical", "Garage"]);
  });

  it("applies regional factor and allowances", () => {
    const base = buildEstimateRange(lines, config, DEFAULT_RANGE_ASSUMPTIONS);
    const regional = buildEstimateRange(lines, config, { regionalFactor: 1.25 });
    expect(regional.selected.mid).toBeGreaterThan(base.selected.mid);

    const withAllowance = buildEstimateRange(lines, config, {
      allowances: [{ key: "permit", amount: 1200 }],
    });
    expect(withAllowance.selected.breakdown.allowances).toBeGreaterThan(0);
    expect(withAllowance.selected.mid).toBeGreaterThan(base.selected.mid);
  });

  it("honours contractor overrides for markup fields", () => {
    const base = buildEstimateRange(lines, config, DEFAULT_RANGE_ASSUMPTIONS);
    const marked = buildEstimateRange(lines, config, { profitPct: 30 });
    expect(marked.selected.breakdown.profit).toBeGreaterThan(base.selected.breakdown.profit);
  });

  it("excludes lines the contractor removed", () => {
    const range = buildEstimateRange(lines, config, { excludedLineIds: ["a", "b"] });
    expect(range.isEmpty).toBe(true);
    expect(range.warnings.some((w) => w.code === "no-lines")).toBe(true);
  });

  it("normalizes legacy or partial persisted payloads", () => {
    expect(normalizeAssumptions(null)).toEqual(DEFAULT_RANGE_ASSUMPTIONS);
    expect(normalizeAssumptions({ tier: "nope", regionalFactor: 99 }).tier).toBe("better");
    expect(normalizeAssumptions({ regionalFactor: 99 }).regionalFactor).toBe(3);
  });

  it("maps accepted review recommendations to range adjustments", () => {
    const adjustments = recommendationsToAdjustments(
      [
        {
          id: "u1",
          sectionKey: "upsell",
          label: "Heated floor",
          customerLabel: "Heated floor",
          typicalPriceRange: { low: 1500, high: 2500 },
        },
        {
          id: "v1",
          sectionKey: "value_engineering",
          label: "Laminate instead of tile",
          customerLabel: "Laminate instead of tile",
          valueEngineering: { savingsPct: 10 },
        },
      ],
      20000,
    );
    expect(adjustments).toHaveLength(2);
    expect(adjustments[0]).toMatchObject({ kind: "add", low: 1500, high: 2500 });
    expect(adjustments[1]?.kind).toBe("reduce");
  });

  it("writes a plain-language bilingual narrative", () => {
    const range = buildEstimateRange(lines, config, DEFAULT_RANGE_ASSUMPTIONS);
    const en = buildRangeNarrative(range, { locale: "en-US" });
    const es = buildRangeNarrative(range, { locale: "es-US" });
    expect(en).toContain("estimated investment");
    expect(en).toContain("$");
    expect(es).toContain("inversión estimada");
  });

  it("reports an empty range with no scope", () => {
    const range = buildEstimateRange([], config, DEFAULT_RANGE_ASSUMPTIONS);
    expect(range.isEmpty).toBe(true);
    expect(buildRangeNarrative(range, { locale: "en-US" })).toContain("not enough scope");
  });

  it("never lets accepted reductions zero out a priced estimate", () => {
    const reductions = Array.from({ length: 8 }, (_, i) => ({
      id: `r${i}`,
      label: `Saving ${i}`,
      kind: "reduce" as const,
      low: 20000,
      high: 30000,
    }));
    const range = buildEstimateRange(lines, config, { adjustments: reductions });
    const base = buildEstimateRange(lines, config, DEFAULT_RANGE_ASSUMPTIONS);

    expect(range.selected.base.mid).toBe(base.selected.mid);
    expect(range.selected.adjustmentImpact.capped).toBe(true);
    expect(range.selected.adjustmentImpact.reduceHigh).toBeLessThanOrEqual(
      base.selected.mid * (MAX_REDUCTION_PCT / 100) + 1,
    );
    expect(range.selected.high).toBeGreaterThan(0);
    expect(range.selected.low).toBeGreaterThanOrEqual(0);
  });

  it("deduplicates repeated adjustments by id", () => {
    const dup = { id: "x", label: "x", kind: "add" as const, low: 100, high: 200 };
    const range = buildEstimateRange(lines, config, { adjustments: [dup, dup, dup] });
    expect(range.selected.adjustments).toHaveLength(1);
    expect(range.selected.adjustmentImpact.addHigh).toBe(200);
  });

  it("keeps only the strongest saving among competing alternatives", () => {
    const adjustments = recommendationsToAdjustments(
      [
        {
          id: "a",
          sectionKey: "value_engineering",
          itemKey: "ve.countertop.laminate",
          label: "Laminate tops",
          customerLabel: "Laminate tops",
          valueEngineering: { savingsPct: 8 },
        },
        {
          id: "b",
          sectionKey: "value_engineering",
          itemKey: "ve.countertop.quartz",
          label: "Quartz remnant tops",
          customerLabel: "Quartz remnant tops",
          valueEngineering: { savingsPct: 4 },
        },
      ],
      20000,
    );
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]?.id).toBe("a");
  });

  it("caps a single value-engineering option's savings claim", () => {
    const [adjustment] = recommendationsToAdjustments(
      [
        {
          id: "v",
          sectionKey: "value_engineering",
          label: "Everything cheaper",
          customerLabel: "Everything cheaper",
          valueEngineering: { savingsPct: 90 },
        },
      ],
      10000,
    );
    // 15% cap → mid 1500, high = 1500 * 1.1
    expect(adjustment?.high).toBe(1650);
  });
});
