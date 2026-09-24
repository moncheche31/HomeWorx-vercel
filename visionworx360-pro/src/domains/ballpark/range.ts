/**
 * Ballpark range: derived quantities → priced band.
 *
 * Layered on the Module 008 engine through the existing Range Engine — no cost
 * math is re-implemented here. The only thing this file adds is honesty:
 * unknown answers widen the band and lower the stated confidence instead of
 * producing a falsely tight number.
 */

import {
  buildEstimateRange,
  normalizeAssumptions,
  roundBand,
  type EngineLineInput,
  type EstimateEngineConfig,
  type PricingStrategy,
} from "@/domains/estimating";
import {
  normalizePricingMode,
  OWNER_SUPPLIED_HANDLING_PCT,
  type PricingMode,
} from "@/domains/estimating";
import { deriveBallpark } from "./derive";
import { withJobEconomics } from "@/domains/estimating/jobEconomics";
import { finalizeBallparkBand, type BallparkEvidence } from "./plausibility";
import { SAMPLE_PRICEBOOK, withLaborRate } from "./pricebook";
import type {
  BallparkAnswers,
  BallparkInterviewSchema,
  BallparkConfidence,
  BallparkDerived,
  BallparkPricebook,
  BallparkResult,
} from "./types";

/** Total extra widening never exceeds this, no matter how many unknowns. */
export const MAX_UNKNOWN_WIDEN_PCT = 30;

/** Finish level shifts material cost; it is not a separate scope item. */
export const FINISH_FACTOR: Record<string, number> = {
  basic: 0.85,
  standard: 1,
  premium: 1.3,
};

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** Sum of unknown penalties, capped. Deterministic. */
export function unknownWidenPct(derived: BallparkDerived): number {
  const total = derived.unknowns.reduce((sum, u) => sum + Math.max(0, u.widenPct), 0);
  return Math.min(MAX_UNKNOWN_WIDEN_PCT, round2(total));
}

/** Fewer unknowns ⇒ more confidence. Thresholds are the documented rule. */
export function confidenceFor(widenPct: number, hasDimensions: boolean): BallparkConfidence {
  if (!hasDimensions) return "low";
  if (widenPct <= 8) return "high";
  if (widenPct <= 20) return "medium";
  return "low";
}

/** Turn ballpark quantities into engine lines using a replaceable pricebook. */
export function buildBallparkLines(
  derived: BallparkDerived,
  answers: BallparkAnswers,
  pricebook: BallparkPricebook,
  defaults: { overheadPct: number; profitPct: number; contingencyPct: number },
): EngineLineInput[] {
  const finish = String(answers.finishLevel?.value ?? "standard");
  const finishFactor = FINISH_FACTOR[finish] ?? 1;

  return derived.quantities.flatMap((q) => {
    const price = pricebook.get(q.itemKey);
    if (!price) return [];
    return [
      {
        id: q.itemKey,
        description: q.labelKey,
        groupLabel: q.groupKey,
        quantity: q.quantity,
        unitKey: q.unitKey,
        laborHoursPerUnit: price.laborHoursPerUnit,
        laborHours: null,
        crewSize: 1,
        laborRate: pricebook.laborRate,
        materialCost: round2(price.materialCostPerUnit * finishFactor),
        equipmentCost: 0,
        subcontractorCost: price.subcontractorCostPerUnit ?? 0,
        otherCost: 0,
        wasteFactorPct: 0,
        overheadPct: defaults.overheadPct,
        profitPct: defaults.profitPct,
        contingencyPct: defaults.contingencyPct,
        isTaxable: false,
      } satisfies EngineLineInput,
    ];
  });
}

export interface BallparkRangeOptions {
  currency?: string;
  taxRatePct?: number;
  laborRate?: number | null;
  overheadPct?: number;
  profitPct?: number;
  contingencyPct?: number;
  pricebook?: BallparkPricebook;
  /**
   * How the job is being sold. Defaults to `total`. `labor_only` removes
   * material SELL money while keeping every material-driven labor implication
   * (handling, prep, disposal) — see `domains/estimating/pricingModes`.
   */
  pricingMode?: PricingMode;
  /** Pricing METHOD (target gross margin vs overhead + profit). */
  pricingStrategy?: PricingStrategy;
  /** Apply small-job mobilization / service-call economics. Default true. */
  smallJobEconomics?: boolean;
  /** Scope-aware interview schema; drives which inputs are asked/assumed. */
  schema?: BallparkInterviewSchema;
}

/**
 * Labor-only pricing of ballpark lines: material sell money comes off, and the
 * disclosed handling labor for owner-supplied material goes on. Quantities,
 * scope and assemblies are untouched — the engine still knows the full scope.
 */
function applyPricingModeToLines(
  lines: EngineLineInput[],
  mode: PricingMode,
): EngineLineInput[] {
  if (mode !== "labor_only") return lines;
  const handling = 1 + OWNER_SUPPLIED_HANDLING_PCT / 100;
  return lines.map((line) => ({
    ...line,
    materialCost: 0,
    laborHoursPerUnit:
      line.laborHoursPerUnit == null
        ? line.laborHoursPerUnit
        : round2(line.laborHoursPerUnit * handling),
    laborHours: line.laborHours == null ? line.laborHours : round2(line.laborHours * handling),
  }));
}

/**
 * The whole pipeline: answers → geometry → quantities → priced band.
 * Pure and idempotent — calling it twice with the same answers returns the
 * same numbers and never accumulates scope.
 */
export function buildBallpark(
  answers: BallparkAnswers,
  options: BallparkRangeOptions = {},
): BallparkResult {
  const derived = deriveBallpark(answers, options.schema);
  const pricebook = withLaborRate(options.pricebook ?? SAMPLE_PRICEBOOK, options.laborRate ?? null);
  const pricingMode = normalizePricingMode(options.pricingMode);

  const defaults = {
    overheadPct: options.overheadPct ?? 10,
    profitPct: options.profitPct ?? 10,
    contingencyPct: options.contingencyPct ?? 0,
  };
  /* Scope lines are always built from the COMPLETE assembly. */
  const scopeLines = buildBallparkLines(derived, answers, pricebook, defaults);
  const scopePriced = applyPricingModeToLines(scopeLines, pricingMode);

  const config: EstimateEngineConfig = {
    currency: options.currency ?? "USD",
    taxRatePct: options.taxRatePct ?? 0,
    /* Ballpark and detailed always price with the SAME pricing method. */
    pricingStrategy: options.pricingStrategy,
  };

  /*
   * Small jobs carry fixed economics a unit price never sees. They are priced
   * as ENGINE COST LINES, never as a lift on the finished band, so the same
   * scope prices to the same selling price in the detailed estimate.
   */
  const economics = withJobEconomics(scopePriced, config, {
    laborRate: pricebook.laborRate,
    enabled: options.smallJobEconomics !== false,
  });
  const lines = economics.lines;

  const range = buildEstimateRange(
    lines,
    config,
    normalizeAssumptions({ tier: "better" }),
    { ungroupedLabel: "group.other" },
  );

  const widen = unknownWidenPct(derived);
  const expected = range.selected.mid;
  const baseLow = range.selected.base.low;
  const baseHigh = range.selected.base.high;
  /*
   * A footprint ALLOWANCE now keeps the estimate moving when dimensions are
   * missing, so geometryInput is always populated. Real evidence is therefore
   * read from the assumption trail: only a dimension the contractor stated or
   * measured counts. An allowance still lowers confidence and warns.
   */
  const hasDimensions =
    derived.geometryInput.lengthFt != null &&
    derived.geometryInput.widthFt != null &&
    derived.assumptions.find((a) => a.key === "dimensions")?.source === "answered";


  const evidence: BallparkEvidence = {
    hasDimensions,
    hasFinishTier: answers.finishLevel?.value != null,
    pricedCount: scopePriced.length,
    allowanceCount: derived.unknowns.length,
  };
  const constrained = finalizeBallparkBand(
    {
      low: baseLow * (1 - widen / 100),
      expected,
      high: baseHigh * (1 + widen / 100),
    },
    evidence,
  );

  const small = { band: constrained, isSmallJob: economics.isSmallJob };
  const low = small.band.low;
  const high = small.band.high;


  const warnings: BallparkResult["warnings"] = [];
  if (!hasDimensions) warnings.push({ code: "no-dimensions", messageKey: "warning.noDimensions" });
  if (lines.length === 0) warnings.push({ code: "no-lines", messageKey: "warning.noLines" });
  if (pricebook.isSampleData) warnings.push({ code: "sample-data", messageKey: "warning.sampleData" });
  if (small.isSmallJob) warnings.push({ code: "small-job", messageKey: "warning.smallJob" });
  if (pricingMode === "labor_only") {
    warnings.push({ code: "labor-only", messageKey: "warning.laborOnly" });
  }

  return {
    currency: config.currency,
    band: { low, expected: small.band.expected, high },
    confidence: confidenceFor(widen, hasDimensions),
    unknownWidenPct: widen,
    unknowns: derived.unknowns,
    assumptions: derived.assumptions,
    quantities: derived.quantities,
    lines,
    derived,
    isSampleData: pricebook.isSampleData,
    warnings,
    pricingMode,
    isSmallJob: small.isSmallJob,
  };
}

