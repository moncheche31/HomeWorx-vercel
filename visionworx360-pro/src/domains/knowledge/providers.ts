/**
 * Module 015 — provider interfaces.
 *
 * These are the contracts other domains code against. Version 1 ships one
 * deterministic implementation (`service.ts`); nothing here reaches the
 * network, calls an AI model, or scrapes anything.
 */
import type {
  Bilingual,
  KnowledgeEntry,
  KnowledgeItem,
  KnowledgeMatch,
  KnowledgeNote,
  KnowledgeQuery,
  KnowledgeRecommendationSet,
  KnowledgeSalesOpportunity,
  KnowledgeStandardItem,
  KnowledgeValueEngineering,
  KnowledgeVersionInfo,
  ResolvedKnowledgeEntry,
} from "./types";

/** Read access to the knowledge corpus itself. */
export interface KnowledgeProvider {
  key: string;
  deterministic: boolean;
  version(): KnowledgeVersionInfo;
  listEntries(query?: KnowledgeQuery): KnowledgeEntry[];
  getEntry(entryKey: string, query?: KnowledgeQuery): ResolvedKnowledgeEntry | null;
  search(query: KnowledgeQuery): KnowledgeMatch[];
}

/** The aggregate answer consumed by Copilot, Narrative Scope, Proposal, etc. */
export interface RecommendationProvider {
  recommend(query: KnowledgeQuery): KnowledgeRecommendationSet;
}

/** Sequencing, dependencies and required items for an activity. */
export interface ConstructionRulesProvider {
  requiredItems(query: KnowledgeQuery): KnowledgeItem[];
  sequencing(query: KnowledgeQuery): KnowledgeNote[];
  dependencies(entryKey: string): string[];
}

/** Likely omissions plus high-confidence standard additions. */
export interface OmissionDetectionProvider {
  commonOmissions(query: KnowledgeQuery): KnowledgeItem[];
  standardAdditions(query: KnowledgeQuery): KnowledgeStandardItem[];
}

export interface SalesOpportunityProvider {
  salesOpportunities(query: KnowledgeQuery): KnowledgeSalesOpportunity[];
}

export interface ValueEngineeringProvider {
  alternatives(query: KnowledgeQuery): KnowledgeValueEngineering[];
}

/** Customer-safe wording. Never returns contractor/estimating vocabulary. */
export interface CustomerValueStatementProvider {
  valueStatements(query: KnowledgeQuery): Bilingual[];
  statementForItem(itemKey: string): Bilingual | null;
}

export interface CodeReminderProvider {
  codeReminders(query: KnowledgeQuery): KnowledgeNote[];
  permitReminders(query: KnowledgeQuery): KnowledgeNote[];
  inspectionReminders(query: KnowledgeQuery): KnowledgeNote[];
}

export interface SafetyReminderProvider {
  safetyReminders(query: KnowledgeQuery): KnowledgeNote[];
}

/** The full surface a knowledge engine implementation exposes. */
export interface KnowledgeEngine
  extends KnowledgeProvider,
    RecommendationProvider,
    ConstructionRulesProvider,
    OmissionDetectionProvider,
    SalesOpportunityProvider,
    ValueEngineeringProvider,
    CustomerValueStatementProvider,
    CodeReminderProvider,
    SafetyReminderProvider {}
