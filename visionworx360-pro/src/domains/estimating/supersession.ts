/**
 * DUPLICATE WORK SUPERSESSION.
 *
 * Two lines can describe the SAME physical work when one of them is a generic
 * placeholder ("Install finished flooring") and the other names the material
 * the contractor actually selected ("Hardwood flooring"). Pricing both charges
 * the client twice for one floor.
 *
 * The rule is deliberately narrow and general at the same time:
 *  - it works per WORK INTENT family (finish-floor installation today), not per
 *    keyword hack for one project;
 *  - a generic line is only superseded when a SPECIFIC line of the same family
 *    exists on the same estimate;
 *  - contractor-priced, contractor-overridden or hand-reviewed lines are never
 *    superseded — only system-generated generics are.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

export interface SupersessionLine {
  id: string;
  description?: string | null;
  quantity?: number | null;
  unitKey?: string | null;
  pricingSource?: string | null;
  isPriceOverridden?: boolean | null;
  archivedAt?: string | null;
}

export interface SupersessionResult {
  /** Lines that should be archived because a more specific line owns the work. */
  supersededIds: string[];
  /** The line that keeps the work, per superseded line id. */
  supersededBy: Record<string, string>;
}

export interface WorkIntentFamily {
  key: string;
  /** The family of work, e.g. installing a finish floor. */
  match: RegExp;
  /** Words that make a line SPECIFIC (a named material or system). */
  specific: RegExp;
  /** Work that is genuinely separate even though it mentions the family. */
  exclude: RegExp;
}

export const WORK_INTENT_FAMILIES: readonly WorkIntentFamily[] = [
  {
    key: "finishFloorInstall",
    match: /\bfloor(s|ing)?\b/,
    specific:
      /\b(hardwood|oak|maple|engineered|laminate|lvp|lvt|vinyl|tile|porcelain|ceramic|carpet|bamboo|cork|epoxy|polished concrete)\b/,
    /* Prep, demo and repair are separate work with their own quantities. */
    exclude: /\b(demo|demolition|remove|removal|patch|prep|subfloor|underlayment|level(ing)?|grind|moisture|transition|baseboard|trim)\b/,
  },
];

const norm = (v: unknown): string => String(v ?? "").toLowerCase().trim();

const isSystemPriced = (line: SupersessionLine): boolean =>
  !line.isPriceOverridden &&
  (line.pricingSource == null ||
    line.pricingSource === "system" ||
    line.pricingSource === "catalog" ||
    line.pricingSource === "unmatched");

/**
 * Which generic lines are superseded by a specific line of the same family.
 * Returns an empty result whenever there is nothing unambiguous to collapse.
 */
export function findSupersededLines(
  lines: readonly SupersessionLine[],
  families: readonly WorkIntentFamily[] = WORK_INTENT_FAMILIES,
): SupersessionResult {
  const supersededIds: string[] = [];
  const supersededBy: Record<string, string> = {};

  const live = lines.filter((l) => !l.archivedAt);

  for (const family of families) {
    const members = live.filter((l) => {
      const text = norm(l.description);
      return family.match.test(text) && !family.exclude.test(text);
    });
    if (members.length < 2) continue;

    const specific = members.filter((l) => family.specific.test(norm(l.description)));
    /* A generic member only counts when it reads like a placeholder install. */
    const generic = members.filter(
      (l) =>
        !family.specific.test(norm(l.description)) &&
        /\b(install|lay|new|finish(ed)?)\b/.test(norm(l.description)),
    );
    if (specific.length === 0 || generic.length === 0) continue;

    /* One clear owner only: ambiguity is left for the contractor to resolve. */
    if (specific.length > 1) continue;
    const owner = specific[0]!;

    for (const line of generic) {
      if (!isSystemPriced(line)) continue;
      supersededIds.push(line.id);
      supersededBy[line.id] = owner.id;
    }
  }

  return { supersededIds, supersededBy };
}

/**
 * The quantity a specific owner line should carry when it was left at a
 * placeholder `1` while the generic line already held the resolved area.
 */
export function quantityToInherit(
  owner: SupersessionLine,
  generic: SupersessionLine,
): number | null {
  const ownerQty = Number(owner.quantity ?? 0);
  const genericQty = Number(generic.quantity ?? 0);
  if (!Number.isFinite(genericQty) || genericQty <= 1) return null;
  if (!Number.isFinite(ownerQty) || ownerQty > 1) return null;
  if (norm(owner.unitKey) !== norm(generic.unitKey)) return null;
  return genericQty;
}
