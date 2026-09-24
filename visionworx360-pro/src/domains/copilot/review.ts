/**
 * Module 013 — deterministic Copilot review.
 *
 * Pure function: (project projection) -> recommendations. It reads nothing,
 * writes nothing, and never touches the estimating engine or narrative engine.
 */
import {
  MISSING_SCOPE_RULES,
  STANDARD_ITEMS,
  UPSELL_RULES,
  VALUE_ENGINEERING_RULES,
  type CatalogEntry,
} from "./catalog";
import type {
  CopilotConfidence,
  CopilotDecisionMap,
  CopilotLocale,
  CopilotRecommendation,
  CopilotReview,
  CopilotReviewInput,
  CopilotScopeItem,
  CopilotSectionKey,
} from "./types";

const SECTION_ORDER: CopilotSectionKey[] = [
  "standard_items",
  "missing_scope",
  "upsell",
  "value_engineering",
];

const CONFIDENCE_RANK: Record<CopilotConfidence, number> = {
  high: 0,
  medium: 1,
  contractor_decision: 2,
  optional: 3,
};

const itemText = (item: CopilotScopeItem): string =>
  [item.title, item.roomName, item.materialSelection, item.notes].filter(Boolean).join(" ");

/** All searchable text for the project, lower-cased. */
export function buildSearchCorpus(input: CopilotReviewInput): string {
  return [
    ...input.items.map(itemText),
    input.description ?? "",
    ...(input.roomTypeKeys ?? []),
    ...(input.assumptions ?? []).map((a) => `${a.topicKey} ${a.optionKey}`),
  ]
    .join(" \n ")
    .toLowerCase();
}

/** True when an equivalent line is already in the contractor's scope. */
function alreadyScoped(corpus: string, entry: CatalogEntry, locale: CopilotLocale): boolean {
  const needle = entry.label[locale].toLowerCase();
  if (needle.length >= 5 && corpus.includes(needle)) return true;
  const english = entry.label["en-US"].toLowerCase();
  return english.length >= 5 && corpus.includes(english);
}

function firstMatch(patterns: RegExp[], corpus: string): string | null {
  for (const pattern of patterns) {
    const match = corpus.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

function toRecommendation(
  entry: CatalogEntry,
  sectionKey: CopilotSectionKey,
  locale: CopilotLocale,
  trigger: string | null,
  extra: Partial<CopilotRecommendation> = {},
): CopilotRecommendation {
  return {
    id: `${sectionKey}:${entry.itemKey}`,
    sectionKey,
    itemKey: entry.itemKey,
    label: entry.label[locale],
    customerLabel: entry.customerLabel[locale],
    rationale: entry.rationale[locale],
    customerRationale: entry.customerRationale[locale],
    confidence: entry.confidence,
    tradeKey: entry.tradeKey,
    trigger,
    defaultDecision: sectionKey === "standard_items" ? "accepted" : "pending",
    typicalPriceRange: null,
    ...extra,
  };
}

function sortRecommendations(list: CopilotRecommendation[]): CopilotRecommendation[] {
  return [...list].sort(
    (a, b) =>
      CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
      a.label.localeCompare(b.label),
  );
}

export function reviewProject(input: CopilotReviewInput): CopilotReview {
  const locale = input.locale;
  const corpus = buildSearchCorpus(input);
  const hasScope = input.items.length > 0 || (input.description ?? "").trim().length > 0;

  /* Section 1 — standard items, quietly added. */
  const standard = hasScope
    ? STANDARD_ITEMS.filter((entry) => !alreadyScoped(corpus, entry, locale)).map((entry) =>
        toRecommendation(entry, "standard_items", locale, null),
      )
    : [];

  /* Section 2 — missing scope, suggestion only. */
  const missing: CopilotRecommendation[] = [];
  const seenMissing = new Set<string>();
  for (const rule of MISSING_SCOPE_RULES) {
    const trigger = firstMatch(rule.patterns, corpus);
    if (!trigger) continue;
    for (const entry of rule.entries) {
      if (seenMissing.has(entry.itemKey)) continue;
      if (alreadyScoped(corpus, entry, locale)) continue;
      seenMissing.add(entry.itemKey);
      missing.push(toRecommendation(entry, "missing_scope", locale, trigger));
    }
  }

  /* Section 3 — upsells. */
  const upsells: CopilotRecommendation[] = [];
  const seenUpsell = new Set<string>();
  for (const rule of UPSELL_RULES) {
    const trigger =
      (input.roomTypeKeys ?? []).includes(rule.roomKey) ? rule.roomKey : firstMatch(rule.patterns, corpus);
    if (!trigger) continue;
    for (const entry of rule.entries) {
      if (seenUpsell.has(entry.itemKey)) continue;
      if (alreadyScoped(corpus, entry, locale)) continue;
      seenUpsell.add(entry.itemKey);
      upsells.push(
        toRecommendation(entry, "upsell", locale, trigger, {
          typicalPriceRange: entry.typicalPriceRange ?? null,
        }),
      );
    }
  }

  /* Section 4 — value engineering ladders. */
  const value: CopilotRecommendation[] = [];
  for (const rule of VALUE_ENGINEERING_RULES) {
    const trigger = firstMatch(rule.patterns, corpus);
    if (!trigger) continue;
    const [best, ...rest] = rule.ladder;
    rest.forEach((step, index) => {
      value.push({
        id: `value_engineering:${rule.itemKey}.${step.key}`,
        sectionKey: "value_engineering",
        itemKey: `${rule.itemKey}.${step.key}`,
        label: `${rule.label[locale]}: ${best.label[locale]} → ${step.label[locale]}`,
        customerLabel: `${rule.customerLabel[locale]}: ${step.label[locale]}`,
        rationale:
          locale === "es-US"
            ? `Alternativa de menor costo (~${rule.stepSavingsPct[index]}% menos).`
            : `Lower-cost alternative (about ${rule.stepSavingsPct[index]}% less).`,
        customerRationale:
          locale === "es-US"
            ? `${step.label[locale]} ofrece un resultado excelente a un precio más accesible.`
            : `${step.label[locale]} delivers an excellent result at a friendlier price.`,
        confidence: "contractor_decision",
        tradeKey: rule.tradeKey,
        trigger,
        defaultDecision: "pending",
        typicalPriceRange: null,
        valueEngineering: {
          fromKey: best.key,
          toKey: step.key,
          fromLabel: best.label[locale],
          toLabel: step.label[locale],
          savingsPct: rule.stepSavingsPct[index],
        },
      });
    });
  }

  const bySection: Record<CopilotSectionKey, CopilotRecommendation[]> = {
    standard_items: sortRecommendations(standard),
    missing_scope: sortRecommendations(missing),
    upsell: sortRecommendations(upsells),
    value_engineering: value,
  };

  const sections = SECTION_ORDER.map((key) => ({ key, recommendations: bySection[key] }));
  const recommendations = sections.flatMap((s) => s.recommendations);

  return {
    projectName: input.projectName,
    locale,
    generatedAt: new Date().toISOString(),
    sections,
    recommendations,
    counts: {
      standard_items: bySection.standard_items.length,
      missing_scope: bySection.missing_scope.length,
      upsell: bySection.upsell.length,
      value_engineering: bySection.value_engineering.length,
    },
    isEmpty: recommendations.length === 0,
  };
}

/** Decisions default per section; the contractor always has the final word. */
export function defaultDecisions(review: CopilotReview): CopilotDecisionMap {
  const map: CopilotDecisionMap = {};
  for (const rec of review.recommendations) map[rec.id] = rec.defaultDecision;
  return map;
}

export function resolveDecision(
  rec: CopilotRecommendation,
  decisions: CopilotDecisionMap,
): "pending" | "accepted" | "removed" {
  return decisions[rec.id] ?? rec.defaultDecision;
}

export function acceptedRecommendations(
  review: CopilotReview,
  decisions: CopilotDecisionMap,
): CopilotRecommendation[] {
  return review.recommendations.filter((rec) => resolveDecision(rec, decisions) === "accepted");
}

export function pendingCount(review: CopilotReview, decisions: CopilotDecisionMap): number {
  return review.recommendations.filter((rec) => resolveDecision(rec, decisions) === "pending").length;
}
