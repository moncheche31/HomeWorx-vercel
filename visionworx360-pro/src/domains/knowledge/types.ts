/**
 * Module 015 — Knowledge Engine (Contractor Brain) contracts.
 *
 * The Knowledge Engine is the platform's deterministic contractor knowledge
 * foundation. It performs **no AI inference**, no network calls and no
 * scraping: it is a versioned, bilingual, human-authored body of construction
 * knowledge that other domains (Copilot, Narrative Scope, Remote Vision,
 * Walkthrough, Proposal, future AI orchestration) query through interfaces.
 *
 * It never prices anything — the estimating engine (Module 008) remains the
 * single source of pricing truth — and it never mutates another domain.
 */

export type KnowledgeLocale = "en-US" | "es-US";

/** Bilingual literal. Structured knowledge is stored apart from display language. */
export type Bilingual = Record<KnowledgeLocale, string>;

/**
 * 🟢 high — usually required or strongly applicable.
 * 🟡 medium — commonly recommended but project dependent.
 * 🔵 optional — customer preference or upgrade.
 * 🔴 contractor_decision_required — professional judgement needed.
 */
export type KnowledgeConfidence =
  | "high"
  | "medium"
  | "optional"
  | "contractor_decision_required";

/** Where a piece of knowledge came from. Ownership matters — see ADR-038. */
export type KnowledgeSourceType =
  | "platform_seed"
  | "organization_override"
  | "provider";

/** Relative, non-numeric impact vocabulary. Never a price. */
export type KnowledgeImpact = "lower" | "similar" | "higher";

/** Why a sales opportunity may matter to the homeowner. */
export type KnowledgeImpactCategory =
  | "function"
  | "comfort"
  | "aesthetics"
  | "efficiency"
  | "durability"
  | "safety"
  | "resale";

export type KnowledgeEntryKind = "project_type" | "activity";

/** Buckets a knowledge item can occupy inside an entry. */
export type KnowledgeItemRole =
  | "required"
  | "recommended"
  | "standard_addition"
  | "common_omission";

/**
 * The atomic unit of contractor knowledge. Contractor wording and customer
 * wording are separate fields in both languages — customer wording must never
 * imply the contractor forgot something.
 */
export interface KnowledgeItem {
  itemKey: string;
  tradeKey: string;
  categoryKey: string;
  confidence: KnowledgeConfidence;
  /** Contractor-facing label. */
  label: Bilingual;
  /** Customer-facing label — no estimating terminology. */
  customerLabel: Bilingual;
  /** Contractor-facing explanation / reason it applies. */
  contractorRationale: Bilingual;
  /** Customer-facing value statement. */
  customerValueStatement: Bilingual;
  /** Indicative quantity or allowance basis. Never a price. */
  suggestedQuantity?: { value: number | null; unitKey: string } | null;
}

/** A standard item is a high-confidence item eligible for one-tap addition. */
export interface KnowledgeStandardItem extends KnowledgeItem {
  /** Why this standard item applies to the current project. */
  reason: Bilingual;
}

/** An optional upgrade the contractor may present to the customer. */
export interface KnowledgeSalesOpportunity extends KnowledgeItem {
  impactCategory: KnowledgeImpactCategory;
  /** Sales opportunities are always optional; never auto-added. */
  isOptional: true;
}

/** A lower-cost alternative. Relative impacts only — no pricing math here. */
export interface KnowledgeValueEngineering {
  ruleKey: string;
  originalKey: string;
  alternativeKey: string;
  originalLabel: Bilingual;
  alternativeLabel: Bilingual;
  tradeoff: Bilingual;
  customerExplanation: Bilingual;
  costImpact: KnowledgeImpact;
  durabilityImpact: KnowledgeImpact;
  appearanceImpact: KnowledgeImpact;
  maintenanceImpact: KnowledgeImpact;
  confidence: KnowledgeConfidence;
}

/** A short reminder (safety / code / permit / inspection / sequencing). */
export interface KnowledgeNote {
  noteKey: string;
  text: Bilingual;
  /** Code, permit and inspection reminders are placeholders in Version 1. */
  isPlaceholder?: boolean;
}

/**
 * A knowledge entry describes either a project type ("Kitchen Remodel") or a
 * single construction activity ("Remove Load-Bearing Wall"). Both share the
 * same shape so consumers only learn one contract.
 */
export interface KnowledgeEntry {
  entryKey: string;
  kind: KnowledgeEntryKind;
  label: Bilingual;
  tradeKey: string;
  categoryKey: string;
  subcategoryKey: string | null;
  /** Project types this entry applies to (activities list their hosts). */
  projectTypeKeys: string[];
  triggerTerms: string[];
  synonyms: string[];
  /** Items that are required or commonly related to the activity. */
  requiredItemKeys: string[];
  /** Commonly recommended, project dependent. */
  recommendedItemKeys: string[];
  /** High-confidence items eligible for one-tap addition. */
  standardItemKeys: string[];
  /** Items contractors most often leave out. */
  commonOmissionKeys: string[];
  /** Optional upgrades / sales opportunities. */
  upgradeKeys: string[];
  /** Value-engineering ladder keys. */
  valueEngineeringKeys: string[];
  safetyNotes: KnowledgeNote[];
  codeReminders: KnowledgeNote[];
  permitReminders: KnowledgeNote[];
  inspectionReminders: KnowledgeNote[];
  sequencingNotes: KnowledgeNote[];
  /** Other entry keys this entry depends on. */
  dependencies: string[];
  confidence: KnowledgeConfidence;
  version: string;
  sourceType: KnowledgeSourceType;
  /** ISO date the knowledge becomes effective. */
  effectiveDate: string;
  /** ISO date the version was archived, if any. */
  archivedDate?: string | null;
  isActive: boolean;
  /** Set when the entry is an organization copy-on-write override. */
  organizationId?: string | null;
}

/** Fully resolved entry — item keys expanded into objects. */
export interface ResolvedKnowledgeEntry {
  entry: KnowledgeEntry;
  requiredItems: KnowledgeItem[];
  recommendedItems: KnowledgeItem[];
  standardItems: KnowledgeStandardItem[];
  commonOmissions: KnowledgeItem[];
  upgrades: KnowledgeSalesOpportunity[];
  valueEngineering: KnowledgeValueEngineering[];
  customerValueStatements: Bilingual[];
}

/** Search input accepted by the matching layer. */
export interface KnowledgeQuery {
  /** Free text: scope title, voice transcript, remote-vision description. */
  text?: string;
  projectTypeKeys?: string[];
  tradeKey?: string;
  categoryKey?: string;
  subcategoryKey?: string;
  /** Knowledge Base assembly keys (Module 007B). */
  assemblyKeys?: string[];
  /** Remote Vision assumption topics (Module 011). */
  assumptionKeys?: string[];
  /** Copilot recommendation item keys (Module 013). */
  copilotItemKeys?: string[];
  /** Restrict to a knowledge version; defaults to the active version. */
  version?: string;
  /** Organization whose copy-on-write overrides should apply. */
  organizationId?: string | null;
  /** Include archived / inactive knowledge. Defaults to false. */
  includeArchived?: boolean;
}

export interface KnowledgeMatch {
  entryKey: string;
  entry: KnowledgeEntry;
  /** Higher is a stronger match. Deterministic. */
  score: number;
  /** What matched: the literal trigger term or synonym. */
  matchedOn: string[];
}

/** Aggregated answer used by Copilot, Narrative Scope, Proposal, etc. */
export interface KnowledgeRecommendationSet {
  locale: KnowledgeLocale;
  version: string;
  generatedAt: string;
  matches: KnowledgeMatch[];
  requiredItems: KnowledgeItem[];
  recommendedItems: KnowledgeItem[];
  standardAdditions: KnowledgeStandardItem[];
  commonOmissions: KnowledgeItem[];
  salesOpportunities: KnowledgeSalesOpportunity[];
  valueEngineering: KnowledgeValueEngineering[];
  safetyNotes: KnowledgeNote[];
  codeReminders: KnowledgeNote[];
  permitReminders: KnowledgeNote[];
  inspectionReminders: KnowledgeNote[];
  sequencingNotes: KnowledgeNote[];
  customerValueStatements: Bilingual[];
  isEmpty: boolean;
}

/**
 * Copy-on-write organization override. The platform seed is never mutated:
 * an override records the delta and is applied at read time.
 */
export interface KnowledgeOverride {
  organizationId: string;
  entryKey: string;
  /** Items the organization never wants suggested. */
  disabledItemKeys?: string[];
  /** Extra organization-owned items, by role. */
  addedItems?: Array<{ role: KnowledgeItemRole; item: KnowledgeItem }>;
  /** Confidence re-grading, e.g. a standard item the org treats as optional. */
  confidenceOverrides?: Record<string, KnowledgeConfidence>;
  /** Organization wording that replaces the platform label. */
  labelOverrides?: Record<string, Bilingual>;
  /** Suppress the whole entry for this organization. */
  disabled?: boolean;
  version: string;
  createdAt: string;
}

export interface KnowledgeVersionInfo {
  version: string;
  effectiveDate: string;
  archivedDate: string | null;
  isActive: boolean;
  notes: Bilingual;
}
