/**
 * Internal labor-hour estimating.
 *
 * Every priced task a contractor performs consumes TIME, and time is the thing
 * a contractor actually sells. This module turns resolved scope into an
 * internal hour model:
 *
 *   quantity / production assumption -> baseline hours -> adjusted hours
 *      -> labor rate -> labor sell price
 *
 * Three deliberate product rules live here:
 *
 * 1. INTERNAL ONLY. Hours, multipliers, crew speed and production assumptions
 *    are contractor-facing. `stripInternalLabor()` exists so nothing in this
 *    module can accidentally reach a customer document.
 * 2. CONTRACTOR AUTHORITY. Any inferred number can be overridden — by a plain
 *    "my crew is 20% slower" multiplier, or by typing the hours directly.
 *    Extreme overrides are FLAGGED, never blocked, and a later recalculation
 *    of the surrounding scope never silently erases them.
 * 3. HONEST SMALL-JOB TIME. A 30-minute field task is not a 0.5-hour job.
 *    Mobilization, setup, protection, cleanup and a service-call minimum are
 *    modelled as real hours, not as a mystery surcharge.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import {
  normalizeTradeKey,
  suggestTradeFromText,
  UNASSIGNED_TRADE,
} from "./tradeTaxonomy";
import { resolveTradeKey } from "./tradeInference";
import {
  displayLaborExtension,
  laborExtension,
  normalizeLaborRate,
} from "./laborRounding";
import { conciseTaskLabel } from "./taskNaming";
import { roundQuarterHour, sumQuarterHours } from "./laborTime";

export {
  normalizeTradeKey,
  suggestTradeFromText,
  UNASSIGNED_TRADE,
  LABOR_TRADES,
} from "./tradeTaxonomy";
export type { LaborTradeKey } from "./tradeTaxonomy";
export {
  displayLaborExtension,
  laborExtension,
  normalizeLaborRate,
  rawLaborExtension,
} from "./laborRounding";
export { conciseTaskLabel, splitCompoundTask } from "./taskNaming";

const round2 = (v: number): number =>
  Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------------------------------------------ *
 * Settings — company defaults + per-estimate overrides
 * ------------------------------------------------------------------ */

/**
 * Plain contractor language, not abstract math: 1.00 is "the book pace",
 * 1.20 is "my crew takes 20% longer than the book", 0.90 is "we're 10% faster".
 */
export const BASELINE_PRODUCTIVITY = 1;

/** Bounds on the multiplier. Outside this it stops being a pace and becomes a guess. */
export const MIN_PRODUCTIVITY = 0.5;
export const MAX_PRODUCTIVITY = 2.5;

/** A direct hour override this far from baseline is flagged for a second look. */
export const OVERRIDE_FLAG_LOW = 0.4;
export const OVERRIDE_FLAG_HIGH = 3;

/** Non-install time on a small job. Real hours a real contractor really spends. */
export const MOBILIZATION_HOURS = 0.75;
export const SETUP_PROTECTION_HOURS = 0.5;
import { BOOK_NATIONAL_LABOR_RATE } from "@/domains/estimating/pricing/bookLaborRates";

export const CLEANUP_DISPOSAL_HOURS = 0.5;
export const MATERIAL_HANDLING_HOURS = 0.5;
/** Nobody rolls a truck for less than this. */
export const SERVICE_CALL_MINIMUM_HOURS = 2;
/** Above this many install hours the job carries its own overhead time. */
export const SMALL_JOB_HOUR_THRESHOLD = 16;

export interface LaborDefaults {
  /** Loaded hourly labor rate used for labor sell price. */
  laborRate: number;
  /** 1.00 = baseline book pace. */
  productivityMultiplier: number;
  /** Workers on site. Converts labor hours into calendar days. */
  crewSize: number;
  /** Genuinely productive hours per worker per day (never 8). */
  productiveHoursPerDay: number;
}

export const COMPANY_LABOR_DEFAULTS: LaborDefaults = {
  /* Book national baseline (NCE 2026 carpenter). Never a flat company rate. */
  laborRate: BOOK_NATIONAL_LABOR_RATE,
  productivityMultiplier: BASELINE_PRODUCTIVITY,
  crewSize: 2,
  productiveHoursPerDay: 6.5,
};

/**
 * Per-estimate labor settings. Every field is optional: an absent field means
 * "use the company default". Estimate overrides NEVER write back to the
 * company profile.
 */
export interface LaborSettings {
  productivityMultiplier?: number | null;
  laborRate?: number | null;
  crewSize?: number | null;
  productiveHoursPerDay?: number | null;
  /** Contractor-typed hours keyed by task id. Survives scope recalculation. */
  hourOverrides?: Readonly<Record<string, number>> | null;
  /** Include mobilization / setup / cleanup / minimum time. Default true. */
  includeNonInstallTime?: boolean | null;
}

export const EMPTY_LABOR_SETTINGS: LaborSettings = {};

export function clampProductivity(value: unknown): number {
  const n = num(value);
  if (!n) return BASELINE_PRODUCTIVITY;
  return Math.min(MAX_PRODUCTIVITY, Math.max(MIN_PRODUCTIVITY, round2(n)));
}

/** Company defaults + estimate overrides, resolved into one usable set. */
export function resolveLaborDefaults(
  company: Partial<LaborDefaults> | null | undefined,
  settings: LaborSettings | null | undefined,
): LaborDefaults {
  const base: LaborDefaults = {
    laborRate: num(company?.laborRate) || COMPANY_LABOR_DEFAULTS.laborRate,
    productivityMultiplier: clampProductivity(
      company?.productivityMultiplier ?? COMPANY_LABOR_DEFAULTS.productivityMultiplier,
    ),
    crewSize: num(company?.crewSize) || COMPANY_LABOR_DEFAULTS.crewSize,
    productiveHoursPerDay:
      num(company?.productiveHoursPerDay) || COMPANY_LABOR_DEFAULTS.productiveHoursPerDay,
  };
  if (!settings) return base;
  return {
    laborRate: num(settings.laborRate) || base.laborRate,
    productivityMultiplier:
      settings.productivityMultiplier == null
        ? base.productivityMultiplier
        : clampProductivity(settings.productivityMultiplier),
    crewSize: num(settings.crewSize) || base.crewSize,
    productiveHoursPerDay: num(settings.productiveHoursPerDay) || base.productiveHoursPerDay,
  };
}

/** Parse whatever was stored in the estimate's labor settings JSON. */
export function normalizeLaborSettings(value: unknown): LaborSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const overrides: Record<string, number> = {};
  const stored = raw["hourOverrides"];
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const [key, v] of Object.entries(stored as Record<string, unknown>)) {
      const n = num(v);
      /* Contractor-entered hours are kept, but normalized to the quarter hour. */
      if (n >= 0 && Number.isFinite(n)) overrides[key] = roundQuarterHour(n);
    }
  }
  const out: LaborSettings = {};
  if (raw["productivityMultiplier"] != null)
    out.productivityMultiplier = clampProductivity(raw["productivityMultiplier"]);
  if (raw["laborRate"] != null) out.laborRate = round2(num(raw["laborRate"]));
  if (raw["crewSize"] != null) out.crewSize = round2(num(raw["crewSize"]));
  if (raw["productiveHoursPerDay"] != null)
    out.productiveHoursPerDay = round2(num(raw["productiveHoursPerDay"]));
  if (raw["includeNonInstallTime"] != null)
    out.includeNonInstallTime = Boolean(raw["includeNonInstallTime"]);
  if (Object.keys(overrides).length) out.hourOverrides = overrides;
  return out;
}

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

/** One unit of work as the labor model sees it. */
export interface LaborTaskInput {
  id: string;
  description: string;
  /** demolition, framing, finish carpentry, painting, plumbing… */
  tradeKey?: string | null;
  categoryKey?: string | null;
  quantity?: number | null;
  unitKey?: string | null;
  /** The production assumption: hours consumed per unit of measure. */
  hoursPerUnit?: number | null;
  /** Units produced per crew hour. Used when `hoursPerUnit` is absent. */
  productionRate?: number | null;
  /** A flat hour figure that does not scale with quantity. */
  flatHours?: number | null;
  /** Per-task rate. Falls back to the resolved labor rate. */
  laborRate?: number | null;
}

export type LaborHourSource = "production_rate" | "flat" | "override";

export interface LaborTaskHours {
  id: string;
  description: string;
  tradeKey: string;
  quantity: number;
  unitKey: string | null;
  hoursPerUnit: number | null;
  /** Hours before any multiplier or override. The book number. */
  baselineHours: number;
  /** What the contractor is actually planning for. */
  adjustedHours: number;
  /** The multiplier that produced `adjustedHours` (1 when overridden directly). */
  appliedMultiplier: number;
  source: LaborHourSource;
  /** The contractor typed these hours in. Never silently reset. */
  isOverridden: boolean;
  /** An override far outside the plausible production band. Flagged, not blocked. */
  isImplausible: boolean;
  /** Always normalized to the nearest $0.05 before any math runs. */
  laborRate: number;
  /** adjustedHours x laborRate. Internal labor cost/sell basis, no markup. */
  laborAmount: number;
  /** `laborAmount` rounded UP to the next whole dollar. Display value only. */
  laborAmountDisplay: number;
  /** Mobilization / setup / cleanup time, carried as General Conditions. */
  isNonInstall?: boolean;
  nonInstallKey?: LaborNonInstallKey;
}

export type LaborNonInstallKey =
  | "mobilization"
  | "setupProtection"
  | "cleanupDisposal"
  | "materialHandling"
  | "serviceCallMinimum";

export interface LaborNonInstallEntry {
  key: LaborNonInstallKey;
  hours: number;
}

export interface LaborTradeRollup {
  tradeKey: string;
  baselineHours: number;
  adjustedHours: number;
  laborAmount: number;
  /** Sum of the member tasks' displayed whole-dollar amounts. */
  laborAmountDisplay: number;
  taskCount: number;
}

export interface LaborDurationEstimate {
  crewSize: number;
  productiveHoursPerDay: number;
  /** Calendar working days at this crew size. An ESTIMATE, never a schedule. */
  workingDays: number;
}

export interface LaborPlan {
  tasks: LaborTaskHours[];
  /** Highest-hour tasks first: "which tasks are driving the hours?". */
  topTasks: LaborTaskHours[];
  byTrade: LaborTradeRollup[];
  nonInstall: LaborNonInstallEntry[];
  nonInstallHours: number;
  /** Install hours only, before multiplier. */
  baselineHours: number;
  /** Everything the contractor should plan for, including non-install time. */
  totalHours: number;
  productivityMultiplier: number;
  laborRate: number;
  /** totalHours x laborRate. Raw labor money before overhead/profit/markup. */
  laborAmount: number;
  /** Sum of every task's displayed whole-dollar amount. */
  laborAmountDisplay: number;
  duration: LaborDurationEstimate;
  isSmallJob: boolean;
  /** Overrides worth a second look. Advisory only. */
  warnings: Array<{ taskId: string; kind: "implausible_override" | "unassigned_trade" }>;
}

const UNTRADED = UNASSIGNED_TRADE;

/** Hours the production assumption says this task takes, before any opinion. */
export function baselineTaskHours(task: LaborTaskInput): number {
  const qty = num(task.quantity);
  const perUnit =
    task.hoursPerUnit != null
      ? num(task.hoursPerUnit)
      : num(task.productionRate) > 0
        ? 1 / num(task.productionRate)
        : 0;
  /* Quarter-hour invariant: baseline hours land on the 15-minute grid. */
  return roundQuarterHour(perUnit * qty + num(task.flatHours));
}

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

export interface LaborPlanOptions {
  company?: Partial<LaborDefaults> | null;
  settings?: LaborSettings | null;
  /**
   * Small jobs need mobilization, setup, cleanup and a service-call minimum.
   * Pass false for raw production math (unit tests, assembly authoring).
   */
  nonInstallTime?: boolean;
}

/**
 * Build the internal labor model for a set of tasks.
 *
 * Deliberately NOT a schedule and NOT a time sheet: it answers "how many hours
 * does this app think the job takes, by trade, and what does that do to price".
 */
export function buildLaborPlan(
  taskInputs: readonly LaborTaskInput[],
  options: LaborPlanOptions = {},
): LaborPlan {
  const settings = options.settings ?? {};
  const defaults = resolveLaborDefaults(options.company, settings);
  const multiplier = defaults.productivityMultiplier;
  const overrides = settings.hourOverrides ?? {};

  const tasks: LaborTaskHours[] = [];
  const warnings: LaborPlan["warnings"] = [];

  for (const input of taskInputs) {
    const baselineHours = baselineTaskHours(input);
    const overrideRaw = overrides[input.id];
    const hasOverride =
      typeof overrideRaw === "number" && Number.isFinite(overrideRaw) && overrideRaw >= 0;
    const adjustedHours = hasOverride
      ? roundQuarterHour(overrideRaw)
      : roundQuarterHour(baselineHours * multiplier);
    const isImplausible =
      hasOverride &&
      baselineHours > 0 &&
      (adjustedHours < baselineHours * OVERRIDE_FLAG_LOW ||
        adjustedHours > baselineHours * OVERRIDE_FLAG_HIGH);
    if (isImplausible) warnings.push({ taskId: input.id, kind: "implausible_override" });

    const laborRate = normalizeLaborRate(num(input.laborRate) || defaults.laborRate);
    /*
     * The label wins when it maps to a real trade; otherwise the WORDING of the
     * work decides, so "install shower tile" lands in Tile rather than in an
     * Unassigned bucket just because the generator forgot a trade key.
     */
    const tradeKey = resolveTradeKey(
      input.tradeKey || input.categoryKey || UNTRADED,
      input.description,
    );
    const extension = laborExtension(adjustedHours, laborRate);
    tasks.push({
      id: input.id,
      description: conciseTaskLabel(input.description) || input.description,
      tradeKey,
      quantity: round2(num(input.quantity)),
      unitKey: input.unitKey ?? null,
      hoursPerUnit:
        input.hoursPerUnit != null
          ? round2(num(input.hoursPerUnit))
          : num(input.productionRate) > 0
            ? round2(1 / num(input.productionRate))
            : null,
      baselineHours,
      adjustedHours,
      appliedMultiplier: hasOverride ? 1 : multiplier,
      source: hasOverride ? "override" : input.hoursPerUnit != null ? "production_rate" : "flat",
      isOverridden: hasOverride,
      isImplausible,
      laborRate,
      laborAmount: extension.raw,
      laborAmountDisplay: extension.display,
    });
  }

  const installHours = sumQuarterHours(tasks.map((t) => t.adjustedHours));
  const baselineHours = sumQuarterHours(tasks.map((t) => t.baselineHours));

  /* Small-job non-install time. Large jobs absorb it inside the assemblies. */
  const wantsNonInstall =
    options.nonInstallTime === false || settings.includeNonInstallTime === false
      ? false
      : true;
  const isSmallJob = wantsNonInstall && installHours > 0 && installHours <= SMALL_JOB_HOUR_THRESHOLD;
  const nonInstall: LaborNonInstallEntry[] = [];
  if (isSmallJob) {
    nonInstall.push(
      { key: "mobilization", hours: MOBILIZATION_HOURS },
      { key: "setupProtection", hours: SETUP_PROTECTION_HOURS },
      { key: "cleanupDisposal", hours: CLEANUP_DISPOSAL_HOURS },
      { key: "materialHandling", hours: MATERIAL_HANDLING_HOURS },
    );
  }
  let totalHours = sumQuarterHours([installHours, ...nonInstall.map((e) => e.hours)]);

  /* Service-call minimum: a half-hour job still costs a half-day of a life. */
  if (isSmallJob && totalHours < SERVICE_CALL_MINIMUM_HOURS) {
    const topUp = roundQuarterHour(SERVICE_CALL_MINIMUM_HOURS - totalHours);
    nonInstall.push({ key: "serviceCallMinimum", hours: topUp });
    totalHours = SERVICE_CALL_MINIMUM_HOURS;
  }

  /*
   * RECONCILIATION RULE. Non-install time used to live only in the project
   * total, which made the Tasks view sum to less than the Project view. It is
   * real crew time, so it is now a real TASK — carried under General
   * Conditions — and every view sums the exact same task list.
   */
  const nonInstallRate = normalizeLaborRate(defaults.laborRate);
  for (const entry of nonInstall) {
    const extension = laborExtension(entry.hours, nonInstallRate);
    tasks.push({
      id: `non_install:${entry.key}`,
      description: entry.key,
      tradeKey: "general_conditions",
      quantity: 0,
      unitKey: null,
      hoursPerUnit: null,
      baselineHours: entry.hours,
      adjustedHours: entry.hours,
      appliedMultiplier: 1,
      source: "flat",
      isOverridden: false,
      isImplausible: false,
      laborRate: nonInstallRate,
      laborAmount: extension.raw,
      laborAmountDisplay: extension.display,
      isNonInstall: true,
      nonInstallKey: entry.key,
    });
  }

  const tradeMap = new Map<string, LaborTradeRollup>();
  for (const task of tasks) {
    if (task.tradeKey === UNASSIGNED_TRADE && !task.isNonInstall) {
      warnings.push({ taskId: task.id, kind: "unassigned_trade" });
    }
    const row: LaborTradeRollup = tradeMap.get(task.tradeKey) ?? {
      tradeKey: task.tradeKey,
      baselineHours: 0,
      adjustedHours: 0,
      laborAmount: 0,
      laborAmountDisplay: 0,
      taskCount: 0,
    };
    row.baselineHours = sumQuarterHours([row.baselineHours, task.baselineHours]);
    row.adjustedHours = sumQuarterHours([row.adjustedHours, task.adjustedHours]);
    row.laborAmount = round2(row.laborAmount + task.laborAmount);
    /* Whole dollars are ADDED, never re-ceiled, so trades sum to the project. */
    row.laborAmountDisplay += task.laborAmountDisplay;
    row.taskCount += 1;
    tradeMap.set(task.tradeKey, row);
  }

  const nonInstallHours = sumQuarterHours(nonInstall.map((e) => e.hours));
  const allBaselineHours = sumQuarterHours(tasks.map((t) => t.baselineHours));
  const laborAmount = round2(tasks.reduce((s, t) => s + t.laborAmount, 0));
  const laborAmountDisplay = tasks.reduce((s, t) => s + t.laborAmountDisplay, 0);

  return {
    tasks,
    topTasks: [...tasks].sort((a, b) => b.adjustedHours - a.adjustedHours).slice(0, 5),
    byTrade: [...tradeMap.values()].sort((a, b) => b.adjustedHours - a.adjustedHours),
    nonInstall,
    nonInstallHours,
    baselineHours: allBaselineHours,
    totalHours,
    productivityMultiplier: multiplier,
    laborRate: normalizeLaborRate(defaults.laborRate),
    laborAmount,
    laborAmountDisplay,
    duration: estimateLaborDuration(totalHours, defaults),
    isSmallJob,
    warnings,
  };
}

/* ------------------------------------------------------------------ *
 * Reconciliation
 * ------------------------------------------------------------------ */

export interface LaborReconciliation {
  taskHours: number;
  tradeHours: number;
  projectHours: number;
  taskAmount: number;
  tradeAmount: number;
  projectAmount: number;
  /** Displayed (whole-dollar) totals — what the contractor actually reads. */
  taskAmountDisplay: number;
  tradeAmountDisplay: number;
  projectAmountDisplay: number;
  hoursMatch: boolean;
  amountMatch: boolean;
  /** Displayed dollars must reconcile too, exactly, with no epsilon. */
  displayAmountMatch: boolean;
  unassignedTaskCount: number;
}

/** Tolerance for float noise only — NOT a licence for a real discrepancy. */
const RECONCILE_EPSILON = 0.05;

/**
 * Tasks, Trades and Project are three views of ONE model. This proves it, and
 * the regression suite asserts it, so a subset view can never ship again.
 *
 * Displayed dollars are checked separately: because every rollup ADDS already
 * ceiled task amounts instead of ceiling a sum, the whole-dollar totals must
 * match to the penny as well.
 */
export function reconcileLaborPlan(plan: LaborPlan): LaborReconciliation {
  const taskHours = sumQuarterHours(plan.tasks.map((t) => t.adjustedHours));
  const tradeHours = sumQuarterHours(plan.byTrade.map((r) => r.adjustedHours));
  const taskAmount = round2(plan.tasks.reduce((s, t) => s + t.laborAmount, 0));
  const tradeAmount = round2(plan.byTrade.reduce((s, r) => s + r.laborAmount, 0));
  const taskAmountDisplay = plan.tasks.reduce(
    (s, t) => s + (t.laborAmountDisplay ?? displayLaborExtension(t.laborAmount)),
    0,
  );
  const tradeAmountDisplay = plan.byTrade.reduce(
    (s, r) => s + (r.laborAmountDisplay ?? displayLaborExtension(r.laborAmount)),
    0,
  );
  const projectAmountDisplay = plan.laborAmountDisplay ?? taskAmountDisplay;
  return {
    taskHours,
    tradeHours,
    projectHours: plan.totalHours,
    taskAmount,
    tradeAmount,
    projectAmount: plan.laborAmount,
    taskAmountDisplay,
    tradeAmountDisplay,
    projectAmountDisplay,
    hoursMatch:
      Math.abs(taskHours - tradeHours) <= RECONCILE_EPSILON &&
      Math.abs(taskHours - plan.totalHours) <= RECONCILE_EPSILON,
    amountMatch:
      Math.abs(taskAmount - tradeAmount) <= RECONCILE_EPSILON &&
      Math.abs(taskAmount - plan.laborAmount) <= RECONCILE_EPSILON,
    displayAmountMatch:
      taskAmountDisplay === tradeAmountDisplay &&
      taskAmountDisplay === projectAmountDisplay,
    unassignedTaskCount: plan.tasks.filter((t) => t.tradeKey === UNASSIGNED_TRADE).length,
  };
}


/**
 * Labor duration, clearly an ESTIMATE. Weather, inspections, selections and
 * subcontractor availability are not modelled and must never be implied.
 */
export function estimateLaborDuration(
  totalHours: number,
  defaults: Pick<LaborDefaults, "crewSize" | "productiveHoursPerDay">,
): LaborDurationEstimate {
  const crewSize = Math.max(1, num(defaults.crewSize) || 1);
  const productiveHoursPerDay = Math.max(1, num(defaults.productiveHoursPerDay) || 1);
  const capacity = crewSize * productiveHoursPerDay;
  return {
    crewSize,
    productiveHoursPerDay,
    workingDays: capacity > 0 ? Math.max(0, Math.ceil((num(totalHours) / capacity) * 10) / 10) : 0,
  };
}

/**
 * The audit trail behind one task's price, in the order a contractor reads it:
 * quantity / production assumption -> baseline -> adjusted -> rate -> price.
 */
export interface LaborDerivation {
  quantity: number;
  unitKey: string | null;
  hoursPerUnit: number | null;
  baselineHours: number;
  multiplier: number;
  adjustedHours: number;
  laborRate: number;
  laborAmount: number;
  isOverridden: boolean;
}

export function explainLaborTask(task: LaborTaskHours): LaborDerivation {
  return {
    quantity: task.quantity,
    unitKey: task.unitKey,
    hoursPerUnit: task.hoursPerUnit,
    baselineHours: task.baselineHours,
    multiplier: task.appliedMultiplier,
    adjustedHours: task.adjustedHours,
    laborRate: task.laborRate,
    laborAmount: task.laborAmount,
    isOverridden: task.isOverridden,
  };
}

/* ------------------------------------------------------------------ *
 * Privacy
 * ------------------------------------------------------------------ */

/** Field names that must never appear in a customer-facing payload. */
export const INTERNAL_LABOR_FIELDS = [
  "baselineHours",
  "adjustedHours",
  "totalHours",
  "hoursPerUnit",
  "productivityMultiplier",
  "appliedMultiplier",
  "laborRate",
  "crewSize",
  "productiveHoursPerDay",
  "workingDays",
  "byTrade",
  "nonInstall",
  "laborPlan",
] as const;

/**
 * Strip every internal labor field from any object before it reaches a
 * proposal, client portal or print view. Dollars may be disclosed by the
 * contractor; HOURS and crew speed are not the customer's business.
 */
export function stripInternalLabor<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripInternalLabor(v)) as unknown as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if ((INTERNAL_LABOR_FIELDS as readonly string[]).includes(key)) continue;
    out[key] = stripInternalLabor(v);
  }
  return out as T;
}

/** True when a payload is safe to hand to a customer document. */
export function containsInternalLabor(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsInternalLabor);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, v]) =>
      (INTERNAL_LABOR_FIELDS as readonly string[]).includes(key) || containsInternalLabor(v),
  );
}

/**
 * Labor-only customer price basis: adjusted hours x labor sell rate. Markup
 * (overhead/profit) is applied ONCE by the pricing layer, never here — this
 * returns raw labor money only.
 */
export function laborOnlySellBasis(plan: LaborPlan): number {
  return plan.laborAmount;
}
