import { describe, expect, it } from "vitest";

import { calculateEngineEstimate } from "@/domains/estimating/engine/calculate";
import type { EngineLineInput, EstimateEngineConfig } from "@/domains/estimating/engine/types";
import {
  GROSS_MARGIN_PRESETS,
  grossMarginPct,
  isValidTargetGrossMargin,
  normalizePricingStrategy,
  pricingStrategyOf,
  sellingPriceFromTargetMargin,
} from "@/domains/estimating/pricingStrategy";

const line = (over: Partial<EngineLineInput> = {}): EngineLineInput => ({
  id: over.id ?? "l1",
  quantity: 1,
  laborHours: 10,
  laborRate: 50,
  materialCost: 500,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  wasteFactorPct: 0,
  crewSize: 1,
  overheadPct: 10,
  profitPct: 10,
  contingencyPct: 0,
  isTaxable: false,
  ...over,
});

const config = (over: Partial<EstimateEngineConfig> = {}): EstimateEngineConfig => ({
  currency: "USD",
  taxRatePct: 0,
  ...over,
});

describe("pricing method — target gross margin math", () => {
  it("prices at jobCost / (1 - margin)", () => {
    expect(sellingPriceFromTargetMargin(10_000, 30)).toBe(14286);
    expect(sellingPriceFromTargetMargin(10_000, 33)).toBe(14925);
    expect(sellingPriceFromTargetMargin(10_000, 40)).toBe(16667);
  });

  it("realizes exactly the target margin on the selling price", () => {
    for (const target of [30, 33, 40]) {
      const price = sellingPriceFromTargetMargin(10_000, target);
      expect(grossMarginPct(price, 10_000)).toBeCloseTo(target, 1);
    }
  });

  it("rejects impossible targets", () => {
    expect(isValidTargetGrossMargin(100)).toBe(false);
    expect(isValidTargetGrossMargin(-1)).toBe(false);
    expect(isValidTargetGrossMargin(99.99)).toBe(true);
    /* A 0% target sells at cost rather than dividing by zero. */
    expect(sellingPriceFromTargetMargin(1_000, 0)).toBe(1_000);
  });
});

describe("pricing method — mutual exclusivity in the engine", () => {
  it("target margin mode charges no overhead or profit percentages", () => {
    const result = calculateEngineEstimate(
      [line()],
      config({
        pricingStrategy: {
          method: "target_gross_margin",
          targetGrossMarginPct: 40,
          overheadPct: 10,
          profitPct: 10,
        },
      }),
    );

    expect(result.totals.overhead).toBe(0);
    expect(result.totals.profit).toBe(0);
    expect(result.totals.jobCost).toBe(1_000);
    expect(result.totals.subtotal).toBe(1667);
    expect(result.totals.grossMarginPct).toBeCloseTo(40, 1);
    /* Line totals reconcile to the roll-up. */
    const lineSum = result.lines.reduce((sum, l) => sum + l.subtotal, 0);
    expect(Math.round(lineSum * 100) / 100).toBeCloseTo(result.totals.subtotal, 1);
  });

  it("overhead + profit mode is unchanged (legacy estimates never silently reprice)", () => {
    const legacy = calculateEngineEstimate([line()], config());
    const explicit = calculateEngineEstimate(
      [line()],
      config({
        pricingStrategy: {
          method: "overhead_profit",
          targetGrossMarginPct: 40,
          overheadPct: 10,
          profitPct: 10,
        },
      }),
    );

    expect(explicit.totals.subtotal).toBe(legacy.totals.subtotal);
    expect(explicit.totals.overhead).toBe(100);
    expect(explicit.totals.profit).toBe(110);
    expect(explicit.totals.grandTotal).toBe(1210);
  });

  it("contingency is counted once, as cost, before the margin is applied", () => {
    const withContingency = calculateEngineEstimate(
      [line({ contingencyPct: 10 })],
      config({
        pricingStrategy: {
          method: "target_gross_margin",
          targetGrossMarginPct: 50,
          overheadPct: 0,
          profitPct: 0,
        },
      }),
    );

    expect(withContingency.totals.contingency).toBe(100);
    expect(withContingency.totals.jobCost).toBe(1_100);
    expect(withContingency.totals.subtotal).toBe(2_200);
    expect(withContingency.totals.grossProfit).toBe(1_100);
  });

  it("tax applies after the pricing method, on the selling price", () => {
    const taxed = calculateEngineEstimate(
      [line({ isTaxable: true })],
      config({
        taxRatePct: 10,
        pricingStrategy: {
          method: "target_gross_margin",
          targetGrossMarginPct: 50,
          overheadPct: 0,
          profitPct: 0,
        },
      }),
    );
    expect(taxed.totals.subtotal).toBe(2_000);
    expect(taxed.totals.tax).toBe(200);
    expect(taxed.totals.grandTotal).toBe(2_200);
  });
});

describe("pricing method — defaults, isolation and benchmarks", () => {
  it("defaults unknown/legacy records to overhead + profit", () => {
    expect(normalizePricingStrategy({}).method).toBe("overhead_profit");
    expect(pricingStrategyOf({ pricingMethod: "nonsense" }).method).toBe("overhead_profit");
    expect(
      pricingStrategyOf({ pricingMethod: "target_gross_margin", targetGrossMarginPct: 33 }),
    ).toMatchObject({ method: "target_gross_margin", targetGrossMarginPct: 33 });
  });

  it("one estimate's method never leaks into another", () => {
    const a = calculateEngineEstimate(
      [line({ id: "a" })],
      config({
        pricingStrategy: {
          method: "target_gross_margin",
          targetGrossMarginPct: 40,
          overheadPct: 0,
          profitPct: 0,
        },
      }),
    );
    const b = calculateEngineEstimate([line({ id: "b" })], config());

    expect(a.totals.overhead).toBe(0);
    expect(b.totals.overhead).toBe(100);
    expect(b.totals.subtotal).toBe(1_210);
  });

  it("ships the documented benchmark presets with attribution", () => {
    const pcts = GROSS_MARGIN_PRESETS.filter((p) => p.pct != null).map((p) => p.pct);
    expect(pcts).toEqual([30, 33, 40]);
    for (const preset of GROSS_MARGIN_PRESETS) {
      if (preset.pct == null) continue;
      expect(preset.sourceName).toBeTruthy();
      expect(preset.sourceUrl).toMatch(/^https:\/\//);
    }
  });
});
