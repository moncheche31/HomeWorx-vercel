/**
 * GLOBAL LABOR-TIME INVARIANT — regression guard.
 *
 * Every labor-hour value the estimator produces must land on a 15-minute
 * increment (.00, .25, .50, .75). No path may reintroduce .1/.2/.3/.4/.6/.7/.8/.9.
 */
import { describe, expect, it } from "vitest";
import {
  QUARTER_HOUR,
  isQuarterHour,
  roundQuarterHour,
  sumQuarterHours,
} from "@/domains/estimating/laborTime";
import { buildLaborPlan } from "@/domains/estimating/laborHours";
import { calculateLine } from "@/domains/estimating/calculations";
import { calculateEngineEstimate, calculateEngineLine } from "@/domains/estimating/engine/calculate";
import { canonicalTotalHours, normalizeLine } from "@/domains/estimating/canonicalLine";
import { computeTotalLaborHours } from "@/domains/estimating/laborHoursIntegrity";
import { laborExtension } from "@/domains/estimating/laborRounding";

const engineConfig = { currency: "USD" as const, taxRatePct: 0 };

describe("quarter-hour rounding rule", () => {
  it("rounds to the nearest quarter hour", () => {
    expect(roundQuarterHour(0.4)).toBe(0.5);
    expect(roundQuarterHour(0.6)).toBe(0.5);
    expect(roundQuarterHour(0.9)).toBe(1);
    expect(roundQuarterHour(1.4)).toBe(1.5);
    expect(roundQuarterHour(2.1)).toBe(2);
    expect(roundQuarterHour(16.8795)).toBe(17);
  });

  it("keeps zero at zero but floors any positive time at 15 minutes", () => {
    expect(roundQuarterHour(0)).toBe(0);
    expect(roundQuarterHour(-3)).toBe(0);
    expect(roundQuarterHour(0.011)).toBe(QUARTER_HOUR);
    expect(roundQuarterHour(0.1)).toBe(QUARTER_HOUR);
  });

  it("never leaves a tenth-of-an-hour fraction behind", () => {
    for (let i = 0; i <= 400; i += 1) {
      const raw = i / 10;
      expect(isQuarterHour(roundQuarterHour(raw))).toBe(true);
    }
  });

  it("sums quarter hours without drifting off the grid", () => {
    expect(sumQuarterHours([0.25, 0.25, 0.25])).toBe(0.75);
    expect(isQuarterHour(sumQuarterHours(Array.from({ length: 97 }, () => 0.25)))).toBe(true);
  });
});

describe("calculation paths produce quarter hours only", () => {
  it("canonical total-hours formulas normalize", () => {
    expect(canonicalTotalHours({ quantity: 306.9, hoursPerUnit: 0.055 })).toBe(17);
    expect(computeTotalLaborHours({ quantity: 400, hoursPerUnit: 0.02, setupHours: 0.5 })).toBe(8.5);
    for (let qty = 1; qty <= 200; qty += 1) {
      expect(isQuarterHour(canonicalTotalHours({ quantity: qty, hoursPerUnit: 0.037 }))).toBe(true);
    }
  });

  it("the estimating engine resolves quarter hours from any labor source", () => {
    const perUnit = calculateEngineLine(
      { id: "a", quantity: 17.4, laborHoursPerUnit: 0.37, laborRate: 85 } as never,
      engineConfig,
    );
    expect(perUnit.laborHours).toBe(6.5);

    const rate = calculateEngineLine(
      { id: "b", quantity: 100, productionRate: 46, laborRate: 85 } as never,
      engineConfig,
    );
    expect(isQuarterHour(rate.laborHours)).toBe(true);

    const flat = calculateEngineLine(
      { id: "c", quantity: 1, laborHours: 1.4, laborRate: 85 } as never,
      engineConfig,
    );
    expect(flat.laborHours).toBe(1.5);
  });

  it("engine roll-ups stay on the grid", () => {
    const result = calculateEngineEstimate(
      [
        { id: "1", quantity: 306.9, laborHoursPerUnit: 0.055, laborRate: 85 },
        { id: "2", quantity: 40, laborHoursPerUnit: 0.11, laborRate: 72 },
        { id: "3", quantity: 1, laborHours: 0.4, laborRate: 95 },
      ] as never,
      engineConfig,
    );
    for (const line of result.lines) expect(isQuarterHour(line.laborHours)).toBe(true);
    expect(isQuarterHour(result.totals.laborHours)).toBe(true);
  });

  it("labor dollars are derived from the normalized hours", () => {
    const line = calculateLine(
      {
        quantity: 1,
        laborHours: 1.4,
        laborRate: 100,
        materialCost: 0,
        equipmentCost: 0,
        subcontractorCost: 0,
        otherCost: 0,
        overheadPct: 0,
        profitPct: 0,
        contingencyPct: 0,
        isTaxable: false,
      },
      0,
    );
    /* 1.5 hr x $100, not 1.4 x $100. */
    expect(line.laborTotal).toBe(150);

    expect(laborExtension(0.4, 80)).toMatchObject({ raw: 40, display: 40 });
  });

  it("the labor plan normalizes baseline, override and roll-up hours", () => {
    const plan = buildLaborPlan(
      [
        { id: "a", description: "Hang drywall", tradeKey: "drywall", quantity: 400, unitKey: "square_foot", hoursPerUnit: 0.011 },
        { id: "b", description: "Paint walls", tradeKey: "painting", quantity: 137, unitKey: "square_foot", hoursPerUnit: 0.013 },
      ],
      { nonInstallTime: false, settings: { hourOverrides: { b: 3.4 } } },
    );
    for (const task of plan.tasks) {
      expect(isQuarterHour(task.baselineHours)).toBe(true);
      expect(isQuarterHour(task.adjustedHours)).toBe(true);
    }
    expect(plan.tasks.find((t) => t.id === "b")!.adjustedHours).toBe(3.5);
    for (const row of plan.byTrade) expect(isQuarterHour(row.adjustedHours)).toBe(true);
    expect(isQuarterHour(plan.totalHours)).toBe(true);
  });

  it("a contractor's own hours are kept as theirs, on the grid", () => {
    const c = normalizeLine({
      id: "x",
      quantity: 1,
      unitKey: "each",
      laborHours: 0.4,
      laborHoursBasis: "contractor",
      laborRate: 65,
    } as never);
    expect(c.isLaborContractorOwned).toBe(true);
    expect(c.totalLaborHours).toBe(0.5);
  });
});
