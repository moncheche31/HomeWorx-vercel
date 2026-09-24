/**
 * Module 013 — AI-ready extension points.
 *
 * NOTHING here is implemented in Version 1. The deterministic catalogs in
 * `catalog.ts` satisfy `CopilotReviewProvider` today; future providers plug in
 * through `registry.ts` without any UI change.
 */
import type { CopilotRecommendation, CopilotReview, CopilotReviewInput } from "./types";

export interface CopilotReviewProvider {
  key: string;
  /** True when the provider requires no network/AI (Version 1 default). */
  deterministic: boolean;
  review(input: CopilotReviewInput): Promise<CopilotReview> | CopilotReview;
}

/** Photo/rendering derived recommendations (Module 011 vision pipeline). */
export interface ComputerVisionCopilotExtension {
  fromMedia(mediaIds: string[]): Promise<CopilotRecommendation[]>;
}

/** Learn from the organization's own historical estimates. */
export interface HistoricalEstimateExtension {
  fromHistory(organizationId: string, input: CopilotReviewInput): Promise<CopilotRecommendation[]>;
}

/** Regional contractor norms (what other contractors in the area include). */
export interface RegionalNormsExtension {
  fromRegion(location: { zip?: string; state?: string }, input: CopilotReviewInput): Promise<CopilotRecommendation[]>;
}

/** Manufacturer catalog cross-sell / required-accessory data. */
export interface ManufacturerCatalogExtension {
  requiredAccessories(productIds: string[]): Promise<CopilotRecommendation[]>;
}

/** Building code / permit database lookups. */
export interface BuildingCodeExtension {
  requiredByCode(input: CopilotReviewInput): Promise<CopilotRecommendation[]>;
}

/** Personalization from the contractor's own accept/remove behaviour. */
export interface UserBehaviorExtension {
  rank(recommendations: CopilotRecommendation[], userId: string): Promise<CopilotRecommendation[]>;
}

export interface CopilotPipelineExtension {
  computerVision?: ComputerVisionCopilotExtension;
  historicalEstimates?: HistoricalEstimateExtension;
  regionalNorms?: RegionalNormsExtension;
  manufacturerCatalog?: ManufacturerCatalogExtension;
  buildingCodes?: BuildingCodeExtension;
  userBehavior?: UserBehaviorExtension;
  merge(partials: CopilotRecommendation[][]): CopilotRecommendation[];
}
