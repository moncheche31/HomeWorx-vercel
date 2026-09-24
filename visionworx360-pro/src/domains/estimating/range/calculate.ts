/**
 * V1 Estimate Range Engine — calculation.
 *
 * Wraps `calculateEngineEstimate` (Module 008). Nothing here duplicates the
 * cost math: it only shapes inputs per tier and derives the low/high band.
 */

import { calculateEngineEstimate } from "../engine/calculate";
import type {
  EngineLineInput,
  EstimateEngineConfig,
  EstimateEngineResult,
} from "../engine/types";
import { round2 } from "../calculations";
import { roundMoney as money } from "../money";
import type {
  EstimateRangeResult,
  RangeAdjustment,
  RangeAssumptions,
  RangeSectionResult,
  RangeTier,
  RangeTierResult,
} from "./types";

export const RANGE_TIERS: RangeTier[] = ["good", "better", "best"];

/**
 * Finish-level factors. Good = value finishes, Better = midrange (baseline),
 * Best = premium. Spread reflects preliminary (unmeasured) uncertainty.
 */
export const TIER_SPEC: Record<
  RangeTier,
  { materialFactor: number; laborFactor: number; spreadPct: number }
> = {
  good: { materialFactor: 0.85, laborFactor: 0.95, spreadPct: 12 },
  better: { materialFactor: 1, laborFactor: 1, spreadPct: 10 },
  best: { materialFactor: 1.3, laborFactor: 1.1, spreadPct: 14 },
};

export const DEFAULT_RANGE_ASSUMPTIONS: RangeAssumptions = {
  tier: "better",
  laborRate: null,
  overheadPct: null,
  profitPct: null,
  contingencyPct: null,
  regionalFactor: 1,
  allowances: [],
  markupOnAllowances: true,
  adjustments: [],
  excludedLineIds: [],
};

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
};

/** Preliminary numbers are never presented to the penny. */
export function roundBand(value: number, direction: "down" | "up"): number {
  const step = value >= 10000 ? 500 : value >= 1000 ? 100 : 10;
  if (value <= 0) return 0;
  return direction === "down"
    ? Math.floor(value / step) * step
    : Math.ceil(value / step) * step;
}

/** Merge a persisted (possibly partial / legacy) payload into full assumptions. */
export function normalizeAssumptions(raw: unknown): RangeAssumptions {
  const input = (raw ?? {}) as Partial<RangeAssumptions>;
  const tier = RANGE_TIERS.includes(input.tier as RangeTier)
    ? (input.tier as RangeTier)
    : DEFAULT_RANGE_ASSUMPTIONS.tier;
  const optional = (v: unknown): number | null =>
    v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

  return {
    tier,
    laborRate: optional(input.laborRate),
    overheadPct: optional(input.overheadPct),
    profitPct: optional(input.profitPct),
    contingencyPct: optional(input.contingencyPct),
    regionalFactor: Math.max(0.25, Math.min(3, num(input.regionalFactor, 1) || 1)),
    allowances: Array.isArray(input.allowances)
      ? input.allowances
          .filter((a) => a && typeof a.key === "string")
          .map((a) => ({
            key: a.key,
            label: a.label ?? null,
            amount: Math.max(0, num(a.amount)),
            isTaxable: !!a.isTaxable,
          }))
      : [],
    markupOnAllowances: input.markupOnAllowances ?? true,
    adjustments: Array.isArray(input.adjustments)
      ? input.adjustments
          .filter((a) => a && typeof a.id === "string")
          .map((a) => ({
            id: a.id,
            label: String(a.label ?? ""),
            kind: a.kind === "reduce" ? "reduce" : "add",
            low: Math.max(0, num(a.low)),
            high: Math.max(0, num(a.high)),
          }))
      : [],
    excludedLineIds: Array.isArray(input.excludedLineIds)
      ? input.excludedLineIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

/** Apply the tier + contractor assumptions to a line. Copy-on-write. */
export function applyTierToLine(
  line: EngineLineInput,
  assumptions: RangeAssumptions,
  tier: RangeTier,
): EngineLineInput {
  const spec = TIER_SPEC[tier];
  const region = assumptions.regionalFactor;
  const baseRate = assumptions.laborRate ?? line.laborRate;

  return {
    ...line,
    laborRate: round2(num(baseRate) * spec.laborFactor * region),
    materialCost: round2(num(line.materialCost) * spec.materialFactor * region),
    equipmentCost: round2(num(line.equipmentCost) * region),
    subcontractorCost: round2(num(line.subcontractorCost) * spec.materialFactor * region),
    otherCost: round2(num(line.otherCost) * region),
    overheadPct: assumptions.overheadPct ?? line.overheadPct,
    profitPct: assumptions.profitPct ?? line.profitPct,
    contingencyPct: assumptions.contingencyPct ?? line.contingencyPct,
    product: line.product
      ? { ...line.product, unitPrice: round2(num(line.product.unitPrice) * spec.materialFactor) }
      : line.product,
  };
}

/**
 * Combined reductions may never remove more than this share of the priced
 * scope. Accepted value-engineering options are alternatives to each other far
 * more often than they are cumulative, and uncapped linear subtraction was
 * able to drive a fully priced estimate to $0.
 */
export const MAX_REDUCTION_PCT = 40;

export interface CappedAdjustments {
  applied: RangeAdjustment[];
  addLow: number;
  addHigh: number;
  reduceLow: number;
  reduceHigh: number;
  capped: boolean;
}

/**
 * Deduplicate by id and scale reductions so their total never exceeds
 * `MAX_REDUCTION_PCT` of the priced midpoint. Pure and deterministic.
 */
export function capAdjustments(
  adjustments: RangeAdjustment[],
  baseMid: number,
): CappedAdjustments {
  const seen = new Set<string>();
  const unique = adjustments.filter((a) => {
    if (!a || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  const reduceHighRaw = unique
    .filter((a) => a.kind === "reduce")
    .reduce((sum, a) => sum + Math.max(0, num(a.high)), 0);
  const cap = Math.max(0, num(baseMid)) * (MAX_REDUCTION_PCT / 100);
  const capped = reduceHighRaw > cap;
  const scale = capped && reduceHighRaw > 0 ? cap / reduceHighRaw : 1;

  const applied = unique.map((a) =>
    a.kind === "reduce"
      ? {
          ...a,
          low: round2(Math.max(0, num(a.low)) * scale),
          high: round2(Math.max(0, num(a.high)) * scale),
        }
      : { ...a, low: Math.max(0, num(a.low)), high: Math.max(0, num(a.high)) },
  );

  const sum = (kind: RangeAdjustment["kind"], field: "low" | "high") =>
    round2(
      applied.filter((a) => a.kind === kind).reduce((acc, a) => acc + num(a[field]), 0),
    );

  return {
    applied,
    addLow: sum("add", "low"),
    addHigh: sum("add", "high"),
    reduceLow: sum("reduce", "low"),
    reduceHigh: sum("reduce", "high"),
    capped,
  };
}

function applyAdjustments(
  low: number,
  high: number,
  adjustments: RangeAdjustment[],
): { low: number; high: number } {
  let l = low;
  let h = high;
  for (const a of adjustments) {
    if (a.kind === "add") {
      l += num(a.low);
      h += num(a.high);
    } else {
      l -= num(a.high);
      h -= num(a.low);
    }
  }
  return { low: Math.max(0, l), high: Math.max(0, h) };
}

function sectionResults(
  lines: EngineLineInput[],
  engine: EstimateEngineResult,
  spreadPct: number,
  ungroupedLabel: string,
): RangeSectionResult[] {
  const byKey = new Map<string, RangeSectionResult>();
  for (let i = 0; i < engine.lines.length; i += 1) {
    const input = lines[i];
    const result = engine.lines[i];
    const label = input.groupLabel?.trim() || ungroupedLabel;
    const current =
      byKey.get(label) ??
      { key: label, label, lineCount: 0, laborHours: 0, mid: 0, low: 0, high: 0 };
    current.lineCount += 1;
    current.laborHours = round2(current.laborHours + result.laborHours);
    current.mid = money(current.mid + result.total);
    byKey.set(label, current);
  }
  return [...byKey.values()].map((s) => ({
    ...s,
    low: roundBand(s.mid * (1 - spreadPct / 100), "down"),
    high: roundBand(s.mid * (1 + spreadPct / 100), "up"),
  }));
}

export interface BuildRangeOptions {
  /** Label used for lines with no section. */
  ungroupedLabel?: string;
}

/**
 * Build Good / Better / Best preliminary ranges from the estimate lines.
 * Identical inputs always produce identical output.
 */
export function buildEstimateRange(
  lines: EngineLineInput[],
  config: EstimateEngineConfig,
  rawAssumptions: unknown,
  options: BuildRangeOptions = {},
): EstimateRangeResult {
  const assumptions = normalizeAssumptions(rawAssumptions);
  const ungroupedLabel = options.ungroupedLabel ?? "General";
  const excluded = new Set(assumptions.excludedLineIds);
  const included = lines.filter((l) => !excluded.has(l.id));

  const region = assumptions.regionalFactor;
  const allowanceItems = assumptions.allowances
    .filter((a) => a.amount > 0)
    .map((a) => ({
      key: a.key,
      amount: money(a.amount * region),
      isTaxable: !!a.isTaxable,
    }));

  const warnings: EstimateRangeResult["warnings"] = [];
  if (included.length === 0) {
    warnings.push({ code: "no-lines", message: "No priceable scope lines." });
  }

  const tiers: RangeTierResult[] = RANGE_TIERS.map((tier) => {
    const spec = TIER_SPEC[tier];
    const tierLines = included.map((l) => applyTierToLine(l, assumptions, tier));
    const tierConfig: EstimateEngineConfig = {
      ...config,
      allowances: {
        other: allowanceItems,
        markupApplies: assumptions.markupOnAllowances,
        isTaxable: false,
      },
    };
    const engine = calculateEngineEstimate(tierLines, tierConfig);
    const mid = engine.totals.grandTotal;
    const baseLow = mid * (1 - spec.spreadPct / 100);
    const baseHigh = mid * (1 + spec.spreadPct / 100);
    const capped = capAdjustments(assumptions.adjustments, mid);
    const band = applyAdjustments(baseLow, baseHigh, capped.applied);

    return {
      tier,
      mid: money(mid),
      low: roundBand(band.low, "down"),
      high: roundBand(band.high, "up"),
      base: {
        mid: money(mid),
        low: roundBand(baseLow, "down"),
        high: roundBand(baseHigh, "up"),
      },
      adjustmentImpact: {
        addLow: capped.addLow,
        addHigh: capped.addHigh,
        reduceLow: capped.reduceLow,
        reduceHigh: capped.reduceHigh,
        capped: capped.capped,
      },
      laborHours: engine.totals.laborHours,
      crewHours: engine.totals.crewHours,
      breakdown: {
        labor: engine.totals.laborTotal,
        material: money(engine.totals.materialTotal + engine.totals.productTotal),
        equipment: engine.totals.equipmentTotal,
        subcontractor: engine.totals.subcontractorTotal,
        other: engine.totals.otherTotal,
        allowances: engine.totals.allowanceTotal,
        overhead: engine.totals.overhead,
        profit: engine.totals.profit,
        contingency: engine.totals.contingency,
        tax: engine.totals.tax,
        directCost: engine.totals.directCost,
      },
      adjustments: capped.applied,
      sections: sectionResults(included, engine, spec.spreadPct, ungroupedLabel),
    } satisfies RangeTierResult;
  });

  if (included.length > 0 && tiers[1] && tiers[1].laborHours === 0) {
    warnings.push({ code: "no-labor", message: "No labor hours resolved." });
  }

  const selected = tiers.find((t) => t.tier === assumptions.tier) ?? tiers[1];

  return {
    currency: config.currency,
    tiers,
    selected,
    assumptions,
    warnings,
    isEmpty: included.length === 0,
  };
}
