/**
 * GLOBAL WHOLE-DOLLAR MONEY POLICY — regression coverage.
 *
 * Money never carries cents anywhere in the estimator. Hours, quantities and
 * percentages are untouched.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calculateEngineEstimate,
  calculateEstimate,
  calculateLine,
  type EngineLineInput,
} from "@/domains/estimating";
import { isWholeDollars, roundMoney } from "@/domains/estimating/money";
import { decomposeSellingPrice } from "@/domains/estimating/costModel";
import { buildContractorBreakdown } from "@/domains/estimating/contractorBreakdown";
import { buildEstimateRange } from "@/domains/estimating/range/calculate";

const line = (over: Partial<EngineLineInput> = {}): EngineLineInput => ({
  id: "l1",
  quantity: 17.4,
  laborHours: null,
  laborHoursPerUnit: 0.37,
  laborRate: 63.24,
  materialCost: 12.37,
  equipmentCost: 1.11,
  subcontractorCost: 0,
  otherCost: 0.83,
  overheadPct: 10,
  profitPct: 10,
  contingencyPct: 5,
  isTaxable: true,
  ...over,
});

const MONEY_FIELDS = [
  "laborTotal",
  "materialTotal",
  "productTotal",
  "equipmentTotal",
  "subcontractorTotal",
  "otherTotal",
  "allowanceTotal",
  "directCost",
  "overhead",
  "profit",
  "contingency",
  "jobCost",
  "grossProfit",
  "subtotal",
  "taxable",
  "tax",
  "grandTotal",
  "total",
] as const;

describe("roundMoney", () => {
  it("rounds half up and never yields cents", () => {
    expect(roundMoney(12345.67)).toBe(12346);
    expect(roundMoney(0.5)).toBe(1);
    expect(roundMoney(0.49)).toBe(0);
    expect(roundMoney(-0.5)).toBe(-1);
    expect(roundMoney(null)).toBe(0);
    expect(roundMoney("nope")).toBe(0);
  });
});

describe("canonical line + estimate math", () => {
  it("produces only whole dollars", () => {
    const totals = calculateLine(
      {
        quantity: 17.4,
        laborHours: 6.44,
        laborRate: 63.24,
        materialCost: 12.37,
        equipmentCost: 1.11,
        subcontractorCost: 0,
        otherCost: 0.83,
        overheadPct: 10,
        profitPct: 10,
        contingencyPct: 5,
        isTaxable: true,
      },
      8.25,
    );
    for (const [key, value] of Object.entries(totals)) {
      expect(isWholeDollars(value), `${key}=${value}`).toBe(true);
    }
  });

  it("reconciles subtotal and grand total at whole-dollar precision", () => {
    const inputs = Array.from({ length: 9 }, (_, i) => ({
      quantity: 3.3 + i,
      laborHours: 1.17 * (i + 1),
      laborRate: 63.24,
      materialCost: 12.37,
      equipmentCost: 0.55,
      subcontractorCost: 0,
      otherCost: 0.83,
      overheadPct: 10,
      profitPct: 10,
      contingencyPct: 5,
      isTaxable: true,
    }));
    const t = calculateEstimate(inputs, 8.25);
    for (const key of MONEY_FIELDS) {
      const value = (t as unknown as Record<string, number>)[key];
      if (value == null) continue;
      expect(isWholeDollars(value), `${key}=${value}`).toBe(true);
    }
    expect(t.subtotal).toBe(t.directCost + t.overhead + t.profit + t.contingency);
    expect(t.grandTotal).toBe(t.subtotal + t.tax);
  });
});

describe("engine roll-up", () => {
  const result = calculateEngineEstimate(
    [line(), line({ id: "l2", quantity: 288.5, materialCost: 5.73 })],
    {
      currency: "USD",
      taxRatePct: 8.25,
      defaultOverheadPct: 10,
      defaultProfitPct: 10,
      allowances: { travel: 125.4, disposal: 87.65, permit: 689.33, markupApplies: true },
    },
  );

  it("emits whole dollars for every monetary total and line field", () => {
    for (const key of MONEY_FIELDS) {
      const value = (result.totals as unknown as Record<string, number>)[key];
      if (value == null) continue;
      expect(isWholeDollars(value), `totals.${key}=${value}`).toBe(true);
    }
    for (const l of result.lines) {
      for (const key of MONEY_FIELDS) {
        const value = (l as unknown as Record<string, number>)[key];
        if (value == null) continue;
        expect(isWholeDollars(value), `${l.id}.${key}=${value}`).toBe(true);
      }
    }
  });

  it("leaves hours, quantities and percentages alone", () => {
    expect(result.lines[0]!.quantity).toBe(17.4);
    /* Hours stay fractional, but only on the quarter-hour grid. */
    expect(result.lines[0]!.laborHours).toBe(6.5);
    expect((result.totals.laborHours * 4) % 1).toBe(0);
  });
});

describe("preliminary band and selected selling price", () => {
  const engineLines = [line(), line({ id: "l2", quantity: 91.25, materialCost: 7.19 })];
  const config = { currency: "USD", taxRatePct: 8.25 } as const;

  it("bands carry no cents and Recommended equals the detailed grand total", () => {
    const detailed = calculateEngineEstimate(engineLines, config);
    const range = buildEstimateRange(engineLines, config, { tier: "better" });
    for (const tier of range.tiers) {
      expect(isWholeDollars(tier.mid)).toBe(true);
      expect(isWholeDollars(tier.low)).toBe(true);
      expect(isWholeDollars(tier.high)).toBe(true);
      for (const value of Object.values(tier.breakdown)) {
        expect(isWholeDollars(value)).toBe(true);
      }
    }
    /* "better" is the baseline tier: no finish uplift, so it IS the detailed price. */
    const better = range.tiers.find((t) => t.tier === "better")!;
    expect(better.mid).toBe(detailed.totals.grandTotal);
  });

  it("decomposing a selected selling price stays whole-dollar", () => {
    const totals = decomposeSellingPrice(53541.13, {
      strategy: {
        method: "overhead_profit",
        overheadPct: 10,
        profitPct: 10,
        targetGrossMarginPct: 0,
      },
      contingencyPct: 5,
      taxRatePct: 8.25,
    });
    for (const [key, value] of Object.entries(totals)) {
      if (typeof value !== "number" || key.endsWith("Pct")) continue;
      expect(isWholeDollars(value), `${key}=${value}`).toBe(true);
    }
  });
});

describe("contractor breakdown", () => {
  const breakdown = buildContractorBreakdown(
    [
      {
        id: "t1",
        label: "Frame partition",
        tradeKey: "framing",
        laborHours: 7.03,
        laborCost: 444.57,
        materialCost: 289.44,
        otherCost: 0,
      },
      {
        id: "t2",
        label: "Building permit",
        tradeKey: "unassigned",
        laborHours: 0,
        laborCost: 0,
        materialCost: 0,
        otherCost: 689.33,
      },
    ],
    { overhead: 142.33, profit: 156.57, tax: 61.12 },
  );

  it("keeps money whole and hours fractional", () => {
    expect(isWholeDollars(breakdown.laborCost)).toBe(true);
    expect(isWholeDollars(breakdown.materialCost)).toBe(true);
    expect(isWholeDollars(breakdown.otherCost)).toBe(true);
    expect(isWholeDollars(breakdown.markup)).toBe(true);
    expect(isWholeDollars(breakdown.total)).toBe(true);
    expect(breakdown.laborHours).toBeCloseTo(7.03, 2);
    for (const trade of breakdown.trades) {
      expect(isWholeDollars(trade.total)).toBe(true);
    }
  });

  it("permits/fees round to whole dollars with zero labor", () => {
    const fee = breakdown.tasks.find((t) => t.id === "t2")!;
    expect(fee.otherCost).toBe(689);
    expect(fee.laborHours).toBe(0);
  });
});

describe("money display surfaces", () => {
  const files = [
    "src/i18n/format.ts",
    "src/components/shared/FormattedValue.tsx",
    "src/domains/proposal/build.ts",
    "src/features/proposal/components/ProposalPricingNotices.tsx",
    "src/features/crm/utils/format.ts",
    "src/domains/estimating/range/narrative.ts",
  ];

  it("never formats currency with fraction digits", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const currencyBlocks = src.split('style: "currency"').slice(1);
      expect(currencyBlocks.length, file).toBeGreaterThan(0);
      for (const block of currencyBlocks) {
        const head = block.slice(0, 300);
        expect(head, file).toContain("maximumFractionDigits: 0");
        expect(head, file).not.toContain("maximumFractionDigits: 2");
      }
    }
  });
});
