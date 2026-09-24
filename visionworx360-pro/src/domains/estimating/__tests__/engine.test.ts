import { describe, expect, it } from "vitest";
import {
  calculateEngineEstimate,
  calculateEngineLine,
  resolveOverrides,
  seededPricingProvider,
  type EngineLineInput,
  type EstimateEngineConfig,
} from "../index";

const config: EstimateEngineConfig = { currency: "USD", taxRatePct: 8 };

const baseLine = (over: Partial<EngineLineInput> = {}): EngineLineInput => ({
  id: "l1",
  quantity: 100,
  laborRate: 60,
  materialCost: 2,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  overheadPct: 10,
  profitPct: 10,
  contingencyPct: 0,
  isTaxable: true,
  ...over,
});

describe("estimating engine", () => {
  it("derives labor hours from production rate", () => {
    const r = calculateEngineLine(baseLine({ productionRate: 25 }), config);
    expect(r.laborHours).toBe(4);
    expect(r.laborTotal).toBe(240);
  });

  it("derives labor hours per unit and crew hours from crew size", () => {
    const r = calculateEngineLine(baseLine({ laborHoursPerUnit: 0.08, crewSize: 2 }), config);
    expect(r.laborHours).toBe(8);
    expect(r.crewHours).toBe(4);
  });

  it("applies waste factor to material quantity only", () => {
    const r = calculateEngineLine(baseLine({ wasteFactorPct: 10, laborHours: 0 }), config);
    expect(r.materialQuantity).toBe(110);
    expect(r.materialTotal).toBe(220);
    expect(r.quantity).toBe(100);
  });

  it("prices an attached product with a frozen snapshot price", () => {
    const r = calculateEngineLine(
      baseLine({
        quantity: 2,
        materialCost: 0,
        laborHours: 0,
        product: { productId: "p1", unitPrice: 499.5 },
      }),
      config,
    );
    expect(r.productTotal).toBe(999);
  });

  it("compounds overhead, profit, contingency and tax", () => {
    const r = calculateEngineLine(
      baseLine({ quantity: 1, materialCost: 100, laborHours: 0, contingencyPct: 5 }),
      config,
    );
    expect(r.directCost).toBe(100);
    expect(r.overhead).toBe(10);
    expect(r.profit).toBe(11);
    expect(r.contingency).toBe(6);
    expect(r.subtotal).toBe(127);
    expect(r.total).toBe(137);

  });

  it("rolls up allowances that carry markup", () => {
    const res = calculateEngineEstimate([baseLine({ laborHours: 0, materialCost: 1 })], {
      ...config,
      taxRatePct: 0,
      defaultOverheadPct: 10,
      defaultProfitPct: 10,
      allowances: { travel: 100, disposal: 50, permit: 50, markupApplies: true },
    });
    expect(res.totals.allowanceTotal).toBe(200);
    expect(res.totals.directCost).toBe(300);
    expect(res.totals.grandTotal).toBe(363);
  });

  it("handles 5000 lines quickly", () => {
    const lines = Array.from({ length: 5000 }, (_, i) => baseLine({ id: `l${i}` }));
    const start = performance.now();
    const res = calculateEngineEstimate(lines, config);
    expect(res.totals.lineCount).toBe(5000);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("warns on zero quantity and missing labor rate", () => {
    const res = calculateEngineEstimate(
      [baseLine({ quantity: 0, laborHours: 2, laborRate: 0 })],
      config,
    );
    expect(res.warnings.map((w) => w.code).sort()).toEqual([
      "missing-labor-rate",
      "zero-quantity",
    ]);
  });
});

describe("copy-on-write overrides", () => {
  it("never mutates the base record and tracks provenance", () => {
    const base = { laborRate: 60, wasteFactorPct: 10, profitPct: 10 };
    const resolved = resolveOverrides(base, { laborRate: 85 });
    expect(base.laborRate).toBe(60);
    expect(resolved.values.laborRate).toBe(85);
    expect(resolved.overriddenFields).toEqual(["laborRate"]);
    expect(resolved.provenance.laborRate.source).toBe("user-override");
    expect(resolved.provenance.laborRate.suggestedValue).toBe(60);
    expect(resolved.provenance.profitPct.source).toBe("knowledge-base");
  });
});

describe("seeded pricing provider", () => {
  it("resolves by state and flags sample data", async () => {
    const r = await seededPricingProvider.resolve({
      organizationId: "org",
      location: { state: "ca" },
      tradeKey: "electrical",
    });
    expect(r?.provenance.scope).toBe("state");
    expect(r?.provenance.isSampleData).toBe(true);
    expect(r?.laborRate).toBeGreaterThan(92);
  });

  it("falls back to national when location is unknown", async () => {
    const r = await seededPricingProvider.resolve({ organizationId: "org", location: {} });
    expect(r?.provenance.scope).toBe("national");
    expect(r?.regionalFactor).toBe(1);
  });
});
