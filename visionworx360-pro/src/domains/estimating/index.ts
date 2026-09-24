/** Public surface of the estimating engine. Consumers import from here. */

export * from "./engine/types";
export { calculateEngineLine, calculateEngineEstimate, resolveLaborHours } from "./engine/calculate";
export * from "./overrides";
export * from "./pricing/types";
export { getPricingProvider, setPricingProvider, isSeededPricingOnly, nullPricingProvider } from "./pricing/registry";
export { seededPricingProvider } from "./pricing/seededProvider";
export * from "./pricing/knowledgeBridge";
export * from "./pricing/completion";
export * from "./pricing/integrity";


/* Pricing integrity: canonical formulas, quantity engine, composite assemblies. */
export * from "./pricing/canonical";
export * from "./pricing/canonicalAssemblies";
export * from "./pricing/quantities";
export * from "./pricing/assemblies";
export * from "./pricing/compositePreview";
export type * from "./extensionPoints";
export { calculateLine, calculateEstimate, round2 } from "./calculations";
export type { EstimateLineCostInput, EstimateLineTotals, EstimateTotals } from "./calculations";

/* Ballpark vs Detailed: the two estimating modes as a product contract. */
export * from "./modes";
/* Pricing presentation modes: total / labor+materials / labor-only. */
export * from "./pricingModes";
/* Pricing METHOD: target gross margin vs overhead + profit (mutually exclusive). */
export * from "./pricingStrategy";
/* Where an estimate's pricing settings came from: company default vs override. */
export * from "./pricingProvenance";
/* Canonical task cost basis, productivity semantics and line auditing. */
export * from "./costBasis";
export * from "./productivity";
export * from "./resolution";

export * from "./laborPlausibility";
export * from "./lineAudit";
export * from "./laborHours";
/* Internal-only contractor cost breakdown shared by every estimating workflow. */
export * from "./contractorBreakdown";
/* State-aware clarification/interview CTAs. */
export * from "./clarificationState";

/* Scope -> estimate staleness detection. */
export * from "./scopeSync";

/* Estimate lineage helpers (revisions / alternates / change orders). */
export * from "./lineage";

/* V1 Estimate Range Engine (Good / Better / Best preliminary ranges). */
export * from "./range/types";
export {
  buildEstimateRange,
  normalizeAssumptions,
  applyTierToLine,
  roundBand,
  capAdjustments,
  MAX_REDUCTION_PCT,
  DEFAULT_RANGE_ASSUMPTIONS,
  RANGE_TIERS,
  TIER_SPEC,
} from "./range/calculate";
export { buildRangeNarrative, buildSectionNarrative } from "./range/narrative";
export { recommendationsToAdjustments, MAX_OPTION_SAVINGS_PCT } from "./range/bridge";
export type { BridgeRecommendation } from "./range/bridge";

export * from "./supersession";

/* One canonical cost model behind preliminary and final pricing. */
export * from "./jobEconomics";
export * from "./costModel";
export * from "./reconciliation";
/* Per-unit rates are not total hours: labor-hour integrity + repair evidence. */
export * from "./laborHoursIntegrity";
/* One canonical normalization every surface consumes, plus its repair planner. */
export * from "./canonicalLine";
export * from "./reasoningRepair";
/* One cost basis behind preliminary levels and the final selling price. */
export * from "./preliminaryLevels";


export * from "./ballparkPosition";
