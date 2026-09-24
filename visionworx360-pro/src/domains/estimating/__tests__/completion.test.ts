/**
 * Unmatched line pricing & quantity completion (Phase 1).
 * Guards the integrity rules: no invented data, no double-counted labor,
 * and contractor work is never treated as incomplete.
 */
import { describe, expect, it } from "vitest";
import {
  classifyLine, isUnitCompatible, nextIncompleteLineId, previewCandidateLine,
  summarizeCompletion, canCompleteLinePricing, type CompletionLine,
} from "../pricing/completion";

const line = (over: Partial<CompletionLine> = {}): CompletionLine => ({
  id: "a",
  description: "Frame wall",
  quantity: 1,
  unitKey: "square_foot",
  pricingSource: "knowledge_base",
  isPriceOverridden: false,
  isQuantityPlaceholder: false,
  laborHours: 10,
  laborRate: 65,
  materialCost: 2,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  ...over,
});

describe("classifyLine", () => {
  it("treats an unmatched line as needing pricing", () => {
    expect(classifyLine(line({ pricingSource: "unmatched" })).needsPricing).toBe(true);
  });

  it("treats a zero-cost line as needing pricing even when marked priced", () => {
    const zero = line({ laborHours: 0, materialCost: 0 });
    expect(classifyLine(zero).needsPricing).toBe(true);
  });

  it("flags placeholder quantities separately from pricing", () => {
    const state = classifyLine(line({ isQuantityPlaceholder: true }));
    expect(state).toMatchObject({ needsPricing: false, needsQuantityReview: true });
    expect(state.isComplete).toBe(false);
  });

  it("counts contractor-priced lines as complete", () => {
    const own = line({ pricingSource: "contractor", isPriceOverridden: true });
    expect(classifyLine(own).isComplete).toBe(true);
  });
});

describe("summarizeCompletion", () => {
  it("separates pricing, quantity and contractor counts", () => {
    const summary = summarizeCompletion([
      line({ id: "1" }),
      line({ id: "2", pricingSource: "unmatched", laborHours: 0, materialCost: 0 }),
      line({ id: "3", isQuantityPlaceholder: true }),
      line({ id: "4", pricingSource: "contractor", isPriceOverridden: true }),
    ]);
    expect(summary).toMatchObject({
      total: 4, complete: 2, incomplete: 2,
      needsPricing: 1, needsQuantityReview: 1,
      priced: 2, contractorEdited: 1,
    });
  });
});

describe("nextIncompleteLineId", () => {
  const lines = [
    line({ id: "1" }),
    line({ id: "2", pricingSource: "unmatched", laborHours: 0, materialCost: 0 }),
    line({ id: "3", isQuantityPlaceholder: true }),
  ];

  it("starts at the first incomplete line", () => {
    expect(nextIncompleteLineId(lines, null)).toBe("2");
  });

  it("wraps around instead of dead-ending", () => {
    expect(nextIncompleteLineId(lines, "3")).toBe("2");
  });

  it("returns null when everything is complete", () => {
    expect(nextIncompleteLineId([line({ id: "1" })], "1")).toBeNull();
  });
});

describe("isUnitCompatible", () => {
  it("allows a line with no unit to adopt the library unit", () => {
    expect(isUnitCompatible(null, "square_foot")).toBe(true);
  });

  it("blocks mismatched units", () => {
    expect(isUnitCompatible("each", "square_foot")).toBe(false);
  });
});

describe("previewCandidateLine", () => {
  it("never multiplies labor hours by crew size", () => {
    const solo = previewCandidateLine({
      quantity: 100, defaultLaborHours: 0.05, crewSize: 1, laborRate: 60,
      overheadPct: 0, profitPct: 0, contingencyPct: 0, isTaxable: false, taxRatePct: 0,
    });
    const crew = previewCandidateLine({
      quantity: 100, defaultLaborHours: 0.05, crewSize: 4, laborRate: 60,
      overheadPct: 0, profitPct: 0, contingencyPct: 0, isTaxable: false, taxRatePct: 0,
    });
    expect(solo.laborHours).toBe(5);
    expect(crew.laborHours).toBe(solo.laborHours);
    expect(crew.totals.laborTotal).toBe(300);
  });

  it("derives hours from production rate when hours are missing", () => {
    const preview = previewCandidateLine({
      quantity: 10, productionRate: 4, laborRate: 50,
      overheadPct: 0, profitPct: 0, contingencyPct: 0, isTaxable: false, taxRatePct: 0,
    });
    expect(preview.laborHoursPerUnit).toBe(0.25);
    expect(preview.laborHours).toBe(2.5);
  });

  it("applies waste to the material allowance once", () => {
    const preview = previewCandidateLine({
      quantity: 10, materialAllowance: 10, wasteFactor: 0.1, laborRate: 0,
      overheadPct: 0, profitPct: 0, contingencyPct: 0, isTaxable: false, taxRatePct: 0,
    });
    expect(preview.materialCostPerUnit).toBe(11);
    expect(preview.totals.materialTotal).toBe(110);
  });

  it("returns zero cost for a zero quantity instead of guessing", () => {
    const preview = previewCandidateLine({
      quantity: 0, defaultLaborHours: 2, materialAllowance: 20, laborRate: 60,
      overheadPct: 10, profitPct: 10, contingencyPct: 0, isTaxable: false, taxRatePct: 0,
    });
    expect(preview.totals.total).toBe(0);
  });
});

describe("canCompleteLinePricing", () => {
  it("blocks locked, superseded and approved estimates", () => {
    expect(canCompleteLinePricing({ status: "draft", lockedAt: null, supersededById: null })).toBe(true);
    expect(canCompleteLinePricing({ status: "draft", lockedAt: "2026-01-01", supersededById: null })).toBe(false);
    expect(canCompleteLinePricing({ status: "draft", lockedAt: null, supersededById: "x" })).toBe(false);
    expect(canCompleteLinePricing({ status: "approved", lockedAt: null, supersededById: null })).toBe(false);
  });
});
