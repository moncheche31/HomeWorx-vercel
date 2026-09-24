/**
 * Module 015 — knowledge versioning.
 *
 * Knowledge is versioned and dated. Older versions are archived, never
 * deleted, so an estimate produced last quarter can still be explained.
 */
import { KNOWLEDGE_EFFECTIVE_DATE, KNOWLEDGE_VERSION } from "./catalog";
import { bi } from "./items";
import type { KnowledgeEntry, KnowledgeVersionInfo } from "./types";

export const KNOWLEDGE_VERSIONS: KnowledgeVersionInfo[] = [
  {
    version: KNOWLEDGE_VERSION,
    effectiveDate: KNOWLEDGE_EFFECTIVE_DATE,
    archivedDate: null,
    isActive: true,
    notes: bi(
      "Initial platform-seeded contractor knowledge (Module 015).",
      "Conocimiento inicial de contratista sembrado por la plataforma (Módulo 015).",
    ),
  },
];

export function activeKnowledgeVersion(): KnowledgeVersionInfo {
  const active = KNOWLEDGE_VERSIONS.find((v) => v.isActive);
  if (!active) throw new Error("No active knowledge version is configured.");
  return active;
}

export function isEntryAvailable(
  entry: KnowledgeEntry,
  options: { version?: string; at?: string; includeArchived?: boolean } = {},
): boolean {
  if (options.includeArchived) return true;
  if (!entry.isActive) return false;
  if (entry.archivedDate) return false;
  const version = options.version ?? activeKnowledgeVersion().version;
  if (entry.version !== version) return false;
  const at = options.at ?? new Date().toISOString().slice(0, 10);
  return entry.effectiveDate <= at;
}

/** Filter a set of entries down to the ones readable under these options. */
export function selectAvailableEntries(
  entries: KnowledgeEntry[],
  options: { version?: string; at?: string; includeArchived?: boolean } = {},
): KnowledgeEntry[] {
  return entries.filter((entry) => isEntryAvailable(entry, options));
}

/** Archive an entry version without mutating the original object. */
export function archiveEntry(entry: KnowledgeEntry, archivedDate: string): KnowledgeEntry {
  return { ...entry, isActive: false, archivedDate };
}
