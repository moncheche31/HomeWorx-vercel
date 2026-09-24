import {
  buildContractorBreakdown,
  type ContractorBreakdownTaskInput,
} from "@/domains/estimating/contractorBreakdown";
import { collectFeatures, UNRECOGNIZED_SCOPE_OBSERVATION_ID } from "./analyze";
import { priceFeature } from "./canonicalPricing";
import { roundQuarterHour } from "@/domains/estimating/laborTime";
import { inferStructureScale, type StructureScale } from "./projectScale";
import type { BookPricingLocation } from "@/domains/estimating/pricing/bookLaborRates";
import type {
  AllowanceScopeFeature,
  Assumption,
  UnpricedScopeFeature,
  EstimateLevel,
  EstimateScenario,
  RemoteVisionLocale,
  ScenarioDriver,
  VisionAnalysisResult,
} from "./types";

export const ESTIMATE_LEVELS: EstimateLevel[] = ["economy", "mid_range", "premium"];

/** Preliminary work carries a wider band than a measured estimate. */
const LEVEL_SPREAD: Record<EstimateLevel, number> = {
  economy: 0.15,
  mid_range: 0.12,
  premium: 0.18,
};

const PRODUCTIVE_HOURS_PER_DAY = 8;

function round0(n: number): number {
  return Math.round(n);
}

export interface ScenarioPricingOptions {
  /**
   * Job-site book pricing location (NCE 2026 area modification factors).
   *
   * INVARIANT (one pricing engine): the preliminary band and the detailed
   * estimate both price labor from the published craft wage for the trade
   * times this location's labor factor. When the job site is not confirmed
   * yet this is the explicitly flagged national baseline — never a flat rate.
   */
  bookLocation?: BookPricingLocation | null;
  /** Precomputed trade -> book hourly rate table for that location. */
  laborRates?: Readonly<Record<string, number>> | null;
  /**
   * Whole-building scale used to size unmeasured EXTERIOR work. When omitted it
   * is inferred from the analysis evidence (stated square footage, story count,
   * photo scale anchors) and otherwise from an average single-family home.
   */
  scale?: StructureScale | null;
}

/**
 * Preliminary ranges only. Once the contractor converts this to a real
 * estimate, the Module 008 engine recalculates everything from scope records —
 * from the same assemblies and the same labor rate as the band below.
 */
export function buildScenarios(
  result: VisionAnalysisResult,
  assumptions: Assumption[],
  _locale: RemoteVisionLocale,
  options: ScenarioPricingOptions = {},
): EstimateScenario[] {
  const features = collectFeatures(result);
  /*
   * SCALE AWARENESS. Exterior work must never be sized from an interior-room
   * allowance, so the building envelope is inferred once per scenario run from
   * everything the contractor said plus any photo scale anchors.
   */
  const scale =
    options.scale ??
    inferStructureScale({
      text: [...result.rooms, ...features]
        .map((f) => (f as { evidence?: string | null }).evidence ?? "")
        .join(" \n "),
      observations: features.map((f) => f.label),
    });
  const assumptionByTopic = new Map(assumptions.map((a) => [a.topic, a]));

  return ESTIMATE_LEVELS.map((level) => {
    const drivers: ScenarioDriver[] = [];
    const usedAssumptions = new Set<string>();
    let laborHours = 0;
    const crewHoursByWorkstream = new Map<string, number>();
    /* Internal cost split, aggregated from the SAME engine results. */
    const breakdownTasks: ContractorBreakdownTaskInput[] = [];
    let overhead = 0;
    let profit = 0;
    let contingency = 0;
    let tax = 0;
    const unpricedFeatures: UnpricedScopeFeature[] = [];
    /*
     * BALLPARK vs DETAILED: a ballpark is a rough band, so work with no stated
     * size is priced from a published standard allowance here and disclosed.
     * The detailed estimate keeps the strict evidence-first gate.
     */
    const allowanceFeatures: AllowanceScopeFeature[] = [];

    for (const feature of features) {
      const { line: priced, unpriced } = priceFeature(feature, assumptions, level, {
        bookLocation: options.bookLocation ?? null,
        laborRates: options.laborRates ?? null,
        mode: "ballpark",
        scale,
      });
      if (!priced) {
        /*
         * Recognized work that cannot be priced is REPORTED, never dropped.
         * Dropping it is what produced tasks: [] and a fake $0 – $0 range.
         */
        if (unpriced) unpricedFeatures.push(unpriced);
        continue;
      }
      for (const assumption of assumptionByTopic.values()) usedAssumptions.add(assumption.id);
      const spread = LEVEL_SPREAD[level];
      laborHours += priced.laborHours;
      const workstream = priced.featureKey.startsWith("cabinets.")
        ? "cabinetry"
        : priced.featureKey.split(".")[0] ?? priced.featureKey;
      crewHoursByWorkstream.set(
        workstream,
        (crewHoursByWorkstream.get(workstream) ?? 0) + priced.crewHours,
      );

      drivers.push({
        featureKey: priced.featureKey,
        assemblyKey: priced.assemblyKey,
        label: priced.label,
        costLow: round0(priced.total * (1 - spread)),
        costHigh: round0(priced.total * (1 + spread)),
        /* Quarter-hour invariant: never show or carry hours off the 15-minute grid. */
        laborHours: roundQuarterHour(priced.laborHours),
        crewHours: Math.round(priced.crewHours * 100) / 100,
        pricingBasis: priced.pricingBasis,
        needsReview: priced.needsReview,
        quantityBasis: priced.quantityBasis,
      });

      if (priced.quantityBasis === "ballpark_allowance") {
        allowanceFeatures.push({
          featureKey: priced.featureKey,
          label: priced.label,
          quantity: priced.quantity,
          unitKey: priced.unitKey,
          basisKey: priced.allowanceBasisKey ?? "standard",
        });
      }

      overhead += priced.overhead;
      profit += priced.profit;
      contingency += priced.contingency;
      tax += priced.tax;
      breakdownTasks.push({
        id: priced.featureKey,
        label: priced.label,
        tradeKey: priced.tradeKey,
        quantity: priced.quantity,
        unitKey: priced.unitKey,
        laborHours: priced.laborHours,
        crewHours: priced.crewHours,
        laborCost: priced.laborCost,
        materialCost: priced.materialCost,
        otherCost: priced.otherCost,
        total: priced.laborCost + priced.materialCost + priced.otherCost,
        assemblyKey: priced.assemblyKey,
        pricingBasis: priced.pricingBasis,
        needsReview: priced.needsReview,
        quantityBasis: priced.quantityBasis,
      });
    }

    const costLow = drivers.reduce((sum, d) => sum + d.costLow, 0);
    const costHigh = drivers.reduce((sum, d) => sum + d.costHigh, 0);
    const unknowns = assumptions.filter((a) => a.selectedKey === "unknown" || a.isAutomatic).length;
    const confidence = drivers.length
      ? Math.max(0.2, Math.min(0.9, result.confidence - unknowns * 0.05))
      : 0;

    const durationDays = Math.max(
      drivers.length ? 1 : 0,
      Math.ceil(Math.max(0, ...crewHoursByWorkstream.values()) / PRODUCTIVE_HOURS_PER_DAY),
    );

    /*
     * INVARIANT: recognized priceable scope can never present as $0 – $0.
     * Zero tasks or zero money with real scope on the project is an engine
     * failure state, surfaced as blocked rather than sold as an estimate.
     */
    /*
     * Scope the contractor stated but the engine could not match is ALSO real
     * scope: it arrives as an "unrecognized scope" observation. Reporting it as
     * a clean $0 estimate would be the silent-drop failure this invariant
     * exists to prevent.
     */
    const unrecognizedScope = (result.grounded?.observations ?? []).some(
      (o) => o.id === UNRECOGNIZED_SCOPE_OBSERVATION_ID,
    );
    const pricingBlocked =
      (features.length > 0 || unrecognizedScope) && (drivers.length === 0 || costHigh <= 0);

    const pricingIncompleteReason: EstimateScenario["pricingIncompleteReason"] = !pricingBlocked
      ? null
      : drivers.length === 0
        ? "no_priced_tasks"
        : "zero_money";

    return {
      level,
      costLow,
      costHigh,
      laborHours: roundQuarterHour(laborHours),
      durationDays,
      confidence: Math.round(confidence * 100) / 100,
      assumptionIds: [...usedAssumptions],
      drivers,
      unpricedFeatures,
      allowanceFeatures,
      pricingBlocked,
      pricingIncompleteReason,
      breakdown: buildContractorBreakdown(breakdownTasks, {
        overhead,
        profit,
        contingency,
        tax,
        durationDays,
      }),
    } satisfies EstimateScenario;
  });
}
