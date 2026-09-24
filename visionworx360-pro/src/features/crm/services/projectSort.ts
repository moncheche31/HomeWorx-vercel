import type { ProjectSort } from "./schemas";

/**
 * Maps a project sort choice to a deterministic database ordering.
 *
 * "recent" means "most recently worked on" and is backed by
 * projects.last_activity_at, a column touched by real work
 * (scope, estimates, notes, photos, documents, rooms, measurements and
 * logged project activity) rather than by simply viewing a project.
 */
export const PROJECT_ACTIVITY_COLUMN = "last_activity_at";

export const DEFAULT_PROJECT_SORT: ProjectSort = "recent";

export function projectSortOrder(sort: ProjectSort): { column: string; ascending: boolean } {
  const column =
    sort === "alpha" || sort === "name_asc"
      ? "name"
      : sort === "city_asc" || sort === "city_desc"
        ? "property(city)"
        : sort === "recent"
          ? PROJECT_ACTIVITY_COLUMN
          : sort === "budget_asc" || sort === "budget_desc"
            ? "budget"
            : "created_at";

  const ascending =
    sort === "oldest" ||
    sort === "alpha" ||
    sort === "name_asc" ||
    sort === "city_asc" ||
    sort === "budget_asc";

  return { column, ascending };
}

/** Client-side ordering used by tests and any in-memory list rendering. */
export function sortProjectsInMemory<
  T extends {
    name: string;
    budget?: number | null;
    createdAt: string;
    lastActivityAt?: string | null;
    updatedAt: string;
    propertyCity?: string | null;
  },
>(items: T[], sort: ProjectSort): T[] {
  const activity = (i: T) => i.lastActivityAt ?? i.updatedAt;
  const copy = [...items];
  copy.sort((a, b) => {
    switch (sort) {
      case "recent":
        return activity(b).localeCompare(activity(a));
      case "newest":
        return b.createdAt.localeCompare(a.createdAt);
      case "oldest":
        return a.createdAt.localeCompare(b.createdAt);
      case "alpha":
      case "name_asc":
        return a.name.localeCompare(b.name);
      case "budget_asc":
        return (a.budget ?? 0) - (b.budget ?? 0);
      case "budget_desc":
        return (b.budget ?? 0) - (a.budget ?? 0);
      case "city_asc":
      case "city_desc": {
        // Missing city/town values always sort last, in both directions.
        const ac = a.propertyCity?.trim() ?? "";
        const bc = b.propertyCity?.trim() ?? "";
        if (!ac && !bc) return a.name.localeCompare(b.name);
        if (!ac) return 1;
        if (!bc) return -1;
        const cmp = ac.localeCompare(bc);
        if (cmp !== 0) return sort === "city_asc" ? cmp : -cmp;
        return a.name.localeCompare(b.name);
      }
      default:
        return 0;
    }
  });
  return copy;
}
