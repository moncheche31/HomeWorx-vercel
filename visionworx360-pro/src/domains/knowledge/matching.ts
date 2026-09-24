/**
 * Module 015 — deterministic search and matching.
 *
 * Matching is pure string work over the seeded catalog: trigger terms,
 * synonyms, labels, trades, categories and project types. No AI, no network,
 * no fuzzy scoring that could drift between runs.
 */
import type { KnowledgeEntry, KnowledgeMatch, KnowledgeQuery } from "./types";

/** Lower-case, strip accents and collapse punctuation/whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsTerm(haystack: string, term: string): boolean {
  const needle = normalize(term);
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `) || haystack.includes(needle);
}

/** Every searchable string for an entry (structure, not display language). */
export function entryTerms(entry: KnowledgeEntry): string[] {
  return [
    entry.entryKey.replace(/_/g, " "),
    entry.label["en-US"],
    entry.label["es-US"],
    ...entry.triggerTerms,
    ...entry.synonyms,
  ];
}

/**
 * Score an entry against a query. Deterministic weights:
 *  - explicit project type    +6
 *  - trigger term hit         +4 each (capped)
 *  - synonym hit              +2 each (capped)
 *  - trade / category / sub   +2 / +1 / +1
 *  - assembly / assumption / copilot key hit +2
 */
export function scoreEntry(entry: KnowledgeEntry, query: KnowledgeQuery): KnowledgeMatch | null {
  const text = normalize(query.text ?? "");
  const matchedOn: string[] = [];
  let score = 0;

  if (query.projectTypeKeys?.length) {
    const hit = query.projectTypeKeys.find(
      (key) => key === entry.entryKey || entry.projectTypeKeys.includes(key),
    );
    if (hit) {
      // A direct project-type entry outranks activities that merely apply to it.
      score += query.projectTypeKeys.includes(entry.entryKey) ? 8 : 6;
      matchedOn.push(hit);
    }
  }

  if (text) {
    let triggerHits = 0;
    for (const term of entry.triggerTerms) {
      if (containsTerm(text, term)) {
        triggerHits += 1;
        matchedOn.push(term);
        if (triggerHits === 3) break;
      }
    }
    score += triggerHits * 4;

    let synonymHits = 0;
    for (const term of entry.synonyms) {
      if (containsTerm(text, term)) {
        synonymHits += 1;
        matchedOn.push(term);
        if (synonymHits === 3) break;
      }
    }
    score += synonymHits * 2;

    for (const label of [entry.label["en-US"], entry.label["es-US"]]) {
      if (containsTerm(text, label)) {
        score += 3;
        matchedOn.push(label);
        break;
      }
    }
  }

  if (query.tradeKey && query.tradeKey === entry.tradeKey) {
    score += 2;
    matchedOn.push(entry.tradeKey);
  }
  if (query.categoryKey && query.categoryKey === entry.categoryKey) {
    score += 1;
    matchedOn.push(entry.categoryKey);
  }
  if (query.subcategoryKey && query.subcategoryKey === entry.subcategoryKey) {
    score += 1;
    matchedOn.push(entry.subcategoryKey);
  }

  const externalKeys = [
    ...(query.assemblyKeys ?? []),
    ...(query.assumptionKeys ?? []),
    ...(query.copilotItemKeys ?? []),
  ];
  for (const key of externalKeys) {
    const normalized = normalize(key.replace(/[._]/g, " "));
    if (!normalized) continue;
    if (entryTerms(entry).some((term) => containsTerm(normalized, term))) {
      score += 2;
      matchedOn.push(key);
      break;
    }
  }

  if (score <= 0) return null;
  return { entryKey: entry.entryKey, entry, score, matchedOn: [...new Set(matchedOn)] };
}

/** Rank entries for a query. Ties break on entry key for stable output. */
export function matchEntries(entries: KnowledgeEntry[], query: KnowledgeQuery): KnowledgeMatch[] {
  return entries
    .map((entry) => scoreEntry(entry, query))
    .filter((m): m is KnowledgeMatch => m !== null)
    .sort((a, b) => b.score - a.score || a.entryKey.localeCompare(b.entryKey));
}

/** Free-text convenience used by voice capture and remote-vision descriptions. */
export function matchScopeText(entries: KnowledgeEntry[], text: string): KnowledgeMatch[] {
  return matchEntries(entries, { text });
}
