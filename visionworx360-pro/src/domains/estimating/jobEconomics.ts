/**
 * Job economics — the fixed costs a unit price never sees.
 *
 * A door swap is not "1/40th of a kitchen". Small work carries mobilization,
 * setup/protection, cleanup/disposal and invoicing, plus a service-call
 * minimum below which no shop shows up at all.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * These economics used to be applied as a lift on the ballpark BAND only
 * (`src/domains/ballpark/smallJob.ts`). The detailed estimate — priced from
 * the same engine but from stored line items — never saw them, so for every
 * job under the threshold the preliminary recommended value and the final
 * selling price disagreed by a structural amount that no scope change could
 * explain. The band lift also hard-coded its markup as `overhead + profit`,
 * which is zero under a target-gross-margin method, so margin-priced small
 * jobs carried their fixed costs at cost.
 *
 * The fix is to express job economics as ordinary ENGINE COST LINES. The one
 * canonical engine then applies whichever pricing method is in force, exactly
 * once, and preliminary and final reconcile by construction.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import { calculateEngineEstimate } from "./engine/calculate";
import { roundMoney as money } from "./money";
import type {
  EngineLineInput,
  EstimateEngineConfig,
  EstimateEngineResult,
} from "./engine/types";

/** Above this selling price the job carries its own overhead; no adders. */
export const SMALL_JOB_THRESHOLD = 3500;

/** Trip / mobilization: truck, drive time, materials run, invoicing. */
export const MOBILIZATION_COST = 95;

/** Setup, floor protection, cleanup and disposal on any small job. */
export const SETUP_CLEANUP_HOURS = 1;

/** No skilled trade shows up for less than this many billable hours. */
export const MINIMUM_LABOR_HOURS = 2;

/** Stable synthetic line ids, so re-running is idempotent. */
export const JOB_ECONOMICS_LINE_IDS = {
  mobilization: "__job_economics_mobilization",
  setupCleanup: "__job_economics_setup_cleanup",
  minimum: "__job_economics_minimum",
} as const;

const ECONOMICS_IDS = new Set<string>(Object.values(JOB_ECONOMICS_LINE_IDS));

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** True for a synthetic job-economics line, so callers never persist or double-add one. */
export function isJobEconomicsLine(line: { id: string }): boolean {
  return ECONOMICS_IDS.has(line.id);
}

/** Drop any previously appended economics lines. Always call before re-applying. */
export function stripJobEconomicsLines<T extends { id: string }>(lines: T[]): T[] {
  return lines.filter((line) => !isJobEconomicsLine(line));
}

export interface JobEconomicsAdjustment {
  /** i18n key under the `estimating` namespace. */
  key: "mobilization" | "setupCleanup" | "serviceCallMinimum";
  /** Cost added to the estimate, before the pricing method marks it up. */
  cost: number;
}

export interface JobEconomicsOptions {
  /** Crew labor rate used for the setup/cleanup hour and the minimum. */
  laborRate: number;
  /** Selling price below which the economics apply. */
  threshold?: number;
  /** Set false to price bare unit costs (comparisons, audits, tests). */
  enabled?: boolean;
}

export interface JobEconomicsResult {
  /** The priced lines, with economics appended when they apply. */
  lines: EngineLineInput[];
  /** Engine roll-up for `lines` — the canonical cost model for this job. */
  engine: EstimateEngineResult;
  isSmallJob: boolean;
  adjustments: JobEconomicsAdjustment[];
}

function economicsLine(
  id: string,
  cost: number,
  template: EngineLineInput | undefined,
): EngineLineInput {
  return {
    id,
    description: id,
    groupLabel: null,
    quantity: 1,
    unitKey: "lump_sum",
    laborHours: 0,
    laborRate: 0,
    materialCost: 0,
    equipmentCost: 0,
    subcontractorCost: 0,
    otherCost: money(cost),
    /*
     * Fixed costs are marked up exactly like the work they accompany: the
     * percentages come from a real priced line, and under a target gross
     * margin those percentages are already zero and the margin is applied
     * once, at the job level, by the engine.
     */
    overheadPct: num(template?.overheadPct),
    profitPct: num(template?.profitPct),
    contingencyPct: num(template?.contingencyPct),
    isTaxable: false,
  };
}

/**
 * Price `lines` through the canonical engine, adding small-job economics when
 * the resulting selling price falls below the threshold.
 *
 * Deterministic and idempotent: previously appended economics lines are
 * stripped first, so calling this twice yields the same numbers.
 */
export function withJobEconomics(
  rawLines: EngineLineInput[],
  config: EstimateEngineConfig,
  options: JobEconomicsOptions,
): JobEconomicsResult {
  const lines = stripJobEconomicsLines(rawLines);
  const base = calculateEngineEstimate(lines, config);

  const threshold = options.threshold ?? SMALL_JOB_THRESHOLD;
  const baseTotal = base.totals.grandTotal;
  if (options.enabled === false || baseTotal <= 0 || baseTotal >= threshold) {
    return { lines, engine: base, isSmallJob: false, adjustments: [] };
  }

  const rate = Math.max(0, num(options.laborRate));
  const template = lines[0];
  const mobilization = money(MOBILIZATION_COST);
  const setup = money(rate * SETUP_CLEANUP_HOURS);

  const withAdders = [
    ...lines,
    economicsLine(JOB_ECONOMICS_LINE_IDS.mobilization, mobilization, template),
    economicsLine(JOB_ECONOMICS_LINE_IDS.setupCleanup, setup, template),
  ];
  const lifted = calculateEngineEstimate(withAdders, config);

  /*
   * Service-call minimum. It is a SELLING price floor, so the top-up is
   * expressed as the cost that, once the pricing method marks it up, closes
   * the gap. The engine is linear in cost, so the implied factor from the
   * roll-up we just computed converts exactly.
   */
  const minimumCost = money(rate * MINIMUM_LABOR_HOURS + MOBILIZATION_COST);
  const factor =
    lifted.totals.jobCost > 0 ? lifted.totals.grandTotal / lifted.totals.jobCost : 1;
  const minimumSell = money(minimumCost * factor);

  const adjustments: JobEconomicsAdjustment[] = [
    { key: "mobilization", cost: mobilization },
    { key: "setupCleanup", cost: setup },
  ];

  if (lifted.totals.grandTotal >= minimumSell) {
    return { lines: withAdders, engine: lifted, isSmallJob: true, adjustments };
  }

  const topUpCost = money((minimumSell - lifted.totals.grandTotal) / (factor || 1));
  const finalLines = [
    ...withAdders,
    economicsLine(JOB_ECONOMICS_LINE_IDS.minimum, topUpCost, template),
  ];
  return {
    lines: finalLines,
    engine: calculateEngineEstimate(finalLines, config),
    isSmallJob: true,
    adjustments: [...adjustments, { key: "serviceCallMinimum", cost: topUpCost }],
  };
}
