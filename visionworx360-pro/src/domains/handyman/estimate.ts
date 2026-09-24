/**
 * SMALL-JOB / PUNCH-LIST ESTIMATE ROLL-UP.
 *
 * Money rules that make small work behave like real small work:
 *
 *  - Each task is priced independently, at its own unit, from the pricing
 *    source layer. A task no source can price is `pricing needed`; it does not
 *    contribute $0 and it does not get absorbed by an unrelated line.
 *  - Mobilization, setup and cleanup are VISIT costs, applied exactly once,
 *    no matter how many punch-list items share the trip.
 *  - The service minimum is a floor on the visit, not a per-line adder, and
 *    every value in it is contractor-configurable.
 *  - Markup / overhead / profit stay where they already live: this module
 *    returns cost + labor so the existing estimating engine applies the
 *    organization's own uplift.
 *
 * Pure module — no React, no Supabase, no IO.
 */

import {
  MINIMUM_LABOR_HOURS,
  MOBILIZATION_FEE,
  SETUP_CLEANUP_HOURS,
} from "@/domains/ballpark/smallJob";
import { selectHandymanQuestions } from "./questions";
import { defaultPricingSources, resolveTaskRate } from "./sources";
import { getHandymanTask } from "./tasks";
import type {
  PunchListEstimate,
  PricingSource,
  ServiceMinimumConfig,
  TaskInstance,
  TaskLine,
} from "./types";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** Defaults mirror the existing small-job economics; contractors override them. */
export const DEFAULT_SERVICE_MINIMUMS: ServiceMinimumConfig = {
  mobilizationFee: MOBILIZATION_FEE,
  setupCleanupHours: SETUP_CLEANUP_HOURS,
  minimumLaborHours: MINIMUM_LABOR_HOURS,
  minimumCharge: null,
  applyPerVisit: true,
};

export interface PunchListOptions {
  laborRate: number;
  sources?: readonly PricingSource[];
  minimums?: Partial<ServiceMinimumConfig>;
  market?: string | null;
  answeredQuestionIds?: readonly string[];
  questionBudget?: number;
}

export function priceTaskLine(
  instance: TaskInstance,
  options: { laborRate: number; sources: readonly PricingSource[]; market?: string | null },
): TaskLine {
  const task = getHandymanTask(instance.taskId);
  const quantity = Math.max(0, Number(instance.quantity) || 0);
  const label = task?.label ?? {
    "en-US": instance.sourceText,
    "es-US": instance.sourceText,
  };
  const base: TaskLine = {
    taskId: instance.taskId,
    label,
    sourceText: instance.sourceText,
    quantity,
    unit: instance.unit ?? task?.unit ?? null,
    laborHours: 0,
    laborCost: 0,
    materialCost: 0,
    subtotal: 0,
    pricingNeeded: true,
    companions: task?.companions ?? [],
  };

  const resolution = resolveTaskRate(instance.taskId, options.sources, {
    market: options.market ?? null,
  });
  if (!resolution.rate) {
    return { ...base, pricingNeededReason: resolution.reason ?? "no_source_rate" };
  }

  const rate = resolution.rate;
  const rawHours = rate.laborHoursPerUnit * quantity;
  const minHours = task?.minLaborHours ?? 0;
  /* Minimum labor is per OCCURRENCE, so 4 switches is 4 x the per-unit floor. */
  const occurrences = task?.unit === "each" ? Math.max(1, quantity) : 1;
  const laborHours = round2(Math.max(rawHours, minHours * occurrences));
  const laborCost = round2(laborHours * Math.max(0, options.laborRate));
  const materialCost = round2(rate.materialCostPerUnit * quantity + (rate.flatAmount ?? 0));

  return {
    ...base,
    laborHours,
    laborCost,
    materialCost,
    subtotal: round2(laborCost + materialCost),
    pricingNeeded: false,
    provenance: rate.provenance,
  };
}

/**
 * Roll independent tasks into ONE visit estimate. Mobilization applies once.
 */
export function buildPunchListEstimate(
  instances: readonly TaskInstance[],
  options: PunchListOptions,
): PunchListEstimate {
  const minimums: ServiceMinimumConfig = { ...DEFAULT_SERVICE_MINIMUMS, ...(options.minimums ?? {}) };
  const sources = options.sources ?? defaultPricingSources();
  const laborRate = Math.max(0, Number(options.laborRate) || 0);

  const lines = instances.map((instance) =>
    priceTaskLine(instance, { laborRate, sources, market: options.market ?? null }),
  );

  const laborHours = round2(lines.reduce((sum, l) => sum + l.laborHours, 0));
  const laborCost = round2(lines.reduce((sum, l) => sum + l.laborCost, 0));
  const materialCost = round2(lines.reduce((sum, l) => sum + l.materialCost, 0));

  const visitApplies = minimums.applyPerVisit && lines.length > 0;
  const mobilization = visitApplies ? round2(minimums.mobilizationFee) : 0;
  const setupCleanupCost = visitApplies ? round2(minimums.setupCleanupHours * laborRate) : 0;

  const subtotal = round2(laborCost + materialCost + mobilization + setupCleanupCost);
  const derivedMinimum = round2(minimums.minimumLaborHours * laborRate + minimums.mobilizationFee);
  const minimumCharge = visitApplies
    ? round2(minimums.minimumCharge ?? derivedMinimum)
    : 0;

  const pricingNeededCount = lines.filter((l) => l.pricingNeeded && l.taskId).length;
  const unrecognizedCount = lines.filter((l) => !l.taskId).length;

  return {
    lines,
    mobilization,
    setupCleanupCost,
    laborHours,
    laborCost,
    materialCost,
    subtotal,
    minimumCharge,
    /* The floor never applies while work is still unpriced — that total is not real yet. */
    total: pricingNeededCount || unrecognizedCount ? subtotal : round2(Math.max(subtotal, minimumCharge)),
    pricingNeededCount,
    unrecognizedCount,
    questionIds: selectHandymanQuestions(instances, {
      answered: options.answeredQuestionIds,
      budget: options.questionBudget,
    }),
  };
}
