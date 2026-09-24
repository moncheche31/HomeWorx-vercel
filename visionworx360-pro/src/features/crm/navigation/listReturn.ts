/**
 * Remembers the last list view a contractor was on so an explicit
 * "Back to Projects/Clients/Properties" link returns to that exact filtered,
 * sorted, paginated view.
 *
 * Browser Back already restores the list URL natively — this only covers the
 * in-app back links, which are plain `<Link to="/app/...">` and would
 * otherwise drop the contractor on an unfiltered page 1.
 *
 * The value is stored per list key in sessionStorage and re-validated through
 * the same parsers the routes use, so a tampered or stale entry degrades to
 * the base list rather than reaching a query.
 */
import {
  parseProjectsListSearch,
  parseClientsListSearch,
  parsePropertiesListSearch,
  type ProjectsListSearch,
  type ClientsListSearch,
  type PropertiesListSearch,
} from "./listSearch";

export type CrmListKey = "projects" | "clients" | "properties";

type SearchByKey = {
  projects: ProjectsListSearch;
  clients: ClientsListSearch;
  properties: PropertiesListSearch;
};

const PARSERS = {
  projects: parseProjectsListSearch,
  clients: parseClientsListSearch,
  properties: parsePropertiesListSearch,
} as const;

const STORAGE_PREFIX = "vw360:crm-list:";

function storageKey(key: CrmListKey) {
  return `${STORAGE_PREFIX}${key}`;
}

/** Drops undefined entries so the stored/returned object stays URL-shaped. */
function compact(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

export function rememberListSearch<K extends CrmListKey>(key: K, search: SearchByKey[K]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      storageKey(key),
      JSON.stringify(compact(search as Record<string, unknown>)),
    );
  } catch {
    /* storage unavailable — back links simply fall back to the base list */
  }
}

/**
 * Returns the remembered search for a list, or `{}` when nothing is stored,
 * storage is unavailable, or the stored value is malformed. Each list key has
 * its own slot, so Projects params can never leak into Clients/Properties.
 */
export function readListSearch<K extends CrmListKey>(key: K): SearchByKey[K] {
  const empty = {} as SearchByKey[K];
  if (typeof window === "undefined") return empty;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(storageKey(key));
  } catch {
    return empty;
  }
  if (!raw) return empty;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
    const validated = PARSERS[key](parsed as Record<string, unknown>);
    return compact(validated as Record<string, unknown>) as SearchByKey[K];
  } catch {
    return empty;
  }
}

export function clearListSearch(key: CrmListKey): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(key));
  } catch {
    /* no-op */
  }
}
