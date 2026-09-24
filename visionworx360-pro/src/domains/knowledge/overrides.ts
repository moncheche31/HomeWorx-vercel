/**
 * Module 015 — organization overrides (copy-on-write).
 *
 * Platform-seeded knowledge is immutable. An organization's customizations are
 * stored as deltas and applied at read time, producing a *new* entry object
 * tagged `organization_override`. The seed is never mutated and a contractor's
 * customization is never overwritten by a platform knowledge update.
 */
import type {
  KnowledgeEntry,
  KnowledgeItem,
  KnowledgeItemRole,
  KnowledgeOverride,
} from "./types";

/** Extra organization-owned items, indexed by role, produced by an override. */
export interface OverrideResult {
  entry: KnowledgeEntry;
  /** Organization-authored items that are not in the platform library. */
  addedItems: Array<{ role: KnowledgeItemRole; item: KnowledgeItem }>;
  /** Item keys the organization suppressed. */
  disabledItemKeys: string[];
  /** Item-level confidence re-grades. */
  confidenceOverrides: Record<string, KnowledgeEntry["confidence"]>;
  /** Organization label replacements, by item key. */
  labelOverrides: Record<string, KnowledgeItem["label"]>;
}

const ROLE_FIELD: Record<KnowledgeItemRole, keyof KnowledgeEntry> = {
  required: "requiredItemKeys",
  recommended: "recommendedItemKeys",
  standard_addition: "standardItemKeys",
  common_omission: "commonOmissionKeys",
};

function withoutDisabled(keys: string[], disabled: Set<string>): string[] {
  return keys.filter((key) => !disabled.has(key));
}

/**
 * Apply an organization override to a platform entry. Returns `null` when the
 * organization has disabled the entry entirely.
 */
export function applyOverride(
  entry: KnowledgeEntry,
  override: KnowledgeOverride | undefined,
): OverrideResult | null {
  if (!override) {
    return {
      entry,
      addedItems: [],
      disabledItemKeys: [],
      confidenceOverrides: {},
      labelOverrides: {},
    };
  }
  if (override.disabled) return null;

  const disabled = new Set(override.disabledItemKeys ?? []);
  // Copy-on-write: build a brand-new entry, never touch the seed object.
  const copy: KnowledgeEntry = {
    ...entry,
    requiredItemKeys: withoutDisabled(entry.requiredItemKeys, disabled),
    recommendedItemKeys: withoutDisabled(entry.recommendedItemKeys, disabled),
    standardItemKeys: withoutDisabled(entry.standardItemKeys, disabled),
    commonOmissionKeys: withoutDisabled(entry.commonOmissionKeys, disabled),
    upgradeKeys: withoutDisabled(entry.upgradeKeys, disabled),
    valueEngineeringKeys: withoutDisabled(entry.valueEngineeringKeys, disabled),
    sourceType: "organization_override",
    organizationId: override.organizationId,
  };

  for (const added of override.addedItems ?? []) {
    const field = ROLE_FIELD[added.role];
    const keys = copy[field] as string[];
    if (!keys.includes(added.item.itemKey)) {
      (copy[field] as string[]) = [...keys, added.item.itemKey];
    }
  }

  return {
    entry: copy,
    addedItems: override.addedItems ?? [],
    disabledItemKeys: [...disabled],
    confidenceOverrides: (override.confidenceOverrides ?? {}) as OverrideResult["confidenceOverrides"],
    labelOverrides: override.labelOverrides ?? {},
  };
}

/** Index overrides by entry key for a single organization. */
export function indexOverrides(
  overrides: KnowledgeOverride[],
  organizationId: string | null | undefined,
): Map<string, KnowledgeOverride> {
  const map = new Map<string, KnowledgeOverride>();
  if (!organizationId) return map;
  for (const override of overrides) {
    if (override.organizationId !== organizationId) continue;
    map.set(override.entryKey, override);
  }
  return map;
}

/**
 * Create a copy-on-write override draft from an existing entry. The caller
 * persists it; the platform seed remains untouched.
 */
export function createOverrideDraft(
  entry: KnowledgeEntry,
  organizationId: string,
): KnowledgeOverride {
  return {
    organizationId,
    entryKey: entry.entryKey,
    disabledItemKeys: [],
    addedItems: [],
    confidenceOverrides: {},
    labelOverrides: {},
    disabled: false,
    version: entry.version,
    createdAt: new Date().toISOString(),
  };
}
