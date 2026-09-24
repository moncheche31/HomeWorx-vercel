/**
 * Module 013 — Contractor Copilot contracts.
 *
 * The Copilot is a *review* layer. It never mutates the scope records, never
 * runs the estimating math (Module 008) and never rewrites the Narrative Scope
 * (Module 010B): it reads a finished project and returns recommendations the
 * contractor accepts or rejects. Version 1 is fully deterministic — no AI.
 */

export type CopilotLocale = "en-US" | "es-US";

/** Bilingual literal used by the deterministic catalogs. */
export type Bilingual = Record<CopilotLocale, string>;

export type CopilotSectionKey =
  /** Section 1 — quietly added, almost always required. */
  | "standard_items"
  /** Section 2 — likely omissions. Suggest only, never auto-accept. */
  | "missing_scope"
  /** Section 3 — optional customer upgrades. */
  | "upsell"
  /** Section 4 — lower-cost alternatives for Good / Better / Best. */
  | "value_engineering";

/**
 * 🟢 high — almost always required.
 * 🟡 medium — often recommended.
 * 🔵 optional — customer preference.
 * 🔴 contractor_decision — specification unknown, contractor must decide.
 */
export type CopilotConfidence = "high" | "medium" | "optional" | "contractor_decision";

export type CopilotDecision = "pending" | "accepted" | "removed";

/** A downgrade path for Section 4 (from → to, with an indicative saving). */
export interface ValueEngineeringOption {
  fromKey: string;
  toKey: string;
  fromLabel: string;
  toLabel: string;
  /** Indicative only — the estimating engine remains the source of truth. */
  savingsPct: number;
}

export interface CopilotRecommendation {
  id: string;
  sectionKey: CopilotSectionKey;
  /** Stable machine key, e.g. "standard.dust_containment". */
  itemKey: string;
  /** Contractor-facing (private mode) label. */
  label: string;
  /** Customer-facing label — no estimating terminology. */
  customerLabel: string;
  /** Why the Copilot raised it (contractor mode). */
  rationale: string;
  /** Reassuring customer-mode phrasing. */
  customerRationale: string;
  confidence: CopilotConfidence;
  tradeKey: string;
  /** What in the project triggered the recommendation (scope title / keyword). */
  trigger: string | null;
  /** Default decision. Only Section 1 defaults to "accepted". */
  defaultDecision: Exclude<CopilotDecision, "removed">;
  /** Present for Section 4 only. */
  valueEngineering?: ValueEngineeringOption;
  /** Present for Section 3 when a typical price band is known. */
  typicalPriceRange?: { low: number; high: number } | null;
}

export interface CopilotSection {
  key: CopilotSectionKey;
  recommendations: CopilotRecommendation[];
}

/** Minimal projection of a scope item — the Copilot never sees the DB shape. */
export interface CopilotScopeItem {
  id: string;
  title: string;
  roomName: string | null;
  materialSelection: string | null;
  notes: string | null;
  tradeKey?: string | null;
}

export interface CopilotReviewInput {
  projectName: string;
  locale: CopilotLocale;
  /** "walkthrough" or "remote_vision" — recorded for provenance only. */
  origin?: "walkthrough" | "remote_vision" | "manual";
  items: CopilotScopeItem[];
  /** Free text (remote-vision description, project notes). Optional. */
  description?: string;
  /** Assumptions already made elsewhere (Module 011). Optional. */
  assumptions?: Array<{ topicKey: string; optionKey: string }>;
  /** Room type keys already known (e.g. "kitchen"). Optional. */
  roomTypeKeys?: string[];
}

export interface CopilotReview {
  projectName: string;
  locale: CopilotLocale;
  generatedAt: string;
  sections: CopilotSection[];
  /** Flat list, in section order. */
  recommendations: CopilotRecommendation[];
  counts: Record<CopilotSectionKey, number>;
  /** True when nothing at all could be reviewed (no scope). */
  isEmpty: boolean;
}

export type CopilotDecisionMap = Record<string, CopilotDecision>;

export interface CopilotPresentation {
  mode: "contractor" | "customer";
  /** Plain-language lines. Customer mode contains zero estimating terms. */
  lines: string[];
}
