/**
 * INVARIANT: for the same confirmed scope, quantities, quality level and
 * pricing settings, the preliminary recommended value and the final selling
 * price resolve to the SAME cost model.
 *
 * The defect this locks out: small-job economics (mobilization, setup/cleanup,
 * service-call minimum) used to be a lift applied to the ballpark BAND only.
 * The detailed estimate — priced from the same engine but from stored lines —
 * never saw them, so every job under the threshold showed a preliminary value
 * the final selling price could not reproduce, with nothing in the scope to
 * explain it.
 */

import { describe, expect, it } from "vitest";
import {
  calculateEngineEstimate,
  decomposeSellingPrice,
  reconcilePreliminaryToFinal,
  withJobEconomics,
  sellingPriceFromTargetMargin,
  SMALL_JOB_THRESHOLD,
  type EngineLineInput,
  type PricingStrategy,
} from "@/domains/estimating";
import { recalculateBallparkFromScope, type RecalcScopeItem } from "@/domains/ballpark/scopeRecalc";

const OH_PROFIT: PricingStrategy = {
  method: "overhead_profit",
  targetGrossMarginPct: 0,
  overheadPct: 10,
  profitPct: 10,
};
const TARGET_MARGIN: PricingStrategy = {
  method: "target_gross_margin",
  targetGrossMarginPct: 30,
  overheadPct: 0,
  profitPct: 0,
};

const item = (over: Partial<RecalcScopeItem> & { id: string; title: string }): RecalcScopeItem => ({
  quantity: 1,
  unitKey: "each",
  isIncluded: true,
  ...over,
});

/** Five real job archetypes, from a one-hour service call to a whole roof. */
const JOBS: Record<string, RecalcScopeItem[]> = {
  kitchenCabinets: [
    item({ id: "base", title: "Install base cabinets", quantity: 12, unitKey: "linear_foot", tradeKey: "cabinetry" }),
    item({ id: "upper", title: "Install upper cabinets", quantity: 12, unitKey: "linear_foot", tradeKey: "cabinetry" }),
    item({ id: "top", title: "Install quartz countertop", quantity: 32, unitKey: "square_foot", tradeKey: "countertops" }),
  ],
  garageConversion: [
    item({ id: "floor", title: "Install hardwood flooring", quantity: 306.9, unitKey: "square_foot", tradeKey: "flooring" }),
    item({ id: "drywall", title: "Install drywall", quantity: 940, unitKey: "square_foot", tradeKey: "drywall" }),
    item({ id: "paint", title: "Paint walls and ceiling", quantity: 940, unitKey: "square_foot", tradeKey: "painting" }),
  ],
  bath: [
    item({ id: "tile", title: "Install tile flooring", quantity: 45, unitKey: "square_foot", tradeKey: "tile" }),
    item({ id: "vanity", title: "Install vanity", quantity: 1, tradeKey: "plumbing" }),
    item({ id: "toilet", title: "Install toilet", quantity: 1, tradeKey: "plumbing" }),
  ],
  handymanSmallRepair: [
    item({ id: "device", title: "Relocate one receptacle", quantity: 1, tradeKey: "electrical" }),
  ],
  roofing: [
    item({ id: "shingles", title: "Install asphalt shingle roofing", quantity: 2400, unitKey: "square_foot", tradeKey: "roofing" }),
  ],
};

function preliminary(items: RecalcScopeItem[], strategy: PricingStrategy) {
  return recalculateBallparkFromScope(items, {
    currency: "USD",
    taxRatePct: 0,
    pricingStrategy: strategy,
    overheadPct: strategy.overheadPct,
    profitPct: strategy.profitPct,
  })!;
}

/**
 * The detailed estimate: the SAME priced lines, run through the canonical
 * engine exactly as the estimate page prices stored line items.
 */
function finalSellingPrice(lines: EngineLineInput[], strategy: PricingStrategy): number {
  const engine = calculateEngineEstimate(lines, {
    currency: "USD",
    taxRatePct: 0,
    pricingStrategy: strategy.method === "target_gross_margin" ? undefined : strategy,
  });
  return strategy.method === "target_gross_margin"
    ? Math.round(
        sellingPriceFromTargetMargin(engine.totals.grandTotal, strategy.targetGrossMarginPct) * 100,
      ) / 100
    : engine.totals.grandTotal;
}

describe("preliminary recommended value reconciles with the final selling price", () => {
  for (const [name, items] of Object.entries(JOBS)) {
    for (const strategy of [OH_PROFIT, TARGET_MARGIN]) {
      it(`${name} — ${strategy.method}`, () => {
        const prelim = preliminary(items, strategy);
        const final = finalSellingPrice(prelim.pricedLines, strategy);
        const reconciliation = reconcilePreliminaryToFinal({
          preliminary: prelim.band.expected,
          final,
        });
        expect(reconciliation.reconciles).toBe(true);
        expect(reconciliation.isUnexplained).toBe(false);
      });
    }
  }

  it("carries small-job economics into the priced lines, not only into the band", () => {
    const prelim = preliminary(JOBS.handymanSmallRepair, OH_PROFIT);
    expect(prelim.band.expected).toBeLessThan(SMALL_JOB_THRESHOLD);
    expect(prelim.isSmallJob).toBe(true);
    /* Mobilization + setup/cleanup are real lines the detailed estimate prices. */
    expect(prelim.pricedLines.length).toBeGreaterThan(JOBS.handymanSmallRepair.length);
    const bare = calculateEngineEstimate(
      prelim.pricedLines.filter((l) => !l.id.startsWith("__job_economics")),
      { currency: "USD", taxRatePct: 0, pricingStrategy: OH_PROFIT },
    );
    expect(finalSellingPrice(prelim.pricedLines, OH_PROFIT)).toBeGreaterThan(
      bare.totals.grandTotal,
    );
  });

  it("leaves a large job byte-identical — no economics adders", () => {
    const prelim = preliminary(JOBS.roofing, OH_PROFIT);
    expect(prelim.isSmallJob).toBe(false);
    expect(prelim.pricedLines.some((l) => l.id.startsWith("__job_economics"))).toBe(false);
  });
});

describe("a real change produces an EXPLAINED delta, never silent drift", () => {
  it("reports added scope rather than absorbing it", () => {
    const before = preliminary(JOBS.bath, OH_PROFIT);
    const after = preliminary(
      [...JOBS.bath, item({ id: "fan", title: "Install exhaust fan", quantity: 1, tradeKey: "electrical" })],
      OH_PROFIT,
    );
    const reconciliation = reconcilePreliminaryToFinal({
      preliminary: before.band.expected,
      final: finalSellingPrice(after.pricedLines, OH_PROFIT),
      preliminaryInputs: {
        strategy: OH_PROFIT,
        laborRate: 85,
        taxRatePct: 0,
        subjectIds: JOBS.bath.map((i) => i.id),
      },
      finalInputs: {
        strategy: OH_PROFIT,
        laborRate: 85,
        taxRatePct: 0,
        subjectIds: [...JOBS.bath.map((i) => i.id), "fan"],
      },
    });
    expect(reconciliation.reconciles).toBe(false);
    expect(reconciliation.isUnexplained).toBe(false);
    expect(reconciliation.reasons).toContainEqual({ code: "scope_added", count: 1 });
  });

  it("reports a pricing-method change", () => {
    const r = reconcilePreliminaryToFinal({
      preliminary: 10000,
      final: 12000,
      preliminaryInputs: { strategy: OH_PROFIT, laborRate: 85, taxRatePct: 0 },
      finalInputs: { strategy: TARGET_MARGIN, laborRate: 85, taxRatePct: 0 },
    });
    expect(r.reasons[0]).toMatchObject({ code: "pricing_method_changed" });
    expect(r.isUnexplained).toBe(false);
  });

  it("flags an unexplained difference as a defect", () => {
    const r = reconcilePreliminaryToFinal({ preliminary: 10000, final: 7000 });
    expect(r.isUnexplained).toBe(true);
    expect(r.deltaPct).toBe(-30);
  });
});

describe("a ballpark estimate never presents a $0 selling price", () => {
  it("decomposes a saved band back into the same cost model", () => {
    for (const strategy of [OH_PROFIT, TARGET_MARGIN]) {
      const totals = decomposeSellingPrice(4325.76, {
        strategy,
        contingencyPct: 0,
        taxRatePct: 0,
      });
      expect(totals.grandTotal).toBe(4326);
      expect(totals.jobCost).toBeGreaterThan(0);
      expect(totals.jobCost).toBeLessThan(totals.grandTotal);
      /* Re-pricing the decomposed cost reproduces the selling price. */
      const rebuilt = calculateEngineEstimate(
        [
          {
            id: "x",
            quantity: 1,
            laborRate: 0,
            materialCost: 0,
            equipmentCost: 0,
            subcontractorCost: 0,
            otherCost: totals.directCost,
            overheadPct: strategy.overheadPct,
            profitPct: strategy.profitPct,
            contingencyPct: 0,
            isTaxable: false,
          },
        ],
        { currency: "USD", taxRatePct: 0, pricingStrategy: strategy },
      );
      expect(Math.abs(rebuilt.totals.grandTotal - totals.grandTotal)).toBeLessThan(0.05);
    }
  });
});

describe("job economics are idempotent", () => {
  it("re-applying does not stack adders", () => {
    const line: EngineLineInput = {
      id: "a",
      quantity: 1,
      laborHours: 2,
      laborRate: 85,
      materialCost: 40,
      equipmentCost: 0,
      subcontractorCost: 0,
      otherCost: 0,
      overheadPct: 10,
      profitPct: 10,
      contingencyPct: 0,
      isTaxable: false,
    };
    const config = { currency: "USD", taxRatePct: 0, pricingStrategy: OH_PROFIT };
    const once = withJobEconomics([line], config, { laborRate: 85 });
    const twice = withJobEconomics(once.lines, config, { laborRate: 85 });
    expect(twice.engine.totals.grandTotal).toBe(once.engine.totals.grandTotal);
    expect(twice.lines.length).toBe(once.lines.length);
  });
});
