/**
 * Module 015 — Contractor Copilot integration.
 *
 * The Copilot (Module 013) keeps its own review pipeline; this bridge lets it
 * *consume* shared knowledge instead of holding private hard-coded rules. The
 * conversion is one-way: Knowledge Engine → Copilot recommendations. Copilot
 * behaviour, sections, decisions and customer guard are unchanged.
 */
import { getKnowledgeEngine } from "./registry";
import type {
  KnowledgeConfidence,
  KnowledgeItem,
  KnowledgeLocale,
  KnowledgeQuery,
  KnowledgeSalesOpportunity,
  KnowledgeValueEngineering,
} from "./types";
import type {
  CopilotConfidence,
  CopilotRecommendation,
  CopilotSectionKey,
} from "@/domains/copilot/types";

/** Knowledge confidence maps 1:1 onto the Copilot vocabulary. */
export function toCopilotConfidence(confidence: KnowledgeConfidence): CopilotConfidence {
  return confidence === "contractor_decision_required" ? "contractor_decision" : confidence;
}

function itemToRecommendation(
  item: KnowledgeItem,
  sectionKey: CopilotSectionKey,
  locale: KnowledgeLocale,
  trigger: string | null,
): CopilotRecommendation {
  return {
    id: `${sectionKey}:knowledge.${item.itemKey}`,
    sectionKey,
    itemKey: item.itemKey,
    label: item.label[locale],
    customerLabel: item.customerLabel[locale],
    rationale: item.contractorRationale[locale],
    customerRationale: item.customerValueStatement[locale],
    confidence: toCopilotConfidence(item.confidence),
    tradeKey: item.tradeKey,
    trigger,
    defaultDecision: sectionKey === "standard_items" ? "accepted" : "pending",
    typicalPriceRange: null,
  };
}

function upgradeToRecommendation(
  upgrade: KnowledgeSalesOpportunity,
  locale: KnowledgeLocale,
  trigger: string | null,
): CopilotRecommendation {
  return itemToRecommendation(upgrade, "upsell", locale, trigger);
}

function valueEngineeringToRecommendation(
  rule: KnowledgeValueEngineering,
  locale: KnowledgeLocale,
  trigger: string | null,
): CopilotRecommendation {
  return {
    id: `value_engineering:knowledge.${rule.ruleKey}`,
    sectionKey: "value_engineering",
    itemKey: rule.ruleKey,
    label: `${rule.originalLabel[locale]} → ${rule.alternativeLabel[locale]}`,
    customerLabel: rule.alternativeLabel[locale],
    rationale: rule.tradeoff[locale],
    customerRationale: rule.customerExplanation[locale],
    confidence: toCopilotConfidence(rule.confidence),
    tradeKey: "general",
    trigger,
    defaultDecision: "pending",
    typicalPriceRange: null,
  };
}

export interface KnowledgeCopilotInput {
  locale: KnowledgeLocale;
  query: KnowledgeQuery;
}

/**
 * Knowledge-derived recommendations, already shaped for the Copilot UI.
 * Pricing is intentionally absent — the estimating engine owns price.
 */
export function knowledgeCopilotRecommendations(
  input: KnowledgeCopilotInput,
): CopilotRecommendation[] {
  const engine = getKnowledgeEngine();
  const set = engine.recommend(input.query);
  const trigger = set.matches[0]?.matchedOn[0] ?? null;
  const locale = input.locale;

  return [
    ...set.standardAdditions.map((i) => itemToRecommendation(i, "standard_items", locale, trigger)),
    ...set.commonOmissions.map((i) => itemToRecommendation(i, "missing_scope", locale, trigger)),
    ...set.salesOpportunities.map((u) => upgradeToRecommendation(u, locale, trigger)),
    ...set.valueEngineering.map((v) => valueEngineeringToRecommendation(v, locale, trigger)),
  ];
}

/**
 * Merge knowledge recommendations into an existing Copilot list without
 * duplicating anything the Copilot already raised (matched on itemKey).
 */
export function mergeKnowledgeIntoCopilot(
  existing: CopilotRecommendation[],
  knowledge: CopilotRecommendation[],
): CopilotRecommendation[] {
  const seen = new Set(existing.map((r) => `${r.sectionKey}:${r.itemKey}`));
  const additions = knowledge.filter((r) => !seen.has(`${r.sectionKey}:${r.itemKey}`));
  return [...existing, ...additions];
}
