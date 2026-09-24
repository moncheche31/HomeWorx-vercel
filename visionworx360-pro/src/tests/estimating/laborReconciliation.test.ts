import { describe, expect, it } from "vitest";
import {
  buildLaborPlan,
  reconcileLaborPlan,
  normalizeTradeKey,
  UNASSIGNED_TRADE,
  type LaborTaskInput,
} from "@/domains/estimating/laborHours";
import { buildLaborView, rollupByTrade } from "@/features/estimating/services/laborView";

/**
 * Regression guard for the Master Suite Garage Conversion defect: the Tasks
 * view summed to ~119 hrs while the Project view reported 233 hrs, because
 * only the top five tasks were ever persisted/rendered. Tasks, Trades and
 * Project must always be three views of one model.
 */
const scope: LaborTaskInput[] = [
  { id: "1", description: "Demo garage slab prep", tradeKey: "demolition", quantity: 400, unitKey: "square_foot", hoursPerUnit: 0.05 },
  { id: "2", description: "Frame interior walls", tradeKey: "framing", quantity: 120, unitKey: "linear_foot", hoursPerUnit: 0.25 },
  { id: "3", description: "Rough plumbing for bath", tradeKey: "plumbing", quantity: 1, flatHours: 24 },
  { id: "4", description: "Electrical rough-in", tradeKey: "electrical", quantity: 1, flatHours: 28 },
  { id: "5", description: "Hang and finish drywall", tradeKey: "drywall", quantity: 1800, unitKey: "square_foot", hoursPerUnit: 0.02 },
  { id: "6", description: "Install baseboard and casing", tradeKey: "trim carpentry", quantity: 220, unitKey: "linear_foot", hoursPerUnit: 0.08 },
  { id: "7", description: "Cabinet installation", tradeKey: "cabinets", quantity: 12, flatHours: 10 },
  { id: "8", description: "Paint walls and ceilings", tradeKey: "painting", quantity: 1800, unitKey: "square_foot", hoursPerUnit: 0.012 },
  { id: "9", description: "Tile shower surround", tradeKey: "tile", quantity: 90, unitKey: "square_foot", hoursPerUnit: 0.2 },
  { id: "10", description: "Mystery allowance work", quantity: 1, flatHours: 4 },
];

const sum = (values: readonly number[]) =>
  Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

describe("labor reconciliation — tasks = trades = project", () => {
  it("keeps every labor-bearing scope item in the task list", () => {
    const plan = buildLaborPlan(scope);
    for (const item of scope) {
      expect(plan.tasks.some((t) => t.id === item.id)).toBe(true);
    }
  });

  it("reconciles hours across all three views", () => {
    const plan = buildLaborPlan(scope);
    const r = reconcileLaborPlan(plan);
    expect(r.hoursMatch).toBe(true);
    expect(r.taskHours).toBe(r.tradeHours);
    expect(r.taskHours).toBe(plan.totalHours);
  });

  it("reconciles labor dollars across all three views", () => {
    const plan = buildLaborPlan(scope);
    const r = reconcileLaborPlan(plan);
    expect(r.amountMatch).toBe(true);
    expect(r.taskAmount).toBe(r.tradeAmount);
    expect(r.taskAmount).toBe(plan.laborAmount);
  });

  it("includes small-job non-install time as a real task, not a phantom total", () => {
    const plan = buildLaborPlan([
      { id: "swap", description: "Swap faucet", tradeKey: "plumbing", quantity: 1, flatHours: 0.5 },
    ]);
    expect(plan.tasks.some((t) => t.isNonInstall)).toBe(true);
    expect(reconcileLaborPlan(plan).hoursMatch).toBe(true);
    expect(plan.byTrade.some((r) => r.tradeKey === "general_conditions")).toBe(true);
  });

  it("rolls a task-hour edit up to trade and project totals", () => {
    const before = buildLaborPlan(scope);
    const after = buildLaborPlan(scope, { settings: { hourOverrides: { "2": 10 } } });
    expect(after.totalHours).not.toBe(before.totalHours);
    const framing = after.byTrade.find((r) => r.tradeKey === "framing")!;
    expect(framing.adjustedHours).toBe(10);
    expect(reconcileLaborPlan(after).hoursMatch).toBe(true);
  });

  it("applies the productivity multiplier exactly once", () => {
    const base = buildLaborPlan(scope, { nonInstallTime: false });
    const paced = buildLaborPlan(scope, {
      nonInstallTime: false,
      settings: { productivityMultiplier: 1.2 },
    });
    /* Quarter-hour normalization happens per task, so the roll-up is within a quarter. */
    expect(paced.totalHours).toBeCloseTo(base.totalHours * 1.2, 0);
    expect(reconcileLaborPlan(paced).hoursMatch).toBe(true);
  });

  it("does not re-apply the multiplier on top of a task override", () => {
    const plan = buildLaborPlan(scope, {
      settings: { productivityMultiplier: 1.5, hourOverrides: { "3": 20 } },
    });
    const task = plan.tasks.find((t) => t.id === "3")!;
    expect(task.adjustedHours).toBe(20);
    expect(task.appliedMultiplier).toBe(1);
  });

  it("keeps untraded work visible and inside the totals", () => {
    const plan = buildLaborPlan(scope);
    const orphan = plan.tasks.find((t) => t.id === "10")!;
    expect(orphan.tradeKey).toBe(UNASSIGNED_TRADE);
    expect(plan.warnings.some((w) => w.kind === "unassigned_trade")).toBe(true);
    expect(reconcileLaborPlan(plan).unassignedTaskCount).toBe(1);
    expect(sum(plan.byTrade.map((r) => r.adjustedHours))).toBe(plan.totalHours);
  });
});

describe("GC trade taxonomy", () => {
  it("folds trim, cabinets and stairs into finish carpentry", () => {
    for (const raw of ["baseboard", "crown molding", "cabinet installation", "stairs & railings", "interior trim"]) {
      expect(normalizeTradeKey(raw)).toBe("finish_carpentry");
    }
  });

  it("stays a concise subcontractor list on a full project", () => {
    const plan = buildLaborPlan(scope);
    expect(plan.byTrade.length).toBeLessThanOrEqual(12);
  });

  it("routes unknown labels to unassigned instead of inventing a trade", () => {
    expect(normalizeTradeKey("zzz unknown work")).toBe(UNASSIGNED_TRADE);
    expect(normalizeTradeKey(null)).toBe(UNASSIGNED_TRADE);
  });
});

describe("ballpark snapshot labor view", () => {
  const tasks = buildLaborPlan(scope).tasks;

  it("rebuilds trades and totals from the full persisted task list", () => {
    const view = buildLaborView(
      {
        intakeMode: "ballpark",
        rangeSnapshot: { labor: { totalHours: 1, tasks, laborRate: 85 } },
        laborSettings: {},
      } as never,
      [],
      null,
    );
    expect(view.source).toBe("ballpark");
    expect(view.plan!.tasks).toHaveLength(tasks.length);
    expect(reconcileLaborPlan(view.plan!).hoursMatch).toBe(true);
  });

  it("derives trade rollups purely from tasks", () => {
    const rows = rollupByTrade(tasks);
    expect(sum(rows.map((r) => r.adjustedHours))).toBe(sum(tasks.map((t) => t.adjustedHours)));
  });
});
