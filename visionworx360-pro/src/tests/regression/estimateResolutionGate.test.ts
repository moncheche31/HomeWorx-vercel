/**
 * Universal Estimating Engine — resolution gate.
 *
 * These assertions mirror, one for one, the invariants the database trigger
 * `enforce_estimate_line_cost_basis` enforces on every write. If the two ever
 * disagree the UI would show a number the engine does not stand behind, so
 * this file exists to keep them locked together.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateResolution,
  isMeasuredUnit,
  summarizeResolution,
  type ResolutionCheckLine,
  type ResolutionSummaryLine,
} from "@/domains/estimating/resolution";

const line = (over: Partial<ResolutionCheckLine> = {}): ResolutionCheckLine => ({
  costBasis: "labor_production",
  unitKey: "square_foot",
  quantity: 250,
  isQuantityPlaceholder: false,
  laborHours: 12,
  laborHoursPerUnit: 0.048,
  pricingSource: "knowledge_base",
  isPriceOverridden: false,
  ...over,
});

describe("measured quantity must be evidence, never a placeholder 1", () => {
  it.each(["square_foot", "linear_foot", "cubic_yard", "board_foot", "gallon", "sheet"])(
    "%s with a placeholder quantity of 1 is unresolved, not a real total",
    (unitKey) => {
      // A production rate exists, so the only missing input is the measurement.
      const withRate = evaluateResolution(line({ unitKey, quantity: 1, isQuantityPlaceholder: true }));
      expect(withRate).toEqual({ status: "unresolved", reason: "quantity_required" });

      // With no rate either, the line has no basis at all.
      const noRate = evaluateResolution(
        line({ unitKey, quantity: 1, isQuantityPlaceholder: true, laborHoursPerUnit: 0 }),
      );
      expect(noRate).toEqual({ status: "unresolved", reason: "quantity_unmeasured" });
    },
  );


  it("accepts a quantity of 1 when the contractor confirmed it (no placeholder flag)", () => {
    expect(evaluateResolution(line({ quantity: 1, isQuantityPlaceholder: false }).valueOf() as ResolutionCheckLine))
      .toEqual({ status: "resolved", reason: null });
  });

  it("accepts a real derived measurement", () => {
    expect(evaluateResolution(line({ quantity: 279, isQuantityPlaceholder: true }))).toEqual({
      status: "resolved",
      reason: null,
    });
  });

  it("does not treat counted units as needing measurement", () => {
    expect(isMeasuredUnit("each")).toBe(false);
    expect(isMeasuredUnit("lump_sum")).toBe(false);
    expect(isMeasuredUnit("allowance")).toBe(false);
    expect(isMeasuredUnit("square_foot")).toBe(true);
  });
});

describe("fees are never labor", () => {
  it("a permit with no hours is resolved — a fee is complete without labor", () => {
    const r = evaluateResolution(
      line({
        costBasis: "permit_fee",
        unitKey: "each",
        quantity: 1,
        laborHours: 0,
        laborHoursPerUnit: 0,
      }),
    );
    expect(r).toEqual({ status: "resolved", reason: null });
  });

  it("the same is true for other direct costs such as dumpsters", () => {
    const r = evaluateResolution(
      line({ costBasis: "other_direct_cost", unitKey: "each", laborHours: 0, laborHoursPerUnit: 0 }),
    );
    expect(r.status).toBe("resolved");
  });
});

describe("unknown labor must not silently become zero", () => {
  it("a labor task with no hours and no rate is unresolved", () => {
    expect(
      evaluateResolution(line({ unitKey: "each", laborHours: 0, laborHoursPerUnit: 0 })),
    ).toEqual({ status: "unresolved", reason: "no_productivity_rate" });
  });

  it("a labor task with a per-unit rate but no total is still defensible", () => {
    expect(
      evaluateResolution(line({ unitKey: "each", laborHours: 0, laborHoursPerUnit: 1.4 })).status,
    ).toBe("resolved");
  });

  it("an LVL install carrying real hours is resolved", () => {
    expect(
      evaluateResolution(
        line({ unitKey: "each", quantity: 1, laborHours: 6.5, laborHoursPerUnit: 6.5 }),
      ).status,
    ).toBe("resolved");
  });
});

describe("unmatched lines are visible, not silently free", () => {
  it.each([null, "unmatched"])("pricingSource %s is unresolved", (pricingSource) => {
    expect(evaluateResolution(line({ pricingSource })).reason).toBe("no_catalog_match");
  });
});

describe("contractor authority survives everything", () => {
  it("an overridden line is always resolved, even with no quantity evidence", () => {
    const r = evaluateResolution(
      line({
        isPriceOverridden: true,
        quantity: 1,
        isQuantityPlaceholder: true,
        laborHours: 0,
        laborHoursPerUnit: 0,
        pricingSource: "unmatched",
      }),
    );
    expect(r).toEqual({ status: "resolved", reason: null });
  });

  it.each(["contractor", "manual"])("a %s-sourced line is always resolved", (pricingSource) => {
    expect(evaluateResolution(line({ pricingSource, laborHours: 0, laborHoursPerUnit: 0 })).status)
      .toBe("resolved");
  });
});

describe("summary blocks a falsely ready total", () => {
  const summaryLine = (over: Partial<ResolutionSummaryLine>): ResolutionSummaryLine => ({
    ...line(),
    id: "l1",
    description: "Line",
    resolutionStatus: "resolved",
    unresolvedReason: null,
    ...over,
  });

  it("counts and groups the reasons", () => {
    const s = summarizeResolution([
      summaryLine({ id: "a" }),
      summaryLine({
        id: "b",
        description: "Remove existing garage partition wall",
        resolutionStatus: "unresolved",
        unresolvedReason: "quantity_unmeasured",
      }),
      summaryLine({
        id: "c",
        description: "LVL beam and posts",
        resolutionStatus: "unresolved",
        unresolvedReason: "no_catalog_match",
      }),
    ]);
    expect(s).toMatchObject({
      total: 3,
      resolved: 1,
      unresolved: 2,
      blocksReconciliation: true,
      byReason: { quantity_unmeasured: 1, no_catalog_match: 1 },
    });
    expect(s.lines.map((l) => l.description)).toEqual([
      "Remove existing garage partition wall",
      "LVL beam and posts",
    ]);
  });

  it("does not block when everything is resolved", () => {
    const s = summarizeResolution([summaryLine({ id: "a" }), summaryLine({ id: "b" })]);
    expect(s.blocksReconciliation).toBe(false);
    expect(s.unresolved).toBe(0);
  });
});
