/**
 * Module 015 — future extension points.
 *
 * NOTHING here is implemented in Version 1. These interfaces exist so that AI
 * reasoning, computer vision, historical analysis, regional benchmarking, code
 * and permit databases, supplier and manufacturer data, and contractor-specific
 * learning can be added later without changing a single consumer.
 *
 * Data ownership rule (ADR-038): contractor data is never pooled, sold, or used
 * for training. Any future benchmarking extension must operate on explicitly
 * anonymized, opt-in aggregates only.
 */
import type {
  KnowledgeItem,
  KnowledgeNote,
  KnowledgeQuery,
  KnowledgeRecommendationSet,
  KnowledgeSalesOpportunity,
  KnowledgeValueEngineering,
} from "./types";

/** Natural-language reasoning over the seeded corpus. Not implemented. */
export interface AiReasoningExtension {
  explain(query: KnowledgeQuery): Promise<KnowledgeNote[]>;
  expand(set: KnowledgeRecommendationSet): Promise<KnowledgeRecommendationSet>;
}

/** Photo/rendering derived activities (Module 011 pipeline). Not implemented. */
export interface ComputerVisionKnowledgeExtension {
  activitiesFromMedia(mediaIds: string[]): Promise<string[]>;
}

/** Learn from the organization's own completed estimates. Not implemented. */
export interface HistoricalEstimateExtension {
  omissionsFromHistory(organizationId: string, query: KnowledgeQuery): Promise<KnowledgeItem[]>;
}

/** Regional norms and benchmarking. Anonymized, opt-in only. Not implemented. */
export interface RegionalBenchmarkExtension {
  regionalNorms(location: { zip?: string; state?: string }, query: KnowledgeQuery): Promise<KnowledgeItem[]>;
}

/** Building code lookups replacing the Version 1 placeholders. Not implemented. */
export interface BuildingCodeExtension {
  codeRequirements(query: KnowledgeQuery, jurisdiction: string): Promise<KnowledgeNote[]>;
}

/** Permit database lookups. Not implemented. */
export interface PermitDatabaseExtension {
  permitRequirements(query: KnowledgeQuery, jurisdiction: string): Promise<KnowledgeNote[]>;
}

/** Supplier catalog cross-reference (Module 029/030 seams). Not implemented. */
export interface SupplierCatalogKnowledgeExtension {
  relatedProducts(itemKeys: string[]): Promise<KnowledgeSalesOpportunity[]>;
}

/** Manufacturer required-accessory data. Not implemented. */
export interface ManufacturerDataExtension {
  requiredAccessories(productIds: string[]): Promise<KnowledgeItem[]>;
  alternates(productIds: string[]): Promise<KnowledgeValueEngineering[]>;
}

/** Contractor-specific learning from accept/ignore behaviour. Not implemented. */
export interface ContractorLearningExtension {
  rank(items: KnowledgeItem[], organizationId: string): Promise<KnowledgeItem[]>;
}

export interface KnowledgePipelineExtension {
  aiReasoning?: AiReasoningExtension;
  computerVision?: ComputerVisionKnowledgeExtension;
  historicalEstimates?: HistoricalEstimateExtension;
  regionalBenchmarks?: RegionalBenchmarkExtension;
  buildingCodes?: BuildingCodeExtension;
  permitDatabase?: PermitDatabaseExtension;
  supplierCatalog?: SupplierCatalogKnowledgeExtension;
  manufacturerData?: ManufacturerDataExtension;
  contractorLearning?: ContractorLearningExtension;
  merge(partials: KnowledgeRecommendationSet[]): KnowledgeRecommendationSet;
}
