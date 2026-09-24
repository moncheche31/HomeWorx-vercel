/**
 * Turns whatever the active estimate knows into the internal labor model.
 *
 * Two very different inputs, one contractor-facing answer:
 *  - DETAILED estimates own priced lines, so hours come straight from them.
 *  - BALLPARK estimates have no lines; the recalculation engine already wrote
 *    an internal labor summary into the saved range snapshot.
 *
 * Everything here is internal. Nothing in this module is customer-facing.
 */
import {
  buildLaborPlan,
  type LaborPlan,
  type LaborSettings,
  type LaborTaskInput,
} from "@/domains/estimating/laborHours";
import type { LaborTaskHours, LaborTradeRollup } from "@/domains/estimating/laborHours";
import {
  displayLaborExtension,
  laborExtension,
} from "@/domains/estimating/laborRounding";
import { UNASSIGNED_TRADE } from "@/domains/estimating/tradeTaxonomy";
import type { EstimateDTO, EstimateLineDTO } from "../types";
import { roundMoney as money } from "@/domains/estimating/money";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** Trades are a pure rollup of the task list — never an independent number. */
export function rollupByTrade(tasks: readonly LaborTaskHours[]): LaborTradeRollup[] {
  const map = new Map<string, LaborTradeRollup>();
  for (const task of tasks) {
    const key = task.tradeKey || UNASSIGNED_TRADE;
    const row: LaborTradeRollup = map.get(key) ?? {
      tradeKey: key,
      baselineHours: 0,
      adjustedHours: 0,
      laborAmount: 0,
      laborAmountDisplay: 0,
      taskCount: 0,
    };
    row.baselineHours = round2(row.baselineHours + (task.baselineHours ?? 0));
    row.adjustedHours = round2(row.adjustedHours + (task.adjustedHours ?? 0));
    /*
     * RAW cent precision, exactly like `buildLaborPlan`. Rounding the rollup to
     * whole dollars here made the trade total drift from the identical task
     * total and fired a false "totals do not reconcile" warning. Whole dollars
     * live in `laborAmountDisplay` only.
     */
    row.laborAmount = round2(row.laborAmount + (task.laborAmount ?? 0));

    row.laborAmountDisplay +=
      task.laborAmountDisplay ?? displayLaborExtension(task.laborAmount ?? 0);
    row.taskCount += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.adjustedHours - a.adjustedHours);
}

export interface LaborCompanyDefaults {
  laborRate?: number | null;
  productivityMultiplier?: number | null;
  crewSize?: number | null;
  productiveHoursPerDay?: number | null;
}

/** Priced lines already carry total hours for the line, so they are flat hours. */
export function laborTasksFromLines(
  lines: readonly EstimateLineDTO[],
): LaborTaskInput[] {
  return lines.map((line) => ({
    id: line.id,
    description: line.description,
    tradeKey: line.tradeKey ?? line.categoryKey ?? null,
    categoryKey: line.categoryKey ?? null,
    quantity: line.quantity,
    unitKey: line.unitKey,
    flatHours: line.laborHours,
    laborRate: line.laborRate || null,
  }));
}

/** The labor block the ballpark engine persisted, when it is present. */
export function readSnapshotLabor(snapshot: unknown): Partial<LaborPlan> | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const labor = (snapshot as Record<string, unknown>)["labor"];
  if (!labor || typeof labor !== "object" || Array.isArray(labor)) return null;
  return labor as Partial<LaborPlan>;
}

export type LaborSource = "lines" | "ballpark" | "none";

export interface LaborView {
  source: LaborSource;
  plan: LaborPlan | null;
}

/**
 * Detailed lines win when they exist, because they are the most specific thing
 * the contractor has actually reviewed.
 */
export function buildLaborView(
  estimate: Pick<EstimateDTO, "intakeMode" | "rangeSnapshot" | "laborSettings"> & {
    laborSettings?: LaborSettings;
  },
  lines: readonly EstimateLineDTO[],
  company: LaborCompanyDefaults | null,
): LaborView {
  const settings = estimate.laborSettings ?? {};
  const companyDefaults = {
    laborRate: company?.laborRate ?? undefined,
    productivityMultiplier: company?.productivityMultiplier ?? undefined,
    crewSize: company?.crewSize ?? undefined,
    productiveHoursPerDay: company?.productiveHoursPerDay ?? undefined,
  };

  if (lines.length > 0) {
    return {
      source: "lines",
      plan: buildLaborPlan(laborTasksFromLines(lines), {
        company: companyDefaults,
        settings,
      }),
    };
  }

  const snapshotLabor = readSnapshotLabor(estimate.rangeSnapshot);
  if (snapshotLabor && typeof snapshotLabor.totalHours === "number") {
    /*
     * Ballpark hours come from the recalculation engine, which now persists
     * EVERY task. Trades and the project total are re-derived from that one
     * task list so the three views cannot disagree; the stored rollups are
     * only a fallback for snapshots written before full-task persistence.
     */
    /*
     * Snapshots written before rate normalization / display rounding carry raw
     * rates and no display amount, so they are re-derived on read. No
     * migration or backfill is required: the stored HOURS are the source of
     * truth and are never recomputed from dollars.
     */
    const tasks = (Array.isArray(snapshotLabor.tasks) ? snapshotLabor.tasks : []).map(
      (task) => {
        const extension = laborExtension(task.adjustedHours ?? 0, task.laborRate ?? 0);
        return {
          ...task,
          laborRate: extension.rate,
          laborAmount: extension.raw,
          laborAmountDisplay: extension.display,
        };
      },
    );
    const hasTasks = tasks.length > 0;
    const byTrade = hasTasks
      ? rollupByTrade(tasks)
      : (snapshotLabor.byTrade ?? []).map((row) => ({
          ...row,
          laborAmountDisplay:
            row.laborAmountDisplay ?? displayLaborExtension(row.laborAmount ?? 0),
        }));
    const totalHours = hasTasks
      ? round2(tasks.reduce((s, t) => s + (t.adjustedHours ?? 0), 0))
      : (snapshotLabor.totalHours ?? 0);
    const laborAmount = hasTasks
      ? money(tasks.reduce((s, t) => s + (t.laborAmount ?? 0), 0))
      : (snapshotLabor.laborAmount ?? 0);
    const laborAmountDisplay = hasTasks
      ? tasks.reduce((s, t) => s + t.laborAmountDisplay, 0)
      : displayLaborExtension(laborAmount);
    const plan: LaborPlan = {
      tasks,
      topTasks: [...tasks].sort((a, b) => b.adjustedHours - a.adjustedHours).slice(0, 5),
      byTrade,
      nonInstall: snapshotLabor.nonInstall ?? [],
      nonInstallHours: snapshotLabor.nonInstallHours ?? 0,
      baselineHours: hasTasks
        ? round2(tasks.reduce((s, t) => s + (t.baselineHours ?? 0), 0))
        : (snapshotLabor.baselineHours ?? 0),
      totalHours,
      productivityMultiplier: snapshotLabor.productivityMultiplier ?? 1,
      laborRate: snapshotLabor.laborRate ?? 0,
      laborAmount,
      laborAmountDisplay,
      duration:
        snapshotLabor.duration ??
        { crewSize: 0, productiveHoursPerDay: 0, workingDays: 0 },
      isSmallJob: snapshotLabor.isSmallJob ?? false,
      warnings: snapshotLabor.warnings ?? [],
    };
    return { source: "ballpark", plan };
  }


  return { source: "none", plan: null };
}
