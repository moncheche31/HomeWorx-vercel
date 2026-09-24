/**
 * Ballpark recalculation from the structured scope.
 *
 * When the contractor changes the scope of work, a ballpark-mode estimate must
 * reflect the new scope instead of showing a band that was priced against work
 * that no longer exists. The recalculation reuses the same pricebook and the
 * same Module 008 range engine as the interview, so a scope-driven refresh and
 * an interview-driven ballpark can never drift apart.
 *
 * Honesty rules baked in:
 *  - scope with no priceable mapping is reported, never silently dropped;
 *  - a missing quantity is only assumed for `each` work (count of one), and
 *    every assumption widens the band and lowers confidence;
 *  - if nothing at all can be priced, this returns null and the caller keeps
 *    the previously saved band untouched.
 *
 * Pure: no React, no network, no i18n.
 */

import {
  buildEstimateRange,
  normalizeAssumptions,
  normalizePricingMode,
  presentPricing,
  roundBand,
  OWNER_SUPPLIED_HANDLING_PCT,
  buildLaborPlan,
  type EngineLineInput,
  type LaborDefaults,
  type LaborPlan,
  type LaborSettings,
  type PricingMode,
} from "@/domains/estimating";
import {
  normalizePricingStrategy,
  sellingPriceFromTargetMargin,
  usesTargetGrossMargin,
  type PricingStrategy,
} from "@/domains/estimating/pricingStrategy";
import { SMALL_JOB_THRESHOLD, withJobEconomics } from "@/domains/estimating/jobEconomics";
import { canonicalTradeForBallparkKey } from "@/domains/estimating/pricing/canonicalAssemblies";
import { subjectFor } from "@/domains/scopeInterpretation/subjects";
import { SAMPLE_PRICEBOOK, withFinishTier, withLaborRate, type FinishTier } from "./pricebook";
import {
  EMPTY_GEOMETRY_FACTS,
  resolveBallparkScope,
  type BallparkGeometryFacts,
  type BallparkQuantitySource,
  type BallparkUnit,
} from "./quantityResolution";
import { finalizeBallparkBand, type BallparkEvidence } from "./plausibility";
import {
  resolveCompositeExclusivity,
  rollUpMap,
  type RollUpDecision,
} from "@/domains/estimating/compositeExclusivity";
import { applyCostInvariants } from "./costInvariants";

import type { BallparkConfidence, BallparkPricebook } from "./types";

/**
 * A quantity the ballpark resolved for the contractor instead of asking for it.
 * Rendered as "Estimated from 18 ft × 16 ft room and 12 ft ceiling", never as a
 * blocking question.
 */
export interface BallparkScopeAssumption {
  itemId: string;
  title: string;
  itemKey: string;
  quantity: number;
  unitKey: BallparkUnit;
  source: BallparkQuantitySource;
  /** i18n key suffix under `estimating:ballparkCard.basis`. */
  basisKey: string;
  basisValues?: Record<string, string | number>;
  /** Overlapping scope wording folded into this one priced subject. */
  rolledUp?: Array<{ itemId: string; title: string }>;
  /** The contractor replaced the inferred quantity with a known one. */
  corrected?: boolean;
  /** What the ballpark had inferred before the correction. */
  inferredQuantity?: number;
  inferredBasisKey?: string;
  /**
   * A disclosed provisional allowance: real money is carried, but the exact
   * extent (permit fee schedule, device count, beam sizing) is confirmed during
   * detailed estimating. Never presented as an exact price.
   */
  provisional?: boolean;
}


export interface RecalcScopeItem {
  id: string;
  title: string;
  quantity: number | null;
  unitKey: string | null;
  isIncluded: boolean;
  archivedAt?: string | null;
  /**
   * Authoritative trade recorded on the scope item. This — never the display
   * group label — classifies labor. Keyword inference is a last resort.
   */
  tradeKey?: string | null;
}

export interface UnpriceableScopeItem {
  itemId: string;
  title: string;
  /**
   * `noMapping` = nothing in the pricebook; `noQuantity` = measurement missing;
   * `implausibleQuantity` = the count is too large to be real (usually a size
   * such as `60"` read as a count) and must be corrected, not priced.
   */
  reason: "noMapping" | "noQuantity" | "implausibleQuantity";
  /** Present for `implausibleQuantity`: the rejected count and the cap. */
  quantity?: number;
  maxPlausible?: number;
}

export interface ScopeBallparkResult {
  band: { low: number; expected: number; high: number };
  currency: string;
  confidence: BallparkConfidence;
  widenPct: number;
  pricedCount: number;
  assumedCount: number;
  /** Quantities derived from saved geometry (not contractor questions). */
  derivedCount: number;
  /** Quantities covered by a standard residential allowance. */
  allowanceCount: number;
  /** Allowances explicitly disclosed as provisional (verified later). */
  provisionalCount: number;
  /** Inferred quantities the contractor has corrected. */
  correctedCount: number;
  /** Everything the ballpark resolved on the contractor's behalf. */
  assumptions: BallparkScopeAssumption[];
  unpriceable: UnpriceableScopeItem[];
  /**
   * Composite packages that absorbed their atomic children. The children are
   * still listed for the contractor and contribute exactly zero money.
   */
  rolledUpComposites: RollUpDecision[];
  /** Fee lines forced to zero labor by the permit invariant. */
  feeLineIds: string[];
  /** Professional-service lines moved off trade labor. */
  professionalLineIds: string[];

  isSampleData: boolean;
  /** How the job is being sold. Scope and quantities are identical in all modes. */
  pricingMode: PricingMode;
  /** Small-job mobilization / service-call economics were applied. */
  isSmallJob: boolean;
  /**
   * The engine lines the band was priced from, job economics included. The
   * detailed estimate prices these SAME lines, so the preliminary recommended
   * value and the final selling price reconcile by construction.
   */
  pricedLines: EngineLineInput[];
  /**
   * INTERNAL labor-hour model behind the band: baseline hours per task, the
   * contractor's productivity multiplier, trade rollups and a duration
   * estimate. Contractor-only — never rendered on a customer document.
   */
  labor: LaborPlan;
  /**
   * The expected point split into presentable buckets. Always sums to
   * `band.expected`, so a labor + materials presentation can never double-count.
   */
  split: {
    laborSell: number;
    materialSell: number;
    otherSell: number;
    handlingSell: number;
    excludedMaterialSell: number;
  };
}

export interface ScopeBallparkOptions {
  currency?: string;
  taxRatePct?: number;
  laborRate?: number | null;
  overheadPct?: number;
  profitPct?: number;
  contingencyPct?: number;
  /**
   * The estimate's OWN saved pricing method. Mutually exclusive by
   * construction: under a target gross margin no overhead/profit percentage is
   * ever applied, and the band is grossed up from job cost instead. A
   * recalculation must never fall back to a legacy 10/10 markup for an
   * estimate the contractor priced on margin.
   */
  pricingStrategy?: PricingStrategy | null;
  pricebook?: BallparkPricebook;
  geometry?: BallparkGeometryFacts;
  /**
   * Contractor corrections to inferred quantities, keyed `${itemId}:${itemKey}`.
   * The refinement loop: the ballpark infers, discloses what it assumed, and the
   * contractor corrects anything materially wrong. A corrected quantity stops
   * being an assumption — it no longer widens the band and is never overwritten
   * by a later recalculation.
   */
  assumptionOverrides?: Readonly<Record<string, number>>;
  /**
   * Contractor-supplied money for scope the engine RECOGNIZES but cannot price
   * confidently, keyed by scope item id. The work never silently contributes
   * $0: it either blocks as "pricing needed" or carries a flat amount the
   * contractor typed, recorded with contractor provenance.
   */
  contractorPricing?: Readonly<Record<string, number>>;

  /**
   * Material selection tier. Moves material money only — never labor, permits,
   * demolition or anything else whose cost is set by code or raw hours.
   * Defaults to `standard`, which is a no-op.
   */
  finishTier?: FinishTier | string | null;
  /**
   * Total price, labor + materials, or labor only. Presentation and sell
   * composition change; the resolved scope, quantities and assumptions do not.
   */
  pricingMode?: PricingMode;
  /** Apply small-job mobilization / service-call economics. Default true. */
  smallJobEconomics?: boolean;
  /** Company labor defaults (rate, crew pace, crew size, productive hours). */
  laborDefaults?: Partial<LaborDefaults> | null;
  /**
   * Per-estimate labor overrides: productivity multiplier and directly typed
   * hours. Estimate-level values never write back to the company defaults, and
   * a typed-in hour survives every later scope recalculation.
   */
  laborSettings?: LaborSettings | null;
}

/** Stable identity of one assumption across recalculations. */
export function assumptionKey(itemId: string, itemKey: string): string {
  return `${itemId}:${itemKey}`;
}


/**
 * Widening. A quantity derived from measured geometry is nearly as good as a
 * measured one, so it barely widens the band; a standard allowance widens it a
 * little more; scope the ballpark truly cannot resolve widens it most.
 */
const GEOMETRY_WIDEN_PCT = 0.5;
const ALLOWANCE_WIDEN_PCT = 1.5;
/** Each unpriceable scope item widens the band by this much. */
const UNPRICEABLE_WIDEN_PCT = 4;
const MAX_WIDEN_PCT = 18;


const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/**
 * Price the current structured scope as a ballpark band.
 * Returns null when no scope line can be priced at all.
 */
export function recalculateBallparkFromScope(
  items: readonly RecalcScopeItem[],
  options: ScopeBallparkOptions = {},
): ScopeBallparkResult | null {
  const pricebook = withFinishTier(
    withLaborRate(options.pricebook ?? SAMPLE_PRICEBOOK, options.laborRate ?? null),
    options.finishTier ?? null,
  );

  /*
   * PRICING METHOD. Exactly one method prices the band. Under a target gross
   * margin the lines carry no overhead/profit percentage at all — the margin
   * is applied once, to the finished job cost — so the two methods can never
   * stack, and a margin-priced estimate can never silently revert to 10/10.
   */
  const strategy = options.pricingStrategy ? normalizePricingStrategy(options.pricingStrategy) : null;
  const targetMargin = usesTargetGrossMargin(strategy);
  const defaults = {
    overheadPct: targetMargin ? 0 : (options.overheadPct ?? strategy?.overheadPct ?? 10),
    profitPct: targetMargin ? 0 : (options.profitPct ?? strategy?.profitPct ?? 10),
    contingencyPct: options.contingencyPct ?? 0,
  };
  /* Tax always applies LAST, to the selling price — never to the margin base. */
  const taxRatePct = Math.max(0, Number(options.taxRatePct ?? 0) || 0);
  const rangeTaxRatePct = targetMargin ? 0 : taxRatePct;

  const overrides = options.assumptionOverrides ?? {};
  const live = items.filter((i) => i.isIncluded !== false && !i.archivedAt);
  const unpriceable: UnpriceableScopeItem[] = [];
  const lines: EngineLineInput[] = [];
  let assumedCount = 0;

  /*
   * Ballpark quantity resolution: contractor value -> stated count -> saved
   * geometry -> standard allowance. Only what none of those can answer is
   * reported back as needing contractor input.
   */
  const { resolved, unresolved } = resolveBallparkScope(
    live.map((i) => ({ id: i.id, title: i.title, quantity: i.quantity, unitKey: i.unitKey })),
    { geometry: options.geometry ?? EMPTY_GEOMETRY_FACTS, pricebook },
  );

  /*
   * Contractor-supplied money closes the gap the engine cannot: recognized
   * work with no defensible rate is either carried at a flat amount the
   * contractor typed (with contractor provenance) or left blocking. It is
   * never absorbed silently and never priced at $0.
   */
  const contractorPricing = options.contractorPricing ?? {};
  const contractorPriced: Array<{ itemId: string; title: string; amount: number }> = [];
  for (const item of unresolved) {
    const amount = contractorPricing[item.itemId];
    if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
      contractorPriced.push({ itemId: item.itemId, title: item.title, amount: round2(amount) });
    } else {
      unpriceable.push(item);
    }
  }

  const assumptions: BallparkScopeAssumption[] = [];


  /*
   * Trade authority: the trade recorded on the scope item wins. Only when the
   * item carries none do we fall back to the canonical assembly's trade, and
   * only then to keyword inference downstream. Display grouping never decides
   * a trade — that is how cabinetry ended up classified as painting.
   */
  const tradeByItemId = new Map(
    live.map((i) => [i.id, (i.tradeKey ?? "").trim() || null] as const),
  );
  const tradeByLineId = new Map<string, string>();

  for (const subject of resolved) {
    const groupSubject = subjectFor(subject.title);
    for (const part of subject.parts) {
      const price = pricebook.get(part.itemKey);
      if (!price) continue;

      /* A contractor correction replaces the inferred quantity outright. */
      const override = overrides[assumptionKey(subject.itemId, part.itemKey)];
      const corrected = typeof override === "number" && Number.isFinite(override) && override >= 0;
      const quantity = corrected ? round2(override) : part.quantity;
      const source = corrected ? "contractor" : part.source;

      if (source === "geometry" || source === "allowance") assumedCount += 1;

      assumptions.push({
        itemId: subject.itemId,
        title: subject.title,
        itemKey: part.itemKey,
        quantity,
        unitKey: part.unitKey,
        source,
        basisKey: corrected ? "contractorCorrected" : part.basisKey,
        ...(!corrected && part.basisValues ? { basisValues: part.basisValues } : {}),
        ...(subject.rolledUp.length ? { rolledUp: subject.rolledUp } : {}),
        ...(part.provisional && !corrected ? { provisional: true } : {}),
        ...(corrected
          ? { corrected: true, inferredQuantity: part.quantity, inferredBasisKey: part.basisKey }
          : {}),
      });

      const lineId = `${subject.itemId}:${part.itemKey}`;
      const authoritativeTrade =
        tradeByItemId.get(subject.itemId) ?? canonicalTradeForBallparkKey(part.itemKey);
      if (authoritativeTrade) tradeByLineId.set(lineId, authoritativeTrade);

      lines.push({
        id: lineId,
        description: subject.title,
        groupLabel: groupSubject?.categoryKey ?? "group.other",
        quantity,
        unitKey: price.unitKey,
        laborHoursPerUnit: price.laborHoursPerUnit,
        laborHours: null,
        crewSize: 1,
        laborRate: pricebook.laborRate,
        materialCost: round2(price.materialCostPerUnit),
        equipmentCost: 0,
        subcontractorCost: price.subcontractorCostPerUnit ?? 0,
        otherCost: 0,
        wasteFactorPct: 0,
        overheadPct: defaults.overheadPct,
        profitPct: defaults.profitPct,
        contingencyPct: defaults.contingencyPct,
        isTaxable: false,
      });
    }
  }

  /* Contractor-supplied flat amounts price as a single disclosed "other" line. */
  for (const entry of contractorPriced) {
    const lineId = `${entry.itemId}:contractor`;
    assumptions.push({
      itemId: entry.itemId,
      title: entry.title,
      itemKey: "contractor.allowance",
      quantity: 1,
      unitKey: "each",
      source: "contractor",
      basisKey: "contractorPricing",
      corrected: true,
    });
    lines.push({
      id: lineId,
      description: entry.title,
      groupLabel: "group.other",
      quantity: 1,
      unitKey: "each",
      laborHoursPerUnit: null,
      laborHours: 0,
      crewSize: 1,
      laborRate: pricebook.laborRate,
      materialCost: 0,
      equipmentCost: 0,
      subcontractorCost: 0,
      otherCost: entry.amount,
      wasteFactorPct: 0,
      overheadPct: defaults.overheadPct,
      profitPct: defaults.profitPct,
      contingencyPct: defaults.contingencyPct,
      isTaxable: false,
    });
  }



  if (lines.length === 0) return null;

  /*
   * COMPOSITE / ATOMIC EXCLUSIVITY. A declared package already contains its
   * components, so pricing both charges the same work twice. The parent keeps
   * the money; the covered children are zeroed but stay visible.
   */
  const rollUps = resolveCompositeExclusivity(
    lines.map((line) => ({
      id: line.id,
      itemKey: line.id.includes(":") ? line.id.slice(line.id.indexOf(":") + 1) : null,
    })),
  );
  const rolledUpBy = rollUpMap(rollUps);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!rolledUpBy.has(line.id)) continue;
    lines[i] = {
      ...line,
      laborHours: 0,
      laborHoursPerUnit: null,
      productionRate: null,
      materialCost: 0,
      equipmentCost: 0,
      subcontractorCost: 0,
      otherCost: 0,
    };
  }

  /*
   * COST-BASIS INVARIANTS. Permits carry zero labor; engineering and other
   * professional services are direct costs, not carpenter hours.
   */
  const invariants = applyCostInvariants(lines);
  lines.length = 0;
  lines.push(...invariants.lines);


  /*
   * INTERNAL LABOR MODEL. The hours are derived first, because they are what
   * the contractor sells: quantity / production assumption -> baseline hours
   * -> contractor's pace -> adjusted hours. The adjusted hours (not the book
   * hours) are what the band is then priced from, so changing the multiplier
   * or typing a real number moves the price exactly as a contractor expects.
   *
   * Non-install time is REPORTED here but not re-priced into the lines: the
   * small-job money layer below already charges mobilization and the service
   * call minimum, and charging both would double-count.
   */
  const labor = buildLaborPlan(
    lines.map((line) => ({
      id: line.id,
      description: line.description ?? line.id,
      tradeKey: tradeByLineId.get(line.id) ?? null,
      quantity: line.quantity,
      unitKey: line.unitKey ?? null,
      hoursPerUnit: line.laborHoursPerUnit ?? null,
      flatHours: line.laborHours ?? null,
      laborRate: line.laborRate,
    })),
    {
      company: options.laborDefaults ?? { laborRate: pricebook.laborRate },
      settings: options.laborSettings ?? null,
      nonInstallTime: options.smallJobEconomics !== false,
    },
  );
  const laborByTask = new Map(labor.tasks.map((t) => [t.id, t]));
  const hourAdjusted: EngineLineInput[] = lines.map((line) => {
    const task = laborByTask.get(line.id);
    if (!task) return line;
    return { ...line, laborHoursPerUnit: null, laborHours: task.adjustedHours };
  });

  /*
   * Labor-only sells labor, not material — but the engine has already used the
   * full material scope to derive the hours, and keeps a disclosed handling
   * allowance for receiving and staging owner-supplied material.
   */
  const pricingMode = normalizePricingMode(options.pricingMode);
  const sellLines: EngineLineInput[] =
    pricingMode === "labor_only"
      ? hourAdjusted.map((line) => ({
          ...line,
          materialCost: 0,
          laborHours:
            line.laborHours == null
              ? line.laborHours
              : round2(line.laborHours * (1 + OWNER_SUPPLIED_HANDLING_PCT / 100)),
        }))
      : hourAdjusted;

  /*
   * Small-job economics are ENGINE COST LINES, never a lift on the finished
   * band: the detailed estimate prices the same lines through the same engine,
   * so preliminary and final can never drift apart by a fixed cost.
   *
   * Under a target gross margin the range below is still a JOB COST range
   * (the margin is applied once, further down), so the threshold is converted
   * to the same cost basis before it is compared.
   */
  const rangeConfig = {
    currency: options.currency ?? "USD",
    taxRatePct: rangeTaxRatePct,
  };
  const economics = withJobEconomics(sellLines, rangeConfig, {
    laborRate: pricebook.laborRate,
    enabled: options.smallJobEconomics !== false,
    threshold: targetMargin
      ? SMALL_JOB_THRESHOLD * (1 - (strategy?.targetGrossMarginPct ?? 0) / 100)
      : SMALL_JOB_THRESHOLD,
  });

  const range = buildEstimateRange(
    economics.lines,
    rangeConfig,
    normalizeAssumptions({ tier: "better" }),
    { ungroupedLabel: "group.other" },
  );

  const derivedCount = assumptions.filter((a) => a.source === "geometry").length;
  const allowanceCount = assumptions.filter((a) => a.source === "allowance").length;
  const provisionalCount = assumptions.filter((a) => a.provisional === true).length;
  const correctedCount = assumptions.filter((a) => a.corrected === true).length;

  const widenPct = Math.min(
    MAX_WIDEN_PCT,
    round2(
      derivedCount * GEOMETRY_WIDEN_PCT +
        allowanceCount * ALLOWANCE_WIDEN_PCT +
        unpriceable.length * UNPRICEABLE_WIDEN_PCT,
    ),
  );

  /*
   * Plausibility gate. Per-assumption widening explains *why* the band is
   * uncertain; the plausibility policy decides how wide that is allowed to be
   * for a project of this size and this much evidence. Without it a scope with
   * many small allowances drifts toward a range no contractor can plan with.
   */
  const evidence: BallparkEvidence = {
    hasDimensions: Boolean(options.geometry?.floorAreaSf || options.geometry?.lengthFt),
    hasFinishTier: options.finishTier != null,
    pricedCount: lines.length,
    derivedCount,
    allowanceCount,
    correctedCount,
    unpriceableCount: unpriceable.length,
  };
  const raw = {
    low: range.selected.base.low * (1 - widenPct / 100),
    expected: round2(range.selected.mid),
    high: range.selected.base.high * (1 + widenPct / 100),
  };
  const constrained = finalizeBallparkBand(raw, evidence);
  const small = { band: constrained, isSmallJob: economics.isSmallJob };


  /*
   * Target gross margin: gross the JOB COST band up once, then apply tax to
   * the selling price. Contingency is already inside the cost, so it is never
   * marked up twice and never re-counted as profit.
   */
  const marginPct = strategy?.targetGrossMarginPct ?? 0;
  const sell = (v: number) =>
    round2(sellingPriceFromTargetMargin(v, marginPct) * (1 + taxRatePct / 100));
  const band = targetMargin
    ? { ...small.band, low: sell(small.band.low), expected: sell(small.band.expected), high: sell(small.band.high) }
    : small.band;


  /*
   * Presentable buckets for the expected point, scaled to sum exactly. The
   * components come from the COMPLETE scope lines, so labor-only can disclose
   * exactly how much material sell money the owner is taking on.
   */
  const components = hourAdjusted.reduce(
    (acc, line) => {
      const qty = Number(line.quantity) || 0;
      const hours = (line.laborHoursPerUnit ?? 0) * qty + (line.laborHours ?? 0);
      acc.laborTotal += hours * (line.laborRate ?? 0);
      acc.materialTotal += (line.materialCost ?? 0) * qty;
      acc.subcontractorTotal += (line.subcontractorCost ?? 0) * qty;
      acc.equipmentTotal += (line.equipmentCost ?? 0) * qty;
      acc.otherTotal += (line.otherCost ?? 0) * qty;
      return acc;
    },
    {
      laborTotal: 0,
      materialTotal: 0,
      equipmentTotal: 0,
      subcontractorTotal: 0,
      otherTotal: 0,
      overhead: 0,
      profit: 0,
      contingency: 0,
      tax: 0,
    },
  );
  const presented = presentPricing(components, pricingMode);
  const scale = presented.total > 0 ? band.expected / presented.total : 0;
  const split = {
    laborSell: round2(presented.laborSell * scale),
    materialSell: round2(presented.materialSell * scale),
    otherSell: round2(presented.otherSell * scale),
    handlingSell: round2(presented.handlingSell * scale),
    excludedMaterialSell: round2(presented.excludedMaterialSell * scale),
  };

  return {
    band,
    currency: options.currency ?? "USD",
    /* Any assumed quantity or unpriceable scope caps confidence below "high". */
    confidence: widenPct === 0 ? "high" : widenPct <= 20 ? "medium" : "low",
    widenPct,
    pricedCount: lines.length,
    assumedCount,
    derivedCount,
    allowanceCount,
    provisionalCount,
    correctedCount,
    assumptions,
    unpriceable,
    rolledUpComposites: rollUps,
    feeLineIds: invariants.feeLineIds,
    professionalLineIds: invariants.professionalLineIds,

    isSampleData: pricebook.isSampleData,
    pricingMode,
    isSmallJob: small.isSmallJob,
    pricedLines: economics.lines,
    labor,
    split,
  };

}
