/**
 * Module 015 — the deterministic Knowledge Engine.
 *
 * Pure functions over the seeded catalog plus (optional) organization
 * copy-on-write overrides. No AI, no network, no database.
 */
import { ENTRY_CUSTOMER_INTRO, KNOWLEDGE_ENTRIES } from "./catalog";
import { ITEM_LIBRARY, UPGRADE_LIBRARY, VALUE_ENGINEERING_LIBRARY, toStandardItem } from "./items";
import { matchEntries } from "./matching";
import { applyOverride, indexOverrides } from "./overrides";
import { activeKnowledgeVersion, selectAvailableEntries } from "./versioning";
import type { KnowledgeEngine } from "./providers";
import type {
  Bilingual,
  KnowledgeEntry,
  KnowledgeItem,
  KnowledgeMatch,
  KnowledgeNote,
  KnowledgeOverride,
  KnowledgeQuery,
  KnowledgeRecommendationSet,
  KnowledgeSalesOpportunity,
  KnowledgeStandardItem,
  KnowledgeValueEngineering,
  ResolvedKnowledgeEntry,
} from "./types";

/** Organization overrides are supplied by the caller — the domain owns no I/O. */
let overrideStore: KnowledgeOverride[] = [];

export function setKnowledgeOverrides(overrides: KnowledgeOverride[]): void {
  overrideStore = [...overrides];
}

export function getKnowledgeOverrides(): KnowledgeOverride[] {
  return [...overrideStore];
}

function overrideItems(organizationId: string | null | undefined): Map<string, KnowledgeItem> {
  const map = new Map<string, KnowledgeItem>();
  if (!organizationId) return map;
  for (const override of overrideStore) {
    if (override.organizationId !== organizationId) continue;
    for (const added of override.addedItems ?? []) map.set(added.item.itemKey, added.item);
  }
  return map;
}

function lookupItem(
  itemKey: string,
  extras: Map<string, KnowledgeItem>,
): KnowledgeItem | null {
  return extras.get(itemKey) ?? ITEM_LIBRARY[itemKey] ?? UPGRADE_LIBRARY[itemKey] ?? null;
}

function applyItemOverrides(
  item: KnowledgeItem,
  confidences: Record<string, KnowledgeEntry["confidence"]>,
  labels: Record<string, Bilingual>,
): KnowledgeItem {
  const confidence = confidences[item.itemKey];
  const label = labels[item.itemKey];
  if (!confidence && !label) return item;
  return { ...item, confidence: confidence ?? item.confidence, label: label ?? item.label };
}

function dedupeItems<T extends { itemKey: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.itemKey)) continue;
    seen.add(item.itemKey);
    out.push(item);
  }
  return out;
}

function dedupeNotes(notes: KnowledgeNote[]): KnowledgeNote[] {
  const seen = new Set<string>();
  return notes.filter((n) => (seen.has(n.noteKey) ? false : (seen.add(n.noteKey), true)));
}

/** Entries readable for this query, with organization overrides applied. */
function readableEntries(query: KnowledgeQuery = {}): Array<{
  entry: KnowledgeEntry;
  confidences: Record<string, KnowledgeEntry["confidence"]>;
  labels: Record<string, Bilingual>;
}> {
  const overrides = indexOverrides(overrideStore, query.organizationId);
  const available = selectAvailableEntries(KNOWLEDGE_ENTRIES, {
    version: query.version,
    includeArchived: query.includeArchived,
  });
  const out: Array<{
    entry: KnowledgeEntry;
    confidences: Record<string, KnowledgeEntry["confidence"]>;
    labels: Record<string, Bilingual>;
  }> = [];
  for (const seed of available) {
    const result = applyOverride(seed, overrides.get(seed.entryKey));
    if (!result) continue; // organization disabled this entry
    out.push({
      entry: result.entry,
      confidences: result.confidenceOverrides,
      labels: result.labelOverrides,
    });
  }
  return out;
}

function resolve(
  record: ReturnType<typeof readableEntries>[number],
  query: KnowledgeQuery,
): ResolvedKnowledgeEntry {
  const extras = overrideItems(query.organizationId);
  const { entry, confidences, labels } = record;

  const items = (keys: string[]): KnowledgeItem[] =>
    keys
      .map((key) => lookupItem(key, extras))
      .filter((i): i is KnowledgeItem => i !== null)
      .map((i) => applyItemOverrides(i, confidences, labels));

  const standardItems: KnowledgeStandardItem[] = entry.standardItemKeys
    .map((key) => {
      const extra = extras.get(key);
      if (extra) return { ...extra, reason: extra.contractorRationale };
      return toStandardItem(key);
    })
    .filter((i): i is KnowledgeStandardItem => i !== null)
    .map((i) => ({ ...applyItemOverrides(i, confidences, labels), reason: i.reason }));

  const upgrades: KnowledgeSalesOpportunity[] = entry.upgradeKeys
    .map((key) => {
      const known = UPGRADE_LIBRARY[key];
      if (known) return known;
      const fallback = lookupItem(key, extras);
      if (!fallback) return null;
      return {
        ...fallback,
        confidence: "optional" as const,
        impactCategory: "aesthetics" as const,
        isOptional: true as const,
      };
    })
    .filter((u): u is KnowledgeSalesOpportunity => u !== null);

  const valueEngineering: KnowledgeValueEngineering[] = entry.valueEngineeringKeys
    .map((key) => VALUE_ENGINEERING_LIBRARY[key])
    .filter((v): v is KnowledgeValueEngineering => Boolean(v));

  const requiredItems = items(entry.requiredItemKeys);
  const recommendedItems = items(entry.recommendedItemKeys);
  const commonOmissions = items(entry.commonOmissionKeys);

  const intro = ENTRY_CUSTOMER_INTRO[entry.entryKey];
  const customerValueStatements = [
    ...(intro ? [intro] : []),
    ...[...requiredItems, ...standardItems, ...recommendedItems].map(
      (i) => i.customerValueStatement,
    ),
  ];

  return {
    entry,
    requiredItems,
    recommendedItems,
    standardItems: dedupeItems(standardItems),
    commonOmissions,
    upgrades: dedupeItems(upgrades),
    valueEngineering,
    customerValueStatements,
  };
}

function matchesFor(query: KnowledgeQuery): Array<{
  match: KnowledgeMatch;
  resolved: ResolvedKnowledgeEntry;
}> {
  const records = readableEntries(query);
  const byKey = new Map(records.map((r) => [r.entry.entryKey, r]));
  const matches = matchEntries(
    records.map((r) => r.entry),
    query,
  );
  return matches.map((match) => ({
    match,
    resolved: resolve(byKey.get(match.entryKey)!, query),
  }));
}

/* ------------------------------------------------------------ the engine */

export const deterministicKnowledgeEngine: KnowledgeEngine = {
  key: "deterministic-v1",
  deterministic: true,

  version: () => activeKnowledgeVersion(),

  listEntries: (query: KnowledgeQuery = {}) => readableEntries(query).map((r) => r.entry),

  getEntry: (entryKey: string, query: KnowledgeQuery = {}) => {
    const record = readableEntries(query).find((r) => r.entry.entryKey === entryKey);
    return record ? resolve(record, query) : null;
  },

  search: (query: KnowledgeQuery) => matchesFor(query).map((m) => m.match),

  recommend: (query: KnowledgeQuery): KnowledgeRecommendationSet => {
    const results = matchesFor(query);
    const resolved = results.map((r) => r.resolved);

    const set: KnowledgeRecommendationSet = {
      locale: "en-US",
      version: query.version ?? activeKnowledgeVersion().version,
      generatedAt: new Date().toISOString(),
      matches: results.map((r) => r.match),
      requiredItems: dedupeItems(resolved.flatMap((r) => r.requiredItems)),
      recommendedItems: dedupeItems(resolved.flatMap((r) => r.recommendedItems)),
      standardAdditions: dedupeItems(resolved.flatMap((r) => r.standardItems)),
      commonOmissions: dedupeItems(resolved.flatMap((r) => r.commonOmissions)),
      salesOpportunities: dedupeItems(resolved.flatMap((r) => r.upgrades)),
      valueEngineering: resolved
        .flatMap((r) => r.valueEngineering)
        .filter((v, i, arr) => arr.findIndex((x) => x.ruleKey === v.ruleKey) === i),
      safetyNotes: dedupeNotes(resolved.flatMap((r) => r.entry.safetyNotes)),
      codeReminders: dedupeNotes(resolved.flatMap((r) => r.entry.codeReminders)),
      permitReminders: dedupeNotes(resolved.flatMap((r) => r.entry.permitReminders)),
      inspectionReminders: dedupeNotes(resolved.flatMap((r) => r.entry.inspectionReminders)),
      sequencingNotes: dedupeNotes(resolved.flatMap((r) => r.entry.sequencingNotes)),
      customerValueStatements: resolved
        .flatMap((r) => r.customerValueStatements)
        .filter((s, i, arr) => arr.findIndex((x) => x["en-US"] === s["en-US"]) === i),
      isEmpty: results.length === 0,
    };
    return set;
  },

  requiredItems: (query) => deterministicKnowledgeEngine.recommend(query).requiredItems,
  sequencing: (query) => deterministicKnowledgeEngine.recommend(query).sequencingNotes,
  dependencies: (entryKey) =>
    KNOWLEDGE_ENTRIES.find((e) => e.entryKey === entryKey)?.dependencies ?? [],

  commonOmissions: (query) => deterministicKnowledgeEngine.recommend(query).commonOmissions,
  standardAdditions: (query) => deterministicKnowledgeEngine.recommend(query).standardAdditions,
  salesOpportunities: (query) => deterministicKnowledgeEngine.recommend(query).salesOpportunities,
  alternatives: (query) => deterministicKnowledgeEngine.recommend(query).valueEngineering,

  valueStatements: (query) => deterministicKnowledgeEngine.recommend(query).customerValueStatements,
  statementForItem: (itemKey) => {
    const item = ITEM_LIBRARY[itemKey] ?? UPGRADE_LIBRARY[itemKey];
    return item ? item.customerValueStatement : null;
  },

  codeReminders: (query) => deterministicKnowledgeEngine.recommend(query).codeReminders,
  permitReminders: (query) => deterministicKnowledgeEngine.recommend(query).permitReminders,
  inspectionReminders: (query) => deterministicKnowledgeEngine.recommend(query).inspectionReminders,
  safetyReminders: (query) => deterministicKnowledgeEngine.recommend(query).safetyNotes,
};
