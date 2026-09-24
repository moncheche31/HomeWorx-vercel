/**
 * CANONICAL TASK-HOUR MODEL.
 *
 * One path, for every trade, mode and project:
 *
 *   scope task + trade + quantity/unit + productivity source
 *     -> raw labor requirement (full precision)
 *     -> minimum practical task time (task/trade/context aware)
 *     -> quarter-hour normalization
 *     -> labor dollars
 *
 * The rules this module makes non-negotiable:
 *
 * 1. CONVENTIONS ARE EXPLICIT. A productivity number arrives labelled
 *    `hours_per_unit`, `units_per_hour` or `total_hours` (see `productivity`).
 *    There is no "if it looks small it must be per unit" fallback anywhere.
 * 2. FEES ARE NOT WORK. A permit/fee/other-direct-cost line carries zero
 *    production labor unless administrative labor is modelled as its own task.
 * 3. NO INVENTED TINY TOTALS. A measured task whose quantity is a placeholder,
 *    or a task with no productivity source at all, returns ZERO hours and
 *    `needsReview` — never a defensible-looking 0.25 hr.
 * 4. REAL WORK TAKES REAL TIME. A task that survives the math still cannot
 *    land below the practical minimum for that kind of work: an electrician
 *    does not set a GFCI in six minutes. The minimum is per trade, per unit
 *    kind and per task context — there is deliberately NO single global floor.
 * 5. THE CONTRACTOR WINS. A contractor-entered total is authoritative; the
 *    only thing done to it is quarter-hour normalization.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import { isFeeBasis, isLaborBearingBasis, isProductionBasis, type TaskCostBasis } from "./costBasis";
import { roundQuarterHour } from "./laborTime";
import { deriveLaborHours, type ProductivityConvention, type ProductivityRate } from "./productivity";
import type { LaborTradeKey } from "./tradeTaxonomy";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round4 = (v: number) => Math.round(num(v) * 10000) / 10000;

/* ------------------------------------------------------------------ *
 * Minimum practical task time
 * ------------------------------------------------------------------ */

/** Units whose quantity is a COUNT of things, not a measured size. */
const COUNT_UNITS = new Set(["each", "sheet", "gallon", "pound"]);

/**
 * Per-trade practical minimums, in hours.
 *
 * `count` applies to a single-item task ("install a GFCI", "set a toilet") —
 * the realistic floor for showing up at that item, positioning, fastening,
 * connecting, testing and cleaning up after it.
 *
 * `measured` applies to an area/length task and is much smaller: it is the
 * floor for touching a measured surface at all, not a service-call minimum.
 * Job-level mobilization and travel live in job economics and are NOT added
 * here, so nothing is double counted.
 */
interface TradeMinimums {
  count: number;
  measured: number;
}

const TRADE_MINIMUMS: Record<string, TradeMinimums> = {
  general_conditions: { count: 0.5, measured: 0.25 },
  demolition: { count: 0.5, measured: 0.5 },
  sitework_concrete: { count: 1, measured: 1 },
  framing: { count: 0.75, measured: 0.5 },
  roofing: { count: 1, measured: 1 },
  exterior: { count: 1, measured: 0.5 },
  plumbing: { count: 1, measured: 0.5 },
  electrical: { count: 0.5, measured: 0.5 },
  hvac: { count: 1.5, measured: 0.5 },
  insulation: { count: 0.5, measured: 0.5 },
  drywall: { count: 0.5, measured: 0.5 },
  finish_carpentry: { count: 0.5, measured: 0.5 },
  flooring: { count: 0.5, measured: 0.5 },
  tile: { count: 1, measured: 1 },
  painting: { count: 0.5, measured: 0.5 },
  specialty: { count: 0.5, measured: 0.5 },
  unassigned: { count: 0.5, measured: 0.25 },
};

const DEFAULT_MINIMUMS: TradeMinimums = { count: 0.5, measured: 0.25 };

/**
 * Context overrides. A trade floor is a blunt instrument; some tasks inside a
 * trade are meaningfully bigger than the trade's smallest job. First match
 * wins, so heavier work is listed before lighter work.
 */
const CONTEXT_MINIMUMS: Array<[readonly string[], number]> = [
  [["water heater", "boiler", "furnace", "air handler", "condenser", "mini split", "mini-split"], 4],
  [["service panel", "load center", "subpanel", "sub-panel", "panel upgrade", "meter"], 4],
  [["lvl", "header", "beam", "post ", "posts", "column", "girder", "bearing wall"], 2],
  [["tub", "bathtub", "shower pan", "shower base", "vanity", "toilet", "sink", "fixture set"], 1.5],
  [["new circuit", "circuit", "home run", "dedicated line"], 1.5],
  [["exterior door", "entry door", "patio door", "slider", "window unit", "egress"], 2],
  [["interior door", "prehung", "pre-hung", "door slab"], 1],
  [["rough-in", "rough in", "roughin"], 2],
  [["waterproof", "shower niche", "curb"], 1],
  [["relocat", "reroute", "re-route", "move "], 1],
  [["appliance", "disposal", "dishwasher", "range hood", "exhaust fan"], 1],
  [["gfci", "afci", "outlet", "receptacle", "switch", "device", "dimmer", "thermostat"], 0.5],
  [["shutoff", "shut-off", "supply line", "angle stop", "trim out", "trim-out"], 0.5],
  [["transition", "threshold", "patch", "touch up", "touch-up", "blend"], 0.5],
];

export interface MinimumTaskTime {
  hours: number;
  /** Why this floor applies — shown in the audit trail. */
  reason: string;
}

/**
 * The practical minimum for one task. Zero when the basis carries no
 * production labor at all.
 */
export function minimumTaskHours(input: {
  costBasis: TaskCostBasis;
  tradeKey?: LaborTradeKey | string | null;
  unitKey?: string | null;
  description?: string | null;
}): MinimumTaskTime {
  if (!isLaborBearingBasis(input.costBasis)) return { hours: 0, reason: "no production labor on this basis" };

  const text = (input.description ?? "").toLowerCase();
  for (const [keywords, hours] of CONTEXT_MINIMUMS) {
    if (keywords.some((k) => text.includes(k))) {
      return { hours, reason: `task context minimum (${keywords[0]})` };
    }
  }

  const trade = TRADE_MINIMUMS[String(input.tradeKey ?? "")] ?? DEFAULT_MINIMUMS;
  const unit = String(input.unitKey ?? "");
  if (!unit || COUNT_UNITS.has(unit) || unit === "lump_sum" || unit === "allowance") {
    return { hours: trade.count, reason: "single-item task minimum for this trade" };
  }
  return { hours: trade.measured, reason: "measured task minimum for this trade" };
}

/* ------------------------------------------------------------------ *
 * Derivation
 * ------------------------------------------------------------------ */

export type TaskHourSource =
  | "contractor"
  | "catalog_production"
  | "flat_task"
  | "fee_no_labor"
  | "insufficient_evidence";

export interface TaskHourInput {
  costBasis: TaskCostBasis;
  quantity: number;
  unitKey?: string | null;
  tradeKey?: LaborTradeKey | string | null;
  description?: string | null;
  /** Explicit productivity source. Absent means "we have no rate", not "assume one". */
  rate?: ProductivityRate | null;
  /** Task-level setup/layout/protection time the task model calls for. */
  setupHours?: number | null;
  /** Company/estimate productivity factor. Never rounded — it scales raw hours. */
  productivityMultiplier?: number | null;
  /** Contractor-entered authoritative total. */
  contractorHours?: number | null;
  /** Quantity did not come from evidence — a measured task cannot price off it. */
  isQuantityPlaceholder?: boolean;
  quantityBasis?: string | null;
}

export interface TaskHourResult {
  /** Authoritative hours to persist and to price labor from. */
  hours: number;
  /** Full-precision requirement before the floor and the quarter-hour grid. */
  rawHours: number;
  minimumHours: number;
  minimumApplied: boolean;
  source: TaskHourSource;
  convention: ProductivityConvention | "none";
  hoursPerUnit: number | null;
  setupHours: number;
  formula: string;
  needsReview: boolean;
  reviewReason: string | null;
}

const MEASURED_UNITS = new Set([
  "square_foot",
  "square_yard",
  "linear_foot",
  "board_foot",
  "cubic_foot",
  "cubic_yard",
  "square",
]);

const EVIDENCE_BASES = new Set(["measurement", "geometry_derived", "contractor_entered"]);

/** True when the quantity is a real measurement rather than a stand-in 1. */
export function hasQuantityEvidence(input: {
  quantity: number;
  unitKey?: string | null;
  quantityBasis?: string | null;
  isQuantityPlaceholder?: boolean;
}): boolean {
  if (input.isQuantityPlaceholder) return false;
  const qty = num(input.quantity);
  if (qty <= 0) return false;
  if (!MEASURED_UNITS.has(String(input.unitKey ?? ""))) return true;
  if (input.quantityBasis && EVIDENCE_BASES.has(input.quantityBasis)) return true;
  /* A measured unit sitting at exactly 1 is the classic placeholder tell. */
  return qty !== 1;
}

/** THE canonical task-hour derivation. Every write path must go through it. */
export function deriveTaskHours(input: TaskHourInput): TaskHourResult {
  const quantity = num(input.quantity);
  const minimum = minimumTaskHours(input);

  const shell = {
    minimumHours: minimum.hours,
    minimumApplied: false,
    hoursPerUnit: null as number | null,
    setupHours: 0,
  };

  /* 1. Fees and other non-labor bases. */
  if (isFeeBasis(input.costBasis) || !isLaborBearingBasis(input.costBasis)) {
    return {
      ...shell,
      hours: 0,
      rawHours: 0,
      minimumHours: 0,
      source: "fee_no_labor",
      convention: "none",
      formula: "no production labor on this cost basis",
      needsReview: false,
      reviewReason: null,
    };
  }

  /* 2. The contractor's own number. Normalized, never re-derived. */
  const typed = input.contractorHours;
  if (typed != null && Number.isFinite(typed) && num(typed) > 0) {
    const hours = roundQuarterHour(typed);
    return {
      ...shell,
      hours,
      rawHours: round4(num(typed)),
      minimumApplied: false,
      source: "contractor",
      convention: "none",
      formula: "contractor-entered total",
      needsReview: false,
      reviewReason: null,
    };
  }

  const rate = input.rate && num(input.rate.value) > 0 ? input.rate : null;

  /* 3. No productivity source at all — say so, do not invent one. */
  if (!rate) {
    return {
      ...shell,
      hours: 0,
      rawHours: 0,
      source: "insufficient_evidence",
      convention: "none",
      formula: "no productivity source for this task",
      needsReview: true,
      reviewReason: "no_productivity_source",
    };
  }

  /* 4. Quantity-driven work needs a real quantity. */
  const quantityDriven = rate.convention !== "total_hours" && isProductionBasis(input.costBasis);
  if (quantityDriven && !hasQuantityEvidence({ ...input, quantity })) {
    return {
      ...shell,
      hours: 0,
      rawHours: 0,
      hoursPerUnit: round4(num(rate.value)),
      source: "insufficient_evidence",
      convention: rate.convention,
      formula: "measured task without a measured quantity",
      needsReview: true,
      reviewReason: "quantity_not_established",
    };
  }

  const derived = deriveLaborHours({
    rate,
    quantity,
    setupHours: num(input.setupHours),
    productivityMultiplier: num(input.productivityMultiplier) || 1,
  });

  const raw = round4(derived.totalHours);
  const floored = Math.max(raw, minimum.hours);
  const hours = roundQuarterHour(floored);

  return {
    hours,
    rawHours: raw,
    minimumHours: minimum.hours,
    minimumApplied: floored > raw,
    source: rate.convention === "total_hours" ? "flat_task" : "catalog_production",
    convention: derived.convention,
    hoursPerUnit: derived.hoursPerUnit,
    setupHours: derived.setupHours,
    formula:
      floored > raw
        ? `${derived.formula} = ${raw} hr, raised to ${minimum.hours} hr — ${minimum.reason}`
        : derived.formula,
    needsReview: false,
    reviewReason: null,
  };
}
