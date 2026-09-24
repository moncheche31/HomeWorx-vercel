/**
 * COMPOSITE / ATOMIC EXCLUSIVITY.
 *
 * Some catalog assemblies are packages: a "full bath rough-in" already contains
 * supply lines and shutoffs; a "moderate electrical" room package already
 * contains new circuits, devices and code-required protection; a "shower
 * system" already contains waterproofing. Pricing the package AND its
 * components charges the same work twice, which is exactly how a garage
 * conversion reached $54,582 of job cost against $24,708 of real scope.
 *
 * The rule: for every declared composite, either the parent carries the money
 * and its included children are rolled up to zero, or the parent is decomposed
 * and disappears. Never both.
 *
 * This module is declarative and deterministic — no inference, no scoring. If a
 * relationship is not declared here, nothing is rolled up.
 *
 * Pure module: no React, no Supabase, no i18n, no IO.
 */

export interface CompositeRelationship {
  /** Assembly / pricebook key of the package. */
  parentKey: string;
  /** Keys whose cost the parent already includes. */
  includesKeys: string[];
  /** Human-readable reason, surfaced in the contractor audit trail. */
  reason: string;
}

/**
 * Declared packages. Deliberately conservative: only relationships a
 * residential estimator would consider obviously inside the parent.
 */
export const COMPOSITE_RELATIONSHIPS: CompositeRelationship[] = [
  {
    parentKey: "bath.rough_in",
    includesKeys: ["plumbing.supply_lines", "plumbing.nearby"],
    reason: "bathRoughInIncludesSupply",
  },
  {
    parentKey: "plumbing.major",
    includesKeys: ["plumbing.moderate", "plumbing.nearby", "plumbing.supply_lines"],
    reason: "majorPlumbingIncludesLesser",
  },
  {
    parentKey: "electrical.moderate",
    includesKeys: ["electrical.basic", "electrical.protection"],
    reason: "electricalPackageIncludesCircuitsAndProtection",
  },
  {
    parentKey: "electrical.panel",
    includesKeys: ["electrical.protection"],
    reason: "panelIncludesProtection",
  },
  {
    parentKey: "bath.shower_surround",
    includesKeys: ["bath.shower_waterproofing", "bath.shower_niche"],
    reason: "showerSurroundIncludesWaterproofingAndNiche",
  },
  {
    parentKey: "framing.raised_floor",
    includesKeys: ["flooring.subfloor_prep", "flooring.self_leveling"],
    reason: "raisedFloorCreatesNewSubstrate",
  },
  {
    parentKey: "composite.floor.platform",
    includesKeys: [
      "framing.raised_floor",
      "flooring.subfloor_prep",
      "flooring.self_leveling",
    ],
    reason: "platformFloorCreatesNewSubstrate",
  },
];

const parentIndex = new Map<string, CompositeRelationship>(
  COMPOSITE_RELATIONSHIPS.map((r) => [r.parentKey, r] as const),
);

export interface ExclusivityCandidate {
  /** Stable line / part identifier. */
  id: string;
  /** Assembly or pricebook key this line prices. */
  itemKey: string | null;
}

export interface RollUpDecision {
  /** The child line that must contribute zero money. */
  childId: string;
  childKey: string;
  /** The composite line that carries the cost. */
  parentId: string;
  parentKey: string;
  reason: string;
}

/**
 * Decide which lines are already covered by a composite parent.
 *
 * Parent-carries-the-money is the chosen strategy: the child stays visible in
 * the contractor breakdown (so nothing disappears silently) and is priced at
 * zero. Callers set `rolledUpIntoLineId` on the returned children.
 */
export function resolveCompositeExclusivity(
  candidates: readonly ExclusivityCandidate[],
): RollUpDecision[] {
  const parents = candidates.filter((c) => c.itemKey && parentIndex.has(c.itemKey));
  if (parents.length === 0) return [];

  const decisions: RollUpDecision[] = [];
  const claimed = new Set<string>();

  for (const parent of parents) {
    const rel = parentIndex.get(parent.itemKey as string)!;
    for (const child of candidates) {
      if (child.id === parent.id || !child.itemKey) continue;
      if (claimed.has(child.id)) continue;
      if (!rel.includesKeys.includes(child.itemKey)) continue;
      claimed.add(child.id);
      decisions.push({
        childId: child.id,
        childKey: child.itemKey,
        parentId: parent.id,
        parentKey: rel.parentKey,
        reason: rel.reason,
      });
    }
  }

  return decisions;
}

/** Map of childId -> parentId, ready to stamp onto canonical cost lines. */
export function rollUpMap(decisions: readonly RollUpDecision[]): Map<string, string> {
  return new Map(decisions.map((d) => [d.childId, d.parentId] as const));
}
