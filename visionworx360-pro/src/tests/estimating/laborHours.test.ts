import { describe, expect, it } from "vitest";
import {
  buildLaborPlan,
  clampProductivity,
  estimateLaborDuration,
  normalizeLaborSettings,
  resolveLaborDefaults,
  stripInternalLabor,
  SERVICE_CALL_MINIMUM_HOURS,
  type LaborTaskInput,
} from "@/domains/estimating/laborHours";
import { buildLaborView } from "@/features/estimating/services/laborView";

const tasks: LaborTaskInput[] = [
  { id: "a", description: "Hang drywall", tradeKey: "drywall", quantity: 400, unitKey: "square_foot", hoursPerUnit: 0.05 },
  { id: "b", description: "Paint walls", tradeKey: "painting", quantity: 400, unitKey: "square_foot", hoursPerUnit: 0.02 },
];

describe("labor hour engine", () => {
  it("derives baseline hours from quantity and production assumption", () => {
    const plan = buildLaborPlan(tasks, { nonInstallTime: false });
    expect(plan.baselineHours).toBe(28);
    expect(plan.totalHours).toBe(28);
  });

  it("applies the productivity multiplier to adjusted hours", () => {
    const plan = buildLaborPlan(tasks, {
      nonInstallTime: false,
      settings: { productivityMultiplier: 1.2 },
    });
    /* 24 + 9.6 -> quarter-hour normalized per task: 24 + 9.5 = 33.5 */
    expect(plan.totalHours).toBe(33.5);
    expect(plan.productivityMultiplier).toBe(1.2);
  });

  it("honours direct hour overrides and flags implausible ones", () => {
    const plan = buildLaborPlan(tasks, {
      nonInstallTime: false,
      settings: { hourOverrides: { a: 0.5 } },
    });
    const task = plan.tasks.find((t) => t.id === "a")!;
    expect(task.adjustedHours).toBe(0.5);
    expect(task.isOverridden).toBe(true);
    expect(task.isImplausible).toBe(true);
    expect(plan.warnings).toHaveLength(1);
  });

  it("rolls hours up by trade and by project", () => {
    const plan = buildLaborPlan(tasks, { nonInstallTime: false });
    expect(plan.byTrade.map((r) => r.tradeKey)).toEqual(["drywall", "painting"]);
    expect(plan.byTrade[0]!.adjustedHours).toBe(20);
    expect(plan.byTrade.reduce((s, r) => s + r.adjustedHours, 0)).toBe(plan.totalHours);
  });

  it("adds non-install time and a service-call minimum on small jobs", () => {
    const plan = buildLaborPlan(
      [{ id: "x", description: "Swap faucet", tradeKey: "plumbing", quantity: 1, flatHours: 0.5 }],
      {},
    );
    expect(plan.isSmallJob).toBe(true);
    expect(plan.totalHours).toBeGreaterThanOrEqual(SERVICE_CALL_MINIMUM_HOURS);
    expect(plan.nonInstall.some((e) => e.key === "mobilization")).toBe(true);
  });

  it("does not add small-job overhead time to a large job", () => {
    const plan = buildLaborPlan(
      [{ id: "big", description: "Frame addition", quantity: 1, flatHours: 240 }],
      {},
    );
    expect(plan.isSmallJob).toBe(false);
    expect(plan.nonInstallHours).toBe(0);
  });

  it("estimates working days from crew capacity", () => {
    expect(estimateLaborDuration(65, { crewSize: 2, productiveHoursPerDay: 6.5 }).workingDays).toBe(5);
  });

  it("resolves company defaults with estimate overrides", () => {
    const resolved = resolveLaborDefaults(
      { laborRate: 90, crewSize: 3, productiveHoursPerDay: 7, productivityMultiplier: 1 },
      { laborRate: 120 },
    );
    expect(resolved.laborRate).toBe(120);
    expect(resolved.crewSize).toBe(3);
  });

  it("clamps implausible productivity multipliers", () => {
    expect(clampProductivity(9)).toBe(2.5);
    expect(clampProductivity(0.1)).toBe(0.5);
    expect(clampProductivity(null)).toBe(1);
  });

  it("normalizes stored labor settings", () => {
    expect(normalizeLaborSettings({ laborRate: "95", hourOverrides: { a: "3" } })).toEqual({
      laborRate: 95,
      hourOverrides: { a: 3 },
    });
    expect(normalizeLaborSettings(null)).toEqual({});
  });

  it("keeps hours out of customer-facing payloads", () => {
    const stripped = stripInternalLabor({
      description: "Drywall",
      total: 1200,
      adjustedHours: 20,
      productivityMultiplier: 1.2,
    }) as Record<string, unknown>;
    expect(stripped.total).toBe(1200);
    expect(stripped.adjustedHours).toBeUndefined();
    expect(stripped.productivityMultiplier).toBeUndefined();
  });
});

describe("labor view source selection", () => {
  const base = { intakeMode: "detailed" as const, rangeSnapshot: null, laborSettings: {} };

  it("prefers detailed lines when they exist", () => {
    const view = buildLaborView(
      base,
      [
        {
          id: "l1",
          description: "Trim",
          tradeKey: "carpentry",
          categoryKey: null,
          quantity: 40,
          unitKey: "linear_foot",
          laborHours: 6,
          laborRate: 85,
        } as never,
      ],
      null,
    );
    expect(view.source).toBe("lines");
    /* 6 install hrs + small-job non-install time, which is now a real task. */
    expect(view.plan?.tasks.find((t) => t.id === "l1")?.baselineHours).toBe(6);
    expect(view.plan?.baselineHours).toBe(8.25);

  });

  it("falls back to the ballpark snapshot labor summary", () => {
    const view = buildLaborView(
      {
        intakeMode: "ballpark",
        rangeSnapshot: { labor: { totalHours: 120, baselineHours: 100, byTrade: [], topTasks: [] } },
        laborSettings: {},
      } as never,
      [],
      null,
    );
    expect(view.source).toBe("ballpark");
    expect(view.plan?.totalHours).toBe(120);
  });

  it("reports no labor model when nothing is priced", () => {
    const view = buildLaborView(base, [], null);
    expect(view.source).toBe("none");
    expect(view.plan).toBeNull();
  });
});
