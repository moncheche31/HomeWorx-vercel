/**
 * Adaptive category / project-type ordering derived from an organization's
 * business profile. Pure functions — no side effects, no I/O.
 */
import {
  PROJECT_CATEGORY_KEYS,
  PROJECT_TYPES_BY_CATEGORY,
  CATEGORY_OF_TYPE,
  isProjectCategoryKey,
  isProjectTypeKey,
  type ProjectCategoryKey,
} from "./projectTypes";
import {
  BUSINESS_TYPE_CATEGORY_ORDER,
  BUSINESS_TYPE_RECOMMENDED_TYPES,
  DEFAULT_SCALE_BY_BUSINESS,
  isPrimaryBusinessType,
  isProjectScaleKey,
  type PrimaryBusinessType,
  type ProjectScaleKey,
} from "./businessProfile";

export interface OrganizationBusinessProfile {
  primaryBusinessType: PrimaryBusinessType | null;
  secondaryBusinessTypes: readonly string[];
  serviceSpecialties: readonly string[];
  preferredProjectScale: string | null;
}

export const EMPTY_PROFILE: OrganizationBusinessProfile = {
  primaryBusinessType: null,
  secondaryBusinessTypes: [],
  serviceSpecialties: [],
  preferredProjectScale: null,
};

/**
 * Union the category order for a business type with the full default order
 * so no category is ever hidden — unknown categories fall to the end.
 */
function fullyOrdered(base: readonly ProjectCategoryKey[]): ProjectCategoryKey[] {
  const seen = new Set<ProjectCategoryKey>();
  const out: ProjectCategoryKey[] = [];
  for (const c of base) {
    if (isProjectCategoryKey(c) && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  for (const c of PROJECT_CATEGORY_KEYS) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/** Category order based on primary business type + secondary/specialty boosts. */
export function getAdaptiveCategoryOrder(
  profile: OrganizationBusinessProfile | null | undefined,
): ProjectCategoryKey[] {
  if (!profile || !profile.primaryBusinessType) {
    // "OTHER" or no primary → default order, unless service specialties provide a hint.
    if (profile && profile.serviceSpecialties.length > 0) {
      return boostBySpecialties([...PROJECT_CATEGORY_KEYS], profile);
    }
    return [...PROJECT_CATEGORY_KEYS];
  }
  const primary = profile.primaryBusinessType;
  const base =
    primary === "OTHER"
      ? [...PROJECT_CATEGORY_KEYS]
      : fullyOrdered(BUSINESS_TYPE_CATEGORY_ORDER[primary] ?? []);

  // Boost categories referenced by secondary business types (via their own
  // primary-type ordering) and by service specialties.
  const boosted = boostBySecondaries(base, profile);
  return boostBySpecialties(boosted, profile);
}

function boostBySecondaries(
  order: ProjectCategoryKey[],
  profile: OrganizationBusinessProfile,
): ProjectCategoryKey[] {
  const bumps = new Set<ProjectCategoryKey>();
  for (const s of profile.secondaryBusinessTypes) {
    if (!isPrimaryBusinessType(s)) continue;
    const top = BUSINESS_TYPE_CATEGORY_ORDER[s]?.[0];
    if (top && isProjectCategoryKey(top)) bumps.add(top);
  }
  return reorderWithBumps(order, bumps, /*afterIndex*/ 1);
}

function boostBySpecialties(
  order: ProjectCategoryKey[],
  profile: OrganizationBusinessProfile,
): ProjectCategoryKey[] {
  const bumps = new Set<ProjectCategoryKey>();
  for (const s of profile.serviceSpecialties) {
    if (isProjectCategoryKey(s)) bumps.add(s);
    else if (isProjectTypeKey(s) && s in CATEGORY_OF_TYPE) bumps.add(CATEGORY_OF_TYPE[s]!);
  }
  return reorderWithBumps(order, bumps, /*afterIndex*/ 1);
}

/**
 * Move each bumped category up so it sits after `afterIndex` (i.e. keeps the
 * primary-type category first). Preserves relative order of the bumps.
 */
function reorderWithBumps(
  order: ProjectCategoryKey[],
  bumps: Set<ProjectCategoryKey>,
  afterIndex: number,
): ProjectCategoryKey[] {
  if (bumps.size === 0) return order;
  const primary = order[0];
  const bumpList = order.filter((c) => bumps.has(c) && c !== primary);
  if (bumpList.length === 0) return order;
  const rest = order.filter((c) => !bumpList.includes(c) && c !== primary);
  return primary ? [primary, ...bumpList, ...rest] : [...bumpList, ...rest];
}

/**
 * Within a single category, reorder its project types based on the profile.
 * Recommended-for-profile items float to the top; the rest follow in default
 * order. No type is removed.
 */
export function getAdaptiveTypeOrder(
  category: ProjectCategoryKey,
  profile: OrganizationBusinessProfile | null | undefined,
): string[] {
  const defaults = [...PROJECT_TYPES_BY_CATEGORY[category]];
  if (!profile) return defaults;
  const preferred = new Set<string>();
  // Primary-type recommendations that live in this category.
  if (profile.primaryBusinessType) {
    for (const t of BUSINESS_TYPE_RECOMMENDED_TYPES[profile.primaryBusinessType] ?? []) {
      if (CATEGORY_OF_TYPE[t] === category) preferred.add(t);
    }
  }
  // Explicit specialties (project-type keys) in this category.
  for (const s of profile.serviceSpecialties) {
    if (isProjectTypeKey(s) && CATEGORY_OF_TYPE[s] === category) preferred.add(s);
  }
  if (preferred.size === 0) return defaults;
  const top = defaults.filter((t) => preferred.has(t));
  const rest = defaults.filter((t) => !preferred.has(t));
  return [...top, ...rest];
}

/**
 * Recommended-for-your-business project-type keys. De-duplicated. Never
 * removes items from the main list — this is a shortcut section only.
 */
export function getRecommendedTypes(
  profile: OrganizationBusinessProfile | null | undefined,
  limit = 6,
): string[] {
  if (!profile) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (key: string) => {
    if (!isProjectTypeKey(key)) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  // 1. Service specialties that are types (strongest signal).
  for (const s of profile.serviceSpecialties) push(s);
  // 2. Primary business type recommendations.
  if (profile.primaryBusinessType) {
    for (const t of BUSINESS_TYPE_RECOMMENDED_TYPES[profile.primaryBusinessType] ?? []) push(t);
  }
  // 3. Secondary business type recommendations.
  for (const s of profile.secondaryBusinessTypes) {
    if (!isPrimaryBusinessType(s)) continue;
    for (const t of BUSINESS_TYPE_RECOMMENDED_TYPES[s] ?? []) push(t);
  }
  return out.slice(0, limit);
}

/**
 * Suggested project scale for a project type in this org's profile. May
 * return null when nothing meaningful can be inferred.
 */
export function getRecommendedScale(
  typeKey: string | null,
  profile: OrganizationBusinessProfile | null | undefined,
): ProjectScaleKey | null {
  // Whole-house / additions / new construction default heuristics.
  if (typeKey) {
    if (typeKey === "NEW_CONSTRUCTION" || typeKey === "HOME_ADDITION" || typeKey === "ADU") {
      return "NEW_CONSTRUCTION";
    }
    if (typeKey === "WHOLE_HOUSE_REMODEL") return "MAJOR_RENOVATION";
    if (typeKey === "KITCHEN_REMODEL" || typeKey === "BATHROOM_REMODEL") return "REMODEL";
    if (
      typeKey === "GENERAL_REPAIR" ||
      typeKey === "MAINTENANCE" ||
      typeKey === "PLUMBING_REPAIR" ||
      typeKey === "ELECTRICAL_REPAIR"
    ) {
      return "QUICK_REPAIR";
    }
  }
  if (!profile || !profile.primaryBusinessType) return null;
  const preferred = profile.preferredProjectScale;
  if (preferred && preferred !== "ALL_SIZES" && isProjectScaleKey(preferred)) return preferred;
  return DEFAULT_SCALE_BY_BUSINESS[profile.primaryBusinessType] ?? null;
}
