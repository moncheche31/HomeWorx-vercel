import { describe, expect, it } from "vitest";
import {
  buildPricingPayload,
  canApplyKnowledgePricing,
  resolveCrewHoursPerUnit,
  resolveLaborHoursForLine,
  resolveMaterialCostPerUnit,
  summarizePricing,
  type PricingStatusLine,
} from "../pricing/knowledgeBridge";
import { seededPricingProvider } from "../pricing/seededProvider";

const line = (over: Partial<PricingStatusLine>): PricingStatusLine => ({
  pricingSource: null,
  isPriceOverridden: false,
  laborHours: 0,
  laborRate: 0,
  materialCost: 0,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  pricingProvenance: {},
  ...over,
});

describe("knowledge base pricing bridge", () => {
  it("derives crew hours per unit from production rate when hours are absent", () => {
    expect(resolveCrewHoursPerUnit({ productionRate: 4 })).toBe(0.25);
    expect(resolveCrewHoursPerUnit({ defaultLaborHours: 1.5, productionRate: 4 })).toBe(1.5);
    expect(resolveCrewHoursPerUnit({})).toBe(0);
  });

  it("never multiplies labor hours by crew size (crew size is descriptive)", () => {
    // 10 units at 0.5 h/unit = 5 billable hours, regardless of crew size.
    expect(resolveLaborHoursForLine({ quantity: 10, productionRate: 2, crewSize: 2 })).toBe(5);
    expect(resolveLaborHoursForLine({ quantity: 10, productionRate: 2, crewSize: 4 })).toBe(5);
    expect(resolveLaborHoursForLine({ quantity: 10, crewSize: 3 })).toBe(0);
  });

  it("applies waste and the regional material factor per unit", () => {
    expect(
      resolveMaterialCostPerUnit({ materialAllowance: 100, wasteFactor: 0.05, materialFactor: 1.1 }),
    ).toBe(115.5);
    expect(resolveMaterialCostPerUnit({})).toBe(0);
  });

  it("builds a payload that preserves sample-data provenance", async () => {
    const base = await seededPricingProvider.resolve({
      organizationId: "org",
      location: { state: "CA" },
    });
    const payload = buildPricingPayload(base!, { electrical: 110, bogus: null });
    expect(payload.provenance.isSampleData).toBe(true);
    expect(payload.laborRates).toEqual({ electrical: 110 });
    expect(payload.defaultLaborRate).toBeGreaterThan(0);
  });

  it("separates library-priced, contractor-edited and unmatched lines", () => {
    const status = summarizePricing([
      line({ pricingSource: "knowledge_base", laborHours: 2, laborRate: 60,
        pricingProvenance: { isSampleData: true } }),
      line({ pricingSource: "knowledge_base", isPriceOverridden: true, materialCost: 20 }),
      line({ pricingSource: "unmatched" }),
    ]);
    expect(status).toMatchObject({
      total: 3, priced: 1, contractorEdited: 1, unmatched: 1, zeroCost: 1, usesSampleData: true,
    });
  });

  it("refuses to reprice issued, locked or superseded estimates", () => {
    expect(canApplyKnowledgePricing({ status: "draft", lockedAt: null, supersededById: null })).toBe(true);
    expect(canApplyKnowledgePricing({ status: "sent", lockedAt: null, supersededById: null })).toBe(false);
    expect(canApplyKnowledgePricing({ status: "draft", lockedAt: "2026-01-01", supersededById: null })).toBe(false);
    expect(canApplyKnowledgePricing({ status: "draft", lockedAt: null, supersededById: "x" })).toBe(false);
  });
});
