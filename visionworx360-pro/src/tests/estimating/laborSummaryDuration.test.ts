import { describe, expect, it } from "vitest";

import { buildLaborPlan, reconcileLaborPlan } from "@/domains/estimating/laborHours";
import { rollupByTrade } from "@/features/estimating/services/laborView";
import { blendedCrewSize, projectCrewDuration } from "@/domains/estimating/crewDuration";

/** Pembroke's active priced lines, as persisted. */
const LINES = [
  { id: "roof", description: "Roofing", tradeKey: "roofing", hours: 225 },
  { id: "siding", description: "Siding", tradeKey: "exterior", hours: 133.5 },
  { id: "land", description: "Landscaping", tradeKey: "landscaping", hours: 121.5 },
  { id: "deck", description: "Deck", tradeKey: "exterior", hours: 52.75 },
  { id: "win1", description: "Windows - single units", tradeKey: "doors_windows", hours: 45 },
  { id: "win2", description: "Windows - double units", tradeKey: "doors_windows", hours: 36 },
  { id: "doors", description: "Exterior doors", tradeKey: "doors", hours: 20 },
  { id: "fascia", description: "Fascia and soffit trim", tradeKey: "roofing", hours: 13.75 },
  { id: "col", description: "Structural columns", tradeKey: "framing", hours: 5.25 },
];

const plan = () =>
  buildLaborPlan(
    LINES.map((l) => ({
      id: l.id,
      description: l.description,
      tradeKey: l.tradeKey,
      quantity: 1,
      unitKey: "each",
      flatHours: l.hours,
      laborRate: 85,
    })),
    { company: {}, settings: {} },
  );

describe("labor summary reconciliation and duration", () => {
  it("does not warn when the trade rollup is a pure sum of the tasks", () => {
    const base = plan();
    /* The panel re-rolls the tasks locally; that path must stay cent-precise. */
    const local = { ...base, byTrade: rollupByTrade(base.tasks) };
    const r = reconcileLaborPlan(local);
    expect(r.taskHours).toBe(652.75);
    expect(r.tradeAmount).toBe(r.taskAmount);
    expect(r.hoursMatch).toBe(true);
    expect(r.amountMatch).toBe(true);
  });

  it("blends crew size across the trades instead of a flat company default", () => {
    const base = plan();
    const trades = base.byTrade.map((r) => ({
      tradeKey: r.tradeKey,
      crewHours: r.adjustedHours,
    }));
    expect(blendedCrewSize(trades)).toBe(3);
    const d = projectCrewDuration({ totalHours: base.totalHours, trades });
    expect(d.productiveHoursPerDay).toBe(8);
    expect(d.days).toBe(28);
  });

  it("still honours an explicit contractor crew size", () => {
    const d = projectCrewDuration({
      totalHours: 652.75,
      trades: [{ tradeKey: "roofing", crewHours: 652.75 }],
      crewSize: 5,
      productiveHoursPerDay: 10,
    });
    expect(d.crewSize).toBe(5);
    expect(d.days).toBe(14);
  });
});
