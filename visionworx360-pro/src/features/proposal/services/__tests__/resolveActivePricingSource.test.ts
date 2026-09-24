import { describe, expect, it } from "vitest";
import { resolveActivePricingSource } from "../resolveActivePricingSource";
import type { EstimateDTO, EstimateLineDTO } from "@/features/estimating/types";

const snapshot = {
  kind: "ballpark",
  band: { low: 34500, expected: 38809, high: 43000 },
  currency: "USD",
};

const estimate = {
  id: "same-estimate-id",
  intakeMode: "ballpark",
  pricingMode: "total",
  pricingMethod: "overhead_profit" as const,
  targetGrossMarginPct: 0,
  laborSettings: {},
  rangeSnapshot: snapshot,
  taxRate: 0,
} as unknown as EstimateDTO;

const pricedLine = {
  id: "same-line-id",
  scopeItemId: "scope-1",
  archivedAt: null,
  quantity: 1,
  laborHours: 10,
  laborRate: 50,
  materialCost: 6500,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  overheadPct: 0,
  profitPct: 0,
  contingencyPct: 0,
  isTaxable: false,
} as EstimateLineDTO;

describe("active proposal pricing source regression", () => {
  it("keeps the original range active in Ballpark mode despite retained $7k detailed work", () => {
    const source = resolveActivePricingSource({ estimate, lines: [pricedLine], includedScopeItemIds: ["scope-1", "scope-2"] });
    expect(source).toMatchObject({ kind: "ballpark", range: { low: 34500, expected: 38809, high: 43000 } });
    expect(estimate.id).toBe("same-estimate-id");
    expect(pricedLine.id).toBe("same-line-id");
  });

  it("marks Detailed incomplete when current scope is missing or unpriced", () => {
    const source = resolveActivePricingSource({
      estimate: { ...estimate, intakeMode: "detailed" },
      lines: [pricedLine],
      includedScopeItemIds: ["scope-1", "scope-2", "scope-3", "scope-4", "scope-5"],
    });
    expect(source?.kind).toBe("detailed_incomplete");
    if (source?.kind === "detailed_incomplete") {
      expect(source.partialTotal).toBe(7000);
      expect(source.ballpark?.expected).toBe(38809);
      expect(source.integrity.unpricedLines).toBe(4);
    }
  });

  it("preserves detailed work across Ballpark and Detailed mode switches", () => {
    const ballpark = resolveActivePricingSource({ estimate, lines: [pricedLine], includedScopeItemIds: ["scope-1", "scope-2"] });
    const detailed = resolveActivePricingSource({
      estimate: { ...estimate, intakeMode: "detailed" },
      lines: [pricedLine],
      includedScopeItemIds: ["scope-1", "scope-2"],
    });
    expect(ballpark?.kind).toBe("ballpark");
    expect(detailed?.kind).toBe("detailed_incomplete");
    expect(pricedLine.id).toBe("same-line-id");
  });
});
