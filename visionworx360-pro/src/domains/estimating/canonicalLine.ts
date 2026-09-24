/**
 * CANONICAL ESTIMATE CALCULATION MODEL.
 *
 * Every surface — preliminary band, economy/recommended/premium variants, the
 * detailed estimate, the proposal, the contractor breakdown — normalizes its
 * lines through this module before any number is shown or stored. One
 * normalization, one set of semantics:
 *
 *   quantity (in its unit)
 *     × material unit cost × (1 + waste%)          -> material cost
 *   setup/mobilization hours + quantity × hours/unit
 *     × crew & productivity modifiers              -> TOTAL labor hours
 *   total labor hours × labor rate                 -> labor cost
 *   + equipment + subcontract + other              -> DIRECT COST
 *
 * Markup (overhead+profit OR target gross margin), contingency and tax are
 * applied ONCE, above the line, by the engine. Nothing in this module marks a
 * line up — a line that already carries markup in its stored cost is a defect
 * this module reports rather than reproduces.
 *
 * The audit here looks for CLASSES OF REASONING ERROR, judged from each line's
 * own provenance and formula. It never uses an arbitrary magnitude threshold:
 * a contractor who types 0.1 hr means 0.1 hr.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */
import { roundQuarterHour } from "./laborTime";
import { minimumTaskHours } from "./taskHourModel";
import type { TaskCostBasis } from "./costBasis";

const EPS = 1e-6;
const round2 = (v: number) => Math.round(num(v) * 100) / 100;
const round4 = (v: number) => Math.round(num(v) * 10000) / 10000;

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

/** Relative tolerance for "these two numbers are the same calculation". */
const MATCH = 0.02;
const close = (a: number, b: number, tolerance = MATCH) =>
  Math.abs(a - b) <= Math.max(Math.abs(b) * tolerance, 0.01);

/* ------------------------------------------------------------------ *
 * Units
 * ------------------------------------------------------------------ */

/** What a quantity in this unit physically measures. */
export type UnitDimension = "area" | "length" | "volume" | "count" | "time" | "weight" | "lump";

export const UNIT_DIMENSION: Record<string, UnitDimension> = {
  square_foot: "area",
  sheet: "area",
  linear_foot: "length",
  board_foot: "length",
  cubic_foot: "volume",
  cubic_yard: "volume",
  gallon: "volume",
  each: "count",
  hour: "time",
  day: "time",
  pound: "weight",
  allowance: "lump",
  lump_sum: "lump",
  other: "lump",
};

export const unitDimension = (unit: string | null | undefined): UnitDimension | null =>
  unit ? (UNIT_DIMENSION[unit] ?? null) : null;

/* ------------------------------------------------------------------ *
 * Reasoning-error classes
 * ------------------------------------------------------------------ */

export type ReasoningCode =
  /* labor */
  | "per_unit_hours_stored_as_total"
  | "hours_not_scaled_by_quantity"
  | "hours_scaled_twice"
  | "setup_hours_double_counted"
  | "setup_hours_missing"
  | "below_minimum_task_time"
  | "labor_cost_disagrees_with_hours"
  | "labor_rate_differs_from_estimate"
  /* quantity & units */
  | "quantity_changed_without_recompute"
  | "quantity_placeholder_treated_as_authority"
  | "unit_mismatch_with_productivity"
  | "unit_missing"
  /* material */
  | "material_cost_disagrees_with_quantity"
  | "waste_applied_inconsistently"
  /* pricing layers */
  | "markup_embedded_in_line_cost"
  | "direct_cost_disagrees_with_components"
  | "contingency_or_tax_applied_at_line"
  /* provenance & freshness */
  | "assumed_value_promoted_to_confirmed"
  | "stale_pricing_after_input_change"
  | "rounded_value_used_as_basis";

export type Severity = "error" | "warning" | "info";

export interface ReasoningFinding {
  lineId: string;
  code: ReasoningCode;
  severity: Severity;
  /** Plain language, contractor-facing. */
  message: string;
  /** True only when this line's own evidence proves the corrected value. */
  isRepairable: boolean;
  field?: string;
  storedValue?: number | string | null;
  expectedValue?: number | string | null;
  /** How the expected value was derived. */
  formula?: string;
}

/* ------------------------------------------------------------------ *
 * Input / output shape
 * ------------------------------------------------------------------ */

/** A stored line exactly as any surface holds it, before normalization. */
export interface RawLine {
  id: string;
  description?: string | null;
  tradeKey?: string | null;

  quantity: number;
  unitKey?: string | null;
  isQuantityPlaceholder?: boolean | null;
  quantityBasis?: string | null;
  quantityReviewedAt?: string | null;
  quantitySourceMeasurementId?: string | null;

  /** Stored TOTAL hours. */
  laborHours?: number | null;
  /** Productivity: hours consumed per unit of measure. */
  laborHoursPerUnit?: number | null;
  /** Mobilization / setup / base time for the task as a whole. */
  laborHoursSetup?: number | null;
  laborHoursBasis?: string | null;
  /** Canonical task cost basis; decides whether the line may carry labor at all. */
  costBasis?: string | null;
  laborHoursConfirmedAt?: string | null;
  /** Unit the productivity rate is expressed in, when the catalog records it. */
  productivityUnitKey?: string | null;
  crewSize?: number | null;
  productivityFactor?: number | null;

  laborRate?: number | null;
  /** Per-unit material cost. */
  materialCost?: number | null;
  wasteFactorPct?: number | null;

  equipmentCost?: number | null;
  subcontractorCost?: number | null;
  otherCost?: number | null;

  /** Stored extended totals, when the row carries them. */
  laborTotal?: number | null;
  materialTotal?: number | null;
  equipmentTotal?: number | null;
  subcontractorTotal?: number | null;
  otherTotal?: number | null;
  directCost?: number | null;

  /** Line-level markup percentages, if the row carries any. */
  overheadPct?: number | null;
  profitPct?: number | null;
  contingencyPct?: number | null;

  pricingSource?: string | null;
  isPriceOverridden?: boolean | null;
  pricedAt?: string | null;
  updatedAt?: string | null;
  /** Anything the pricing bridge recorded, e.g. computedLaborHours. */
  provenance?: Record<string, unknown> | null;
}

/** Estimate-level context every line must be consistent with. */
export interface EstimateContext {
  laborRate?: number | null;
  /** Markup lives above the line. Present here only to detect double-application. */
  pricingMethod?: "target_gross_margin" | "overhead_profit" | null;
  contingencyPct?: number | null;
  taxRatePct?: number | null;
  /** Latest change to scope, measurements or the pricebook. */
  inputsChangedAt?: string | null;
}

export interface CanonicalLine {
  id: string;
  quantity: number;
  unitKey: string | null;
  unitDimension: UnitDimension | null;

  /** Productivity, never a total. */
  hoursPerUnit: number | null;
  setupHours: number;
  crewSize: number;
  productivityFactor: number;
  /** The one true total. */
  totalLaborHours: number;
  /** Where the total came from, in order of authority. */
  laborHoursBasis: "contractor" | "derived_per_unit" | "flat_task" | "unknown";
  laborHoursFormula: string;
  /** Contractor typed or confirmed it; never recomputed. */
  isLaborContractorOwned: boolean;

  laborRate: number;
  laborCost: number;
  materialUnitCost: number;
  wasteFactorPct: number;
  materialCost: number;
  equipmentCost: number;
  subcontractorCost: number;
  otherCost: number;
  directCost: number;

  findings: ReasoningFinding[];
}

/* ------------------------------------------------------------------ *
 * Canonical calculations
 * ------------------------------------------------------------------ */

/** total = (setup + quantity × hours/unit) × productivity, divided by nothing. */
export function canonicalTotalHours(input: {
  quantity: number;
  hoursPerUnit?: number | null;
  setupHours?: number | null;
  productivityFactor?: number | null;
}): number {
  const qty = Math.max(0, num(input.quantity));
  const per = Math.max(0, num(input.hoursPerUnit));
  const setup = Math.max(0, num(input.setupHours));
  const factor = num(input.productivityFactor, 1) || 1;
  /* Quarter-hour invariant: the authoritative total is always on the 15-min grid. */
  return roundQuarterHour((setup + qty * per) * factor);
}

/** material = quantity × unit cost × (1 + waste%). Waste is applied once. */
export function canonicalMaterialCost(input: {
  quantity: number;
  materialUnitCost?: number | null;
  wasteFactorPct?: number | null;
}): number {
  return round2(
    Math.max(0, num(input.quantity)) *
      num(input.materialUnitCost) *
      (1 + Math.max(0, num(input.wasteFactorPct)) / 100),
  );
}

export function canonicalLaborHoursFormula(line: CanonicalLine): string {
  if (line.laborHoursBasis === "contractor") return "contractor-entered total";
  if (line.laborHoursBasis === "flat_task") return `${line.totalLaborHours} hr flat task`;
  const parts: string[] = [];
  if (line.setupHours > 0) parts.push(`${line.setupHours} hr setup`);
  parts.push(`${line.quantity} × ${line.hoursPerUnit ?? 0} hr/${line.unitKey ?? "unit"}`);
  const base = parts.join(" + ");
  return line.productivityFactor === 1 ? base : `(${base}) × ${line.productivityFactor}`;
}

/* ------------------------------------------------------------------ *
 * Normalization + reasoning audit
 * ------------------------------------------------------------------ */

/**
 * Normalizes one stored line into canonical values and reports every class of
 * reasoning error its own evidence exposes.
 *
 * Authority order for total labor hours:
 *   1. contractor-entered / contractor-confirmed  (never recomputed)
 *   2. derivable from productivity + quantity     (recomputed on input change)
 *   3. a recorded computed total from the pricing bridge
 *   4. the stored value, taken as a flat task time
 */
export function normalizeLine(raw: RawLine, ctx: EstimateContext = {}): CanonicalLine {
  const findings: ReasoningFinding[] = [];
  const add = (f: Omit<ReasoningFinding, "lineId">) => findings.push({ lineId: raw.id, ...f });

  const quantity = num(raw.quantity);
  const unitKey = raw.unitKey ?? null;
  const dimension = unitDimension(unitKey);
  const stored = num(raw.laborHours);
  const perUnit = raw.laborHoursPerUnit == null ? null : num(raw.laborHoursPerUnit);
  const setupHours = Math.max(0, num(raw.laborHoursSetup));
  const crewSize = Math.max(1, num(raw.crewSize, 1) || 1);
  const productivityFactor = num(raw.productivityFactor, 1) || 1;
  const computedFromProvenance = num(raw.provenance?.["computedLaborHours"], NaN);

  const contractorOwned =
    raw.laborHoursBasis === "contractor" ||
    raw.laborHoursConfirmedAt != null ||
    raw.pricingSource === "contractor" ||
    raw.isPriceOverridden === true;

  /* ---- units ---- */
  if (!unitKey) {
    add({
      code: "unit_missing",
      severity: "warning",
      message: "This task has no unit of measure, so its quantity cannot be reasoned about.",
      isRepairable: false,
      field: "unitKey",
    });
  } else if (
    raw.productivityUnitKey &&
    raw.productivityUnitKey !== unitKey &&
    unitDimension(raw.productivityUnitKey) !== dimension
  ) {
    add({
      code: "unit_mismatch_with_productivity",
      severity: "error",
      message: `The production rate is per ${raw.productivityUnitKey} but the quantity is in ${unitKey}. The hours cannot be trusted.`,
      isRepairable: false,
      field: "unitKey",
      storedValue: unitKey,
      expectedValue: raw.productivityUnitKey,
    });
  }

  /* ---- total labor hours ---- */
  let totalLaborHours = stored;
  let basis: CanonicalLine["laborHoursBasis"] = "unknown";
  let effectivePerUnit = perUnit;

  if (contractorOwned) {
    basis = "contractor";
    totalLaborHours = roundQuarterHour(stored);
  } else if (perUnit != null && perUnit > 0) {
    basis = "derived_per_unit";
    totalLaborHours = canonicalTotalHours({
      quantity,
      hoursPerUnit: perUnit,
      setupHours,
      productivityFactor,
    });
    if (quantity > 1 && close(stored, perUnit, MATCH) && totalLaborHours > stored) {
      add({
        code: "per_unit_hours_stored_as_total",
        severity: "error",
        message:
          "The stored total is the per-unit production rate — the quantity was never applied.",
        isRepairable: true,
        field: "laborHours",
        storedValue: stored,
        expectedValue: totalLaborHours,
        formula: `${setupHours ? `${setupHours} + ` : ""}${quantity} × ${perUnit}`,
      });
    } else if (quantity > 1 && stored > 0 && close(stored, totalLaborHours * quantity, MATCH)) {
      add({
        code: "hours_scaled_twice",
        severity: "error",
        message: "The quantity appears to have been applied to the hours twice.",
        isRepairable: true,
        field: "laborHours",
        storedValue: stored,
        expectedValue: totalLaborHours,
      });
    } else if (
      stored > 0 &&
      !close(stored, totalLaborHours, MATCH) &&
      Number.isFinite(computedFromProvenance) &&
      close(computedFromProvenance, totalLaborHours, MATCH)
    ) {
      add({
        code: "hours_not_scaled_by_quantity",
        severity: "error",
        message: "The stored hours disagree with the production rate and quantity on this task.",
        isRepairable: true,
        field: "laborHours",
        storedValue: stored,
        expectedValue: totalLaborHours,
      });
    } else if (stored > 0 && !close(stored, totalLaborHours, 0.1)) {
      add({
        code: "hours_not_scaled_by_quantity",
        severity: "warning",
        message:
          "The stored hours do not match this task's production rate and quantity. Confirm which is right.",
        isRepairable: false,
        field: "laborHours",
        storedValue: stored,
        expectedValue: totalLaborHours,
      });
    }
    /* Setup counted inside the rate AND again as base time. */
    if (setupHours > 0 && close(stored, quantity * perUnit + setupHours * 2, MATCH)) {
      add({
        code: "setup_hours_double_counted",
        severity: "warning",
        message: "Setup time looks like it was added twice to this task.",
        isRepairable: false,
        field: "laborHoursSetup",
      });
    }
  } else if (Number.isFinite(computedFromProvenance) && computedFromProvenance > 0) {
    basis = "derived_per_unit";
    totalLaborHours = round4(computedFromProvenance);
    effectivePerUnit = quantity > 0 ? round4(computedFromProvenance / quantity) : null;
    if (quantity > 1 && stored > 0 && close(stored, computedFromProvenance / quantity, MATCH)) {
      add({
        code: "per_unit_hours_stored_as_total",
        severity: "error",
        message:
          "The stored total equals the per-unit rate recorded when this line was priced; the quantity was never applied.",
        isRepairable: true,
        field: "laborHours",
        storedValue: stored,
        expectedValue: round4(computedFromProvenance),
        formula: `${quantity} × ${effectivePerUnit}`,
      });
    }
  } else if (stored > 0) {
    basis = "flat_task";
    totalLaborHours = round4(stored);
    if (quantity > 1 && dimension && dimension !== "count" && dimension !== "lump") {
      add({
        code: "setup_hours_missing",
        severity: "info",
        message:
          "This task carries a flat time with no production rate, so changing the quantity will not change the hours.",
        isRepairable: false,
        field: "laborHoursPerUnit",
      });
    }
  }

  /*
   * MINIMUM PRACTICAL TASK TIME. Unit math can produce an arithmetically valid
   * total that no crew could ever work to — a GFCI in six minutes, a threshold
   * in a quarter hour. The floor is per trade, per unit kind and per task
   * context (see `taskHourModel`); a contractor's own number is never floored.
   */
  if (!contractorOwned && totalLaborHours > 0) {
    const floor = minimumTaskHours({
      costBasis: (raw.costBasis as TaskCostBasis | null) ?? "labor_production",
      tradeKey: raw.tradeKey ?? null,
      unitKey,
      description: raw.description ?? null,
    });
    if (floor.hours > totalLaborHours) {
      add({
        code: "below_minimum_task_time",
        severity: "warning",
        message: `Derived ${totalLaborHours} hr is below the ${floor.hours} hr practical minimum for this work — ${floor.reason}.`,
        isRepairable: true,
        field: "laborHours",
        storedValue: totalLaborHours,
        expectedValue: floor.hours,
      });
      totalLaborHours = roundQuarterHour(floor.hours);
    }
  }

  /* ---- labor cost ----
   * Trade-specific rates are legitimate, so a rate is only suspect when it
   * disagrees with the other lines of the SAME trade (checked at estimate
   * level below), never merely with the estimate's default rate. */
  const laborRate = num(raw.laborRate, num(ctx.laborRate));
  const laborCost = round2(totalLaborHours * laborRate);
  const laborCostFromStored = round2(stored * laborRate);
  if (
    raw.laborTotal != null &&
    !close(num(raw.laborTotal), laborCost) &&
    !close(num(raw.laborTotal), laborCostFromStored)
  ) {
    add({
      code: "labor_cost_disagrees_with_hours",
      severity: "error",
      message: "The stored labor cost does not equal total hours × labor rate.",
      isRepairable: !contractorOwned,
      field: "laborTotal",

      storedValue: num(raw.laborTotal),
      expectedValue: laborCost,
      formula: `${totalLaborHours} hr × ${laborRate}`,
    });
  }

  /* ---- material ---- */
  const materialUnitCost = num(raw.materialCost);
  const wasteFactorPct = Math.max(
    0,
    num(raw.wasteFactorPct ?? (raw.provenance?.["wasteFactorPct"] as number | undefined)),
  );
  const materialCost = canonicalMaterialCost({ quantity, materialUnitCost, wasteFactorPct });
  if (raw.materialTotal != null && !close(num(raw.materialTotal), materialCost)) {
    const unscaled = close(num(raw.materialTotal), materialUnitCost) && quantity > 1;
    add({
      code: unscaled ? "material_cost_disagrees_with_quantity" : "waste_applied_inconsistently",
      severity: "error",
      message: unscaled
        ? "The stored material cost is the per-unit price; the quantity was never applied."
        : "The stored material cost does not equal quantity × unit price × waste.",
      isRepairable: !raw.isPriceOverridden,
      field: "materialTotal",
      storedValue: num(raw.materialTotal),
      expectedValue: materialCost,
      formula: `${quantity} × ${materialUnitCost}${wasteFactorPct ? ` × ${1 + wasteFactorPct / 100}` : ""}`,
    });
  }

  /* ---- other direct costs & the subtotal ---- */
  const equipmentCost = num(raw.equipmentTotal ?? num(raw.equipmentCost) * quantity);
  const subcontractorCost = num(raw.subcontractorTotal ?? num(raw.subcontractorCost) * quantity);
  const otherCost = num(raw.otherTotal ?? num(raw.otherCost) * quantity);
  const directCost = round2(laborCost + materialCost + equipmentCost + subcontractorCost + otherCost);

  if (raw.directCost != null && !close(num(raw.directCost), directCost)) {
    add({
      code: "direct_cost_disagrees_with_components",
      severity: "error",
      message: "The stored direct cost does not equal the sum of its labor, material and other parts.",
      isRepairable: !raw.isPriceOverridden,
      field: "directCost",
      storedValue: num(raw.directCost),
      expectedValue: directCost,
    });
  }

  /* ---- markup must live above the line ---- */
  const lineMarkup = num(raw.overheadPct) + num(raw.profitPct);
  if (ctx.pricingMethod === "target_gross_margin" && lineMarkup > EPS) {
    add({
      code: "markup_embedded_in_line_cost",
      severity: "error",
      message:
        "This task still carries overhead/profit while the estimate prices on target gross margin. The two methods must never both apply.",
      isRepairable: true,
      field: "overheadPct",
      storedValue: lineMarkup,
      expectedValue: 0,
    });
  }
  if (num(raw.contingencyPct) > EPS && num(ctx.contingencyPct) > EPS) {
    add({
      code: "contingency_or_tax_applied_at_line",
      severity: "error",
      message: "Contingency is applied on this task and again on the estimate.",
      isRepairable: true,
      field: "contingencyPct",
      storedValue: num(raw.contingencyPct),
      expectedValue: 0,
    });
  }

  /* ---- provenance & freshness ---- */
  if (raw.isQuantityPlaceholder && raw.quantityReviewedAt == null && quantity > 0) {
    add({
      code: "quantity_placeholder_treated_as_authority",
      severity: "warning",
      message: "This quantity is still a placeholder but is being priced as if confirmed.",
      isRepairable: false,
      field: "quantity",
      storedValue: quantity,
    });
  }
  if (
    (raw.quantityBasis === "assumed" || raw.quantityBasis === "default") &&
    raw.quantityReviewedAt != null &&
    raw.quantitySourceMeasurementId == null
  ) {
    add({
      code: "assumed_value_promoted_to_confirmed",
      severity: "warning",
      message: "An assumed quantity was marked confirmed without a measurement behind it.",
      isRepairable: false,
      field: "quantityBasis",
    });
  }
  if (ctx.inputsChangedAt && raw.pricedAt && raw.pricedAt < ctx.inputsChangedAt) {
    add({
      code: "stale_pricing_after_input_change",
      severity: "warning",
      message: "Scope or measurements changed after this task was last priced.",
      isRepairable: false,
      field: "pricedAt",
      storedValue: raw.pricedAt,
      expectedValue: ctx.inputsChangedAt,
    });
  }
  if (
    !contractorOwned &&
    perUnit != null &&
    perUnit > 0 &&
    quantity > 1 &&
    close(quantity, Math.round(quantity), 0) === false &&
    Number.isInteger(num(raw.laborHours)) &&
    num(raw.laborHours) > 0 &&
    !close(stored, totalLaborHours, 0.02)
  ) {
    add({
      code: "rounded_value_used_as_basis",
      severity: "info",
      message: "A rounded display value looks like it was stored as the calculation basis.",
      isRepairable: false,
      field: "laborHours",
      storedValue: stored,
      expectedValue: totalLaborHours,
    });
  }

  const canonical: CanonicalLine = {
    id: raw.id,
    quantity,
    unitKey,
    unitDimension: dimension,
    hoursPerUnit: effectivePerUnit,
    setupHours,
    crewSize,
    productivityFactor,
    totalLaborHours,
    laborHoursBasis: basis,
    laborHoursFormula: "",
    isLaborContractorOwned: contractorOwned,
    laborRate,
    laborCost,
    materialUnitCost,
    wasteFactorPct,
    materialCost,
    equipmentCost,
    subcontractorCost,
    otherCost,
    directCost,
    findings,
  };
  canonical.laborHoursFormula = canonicalLaborHoursFormula(canonical);
  return canonical;
}

/**
 * Recomputes a line after its quantity or productivity changed. Contractor
 * totals survive; derived totals follow their inputs. This is what makes
 * "quantity later changed without recomputation" impossible going forward.
 */
export function recomputeForQuantity(raw: RawLine, quantity: number, ctx: EstimateContext = {}) {
  return normalizeLine({ ...raw, quantity, laborTotal: null, materialTotal: null, directCost: null }, ctx);
}

/* ------------------------------------------------------------------ *
 * Estimate-level audit
 * ------------------------------------------------------------------ */

export interface EstimateReasoningAudit {
  lines: CanonicalLine[];
  findings: ReasoningFinding[];
  totals: { directCost: number; laborHours: number; laborCost: number; materialCost: number };
  counts: { errors: number; warnings: number; repairable: number };
}

export function auditEstimateReasoning(
  rawLines: RawLine[],
  ctx: EstimateContext = {},
): EstimateReasoningAudit {
  const lines = rawLines.map((l) => normalizeLine(l, ctx));

  /* Trade-level rate consistency: a trade may have its own rate, but two lines
   * of the SAME trade priced at different rates is a reasoning error. */
  const byTrade = new Map<string, { rates: Map<number, number>; ids: Map<string, number> }>();
  rawLines.forEach((raw, i) => {
    const trade = raw.tradeKey ?? "";
    const rate = num(lines[i]!.laborRate);
    if (!trade || rate <= 0) return;
    const bucket = byTrade.get(trade) ?? { rates: new Map(), ids: new Map() };
    bucket.rates.set(rate, (bucket.rates.get(rate) ?? 0) + 1);
    bucket.ids.set(raw.id, rate);
    byTrade.set(trade, bucket);
  });
  for (const [trade, bucket] of byTrade) {
    if (bucket.rates.size < 2) continue;
    const [dominant] = [...bucket.rates.entries()].sort((a, b) => b[1] - a[1])[0]!;
    for (const [id, rate] of bucket.ids) {
      if (close(rate, dominant, 0.001)) continue;
      const line = lines.find((l) => l.id === id)!;
      if (line.isLaborContractorOwned) continue;
      line.findings.push({
        lineId: id,
        code: "labor_rate_differs_from_estimate",
        severity: "warning",
        message: `This ${trade} task is priced at a different labor rate than the other ${trade} tasks.`,
        isRepairable: false,
        field: "laborRate",
        storedValue: rate,
        expectedValue: dominant,
      });
    }
  }

  const findings = lines.flatMap((l) => l.findings);
  return {
    lines,
    findings,
    totals: {
      directCost: round2(lines.reduce((s, l) => s + l.directCost, 0)),
      laborHours: round4(lines.reduce((s, l) => s + l.totalLaborHours, 0)),
      laborCost: round2(lines.reduce((s, l) => s + l.laborCost, 0)),
      materialCost: round2(lines.reduce((s, l) => s + l.materialCost, 0)),
    },
    counts: {
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
      repairable: findings.filter((f) => f.isRepairable).length,
    },
  };
}

/**
 * Compares the preliminary scope with the detailed scope so aggregation,
 * dedup or supersession can never quietly change what is being sold.
 */
export function diffScopeSets(
  preliminary: { key: string; quantity: number; unitKey?: string | null }[],
  detailed: { key: string; quantity: number; unitKey?: string | null }[],
): { code: "added" | "removed" | "quantity_changed" | "unit_changed"; key: string; from?: number | string | null; to?: number | string | null }[] {
  const byKey = (rows: typeof preliminary) => new Map(rows.map((r) => [r.key, r]));
  const a = byKey(preliminary);
  const b = byKey(detailed);
  const out: ReturnType<typeof diffScopeSets> = [];
  for (const [key, prelim] of a) {
    const det = b.get(key);
    if (!det) {
      out.push({ code: "removed", key, from: prelim.quantity });
      continue;
    }
    if (!close(det.quantity, prelim.quantity, 0.001)) {
      out.push({ code: "quantity_changed", key, from: prelim.quantity, to: det.quantity });
    }
    if ((prelim.unitKey ?? null) !== (det.unitKey ?? null)) {
      out.push({ code: "unit_changed", key, from: prelim.unitKey, to: det.unitKey });
    }
  }
  for (const [key, det] of b) if (!a.has(key)) out.push({ code: "added", key, to: det.quantity });
  return out;
}
