/**
 * Canonical navigation state for the CRM list screens.
 *
 * List controls (search, filters, page) live in the route's search params so
 * that opening a record and coming back restores exactly what the contractor
 * had on screen. These parsers are the single validation boundary: the URL is
 * user-editable, so every value is bounded and every closed set is checked
 * against its allowed values before it reaches a query.
 *
 * Defaults are represented as `undefined` (absent from the URL) rather than
 * empty strings, so an untouched list keeps a clean `/app/projects` URL.
 */
import { ALL_PROJECT_TYPE_KEYS } from "../catalog/projectTypes";
import type { ProjectStatus, ProjectPriority, ClientStatus } from "../services/types";

/** Search text is free-form, so it is only length-bounded. */
const MAX_TEXT = 100;
/** City / client id come from data, not a fixed list; bound them anyway. */
const MAX_VALUE = 120;
const MAX_PAGE = 10_000;
const MAX_MONEY = 1_000_000_000;

export const PROJECT_STATUS_VALUES: readonly ProjectStatus[] = [
  "lead",
  "site_visit_scheduled",
  "site_visit_complete",
  "estimate_in_progress",
  "estimate_sent",
  "customer_reviewing",
  "approved",
  "scheduled",
  "construction",
  "completed",
];

export const PROJECT_PRIORITY_VALUES: readonly ProjectPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

export const CLIENT_STATUS_VALUES: readonly ClientStatus[] = ["active", "archived"];

/** Sort keys are part of the shareable list view, so they are validated here too. */
export const PROJECT_SORT_VALUES = [
  "recent",
  "newest",
  "oldest",
  "city_asc",
  "city_desc",
  "name_asc",
  "budget_asc",
  "budget_desc",
  "alpha",
] as const;

export const CLIENT_SORT_VALUES = [
  "name_asc",
  "name_desc",
  "city_asc",
  "newest",
  "recent",
  "oldest",
  "alpha",
] as const;

export const PROPERTY_SORT_VALUES = ["address_asc", "city_asc", "newest", "recent"] as const;

export const YES_NO_VALUES = ["yes", "no"] as const;
export type YesNo = (typeof YES_NO_VALUES)[number];

/** Free text: bounded, whitespace-only treated as absent. */
export function parseText(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.trim() === "") return undefined;
  return value.slice(0, max);
}

/** A data-driven value such as a city name or client id. */
export function parseValue(value: unknown): string | undefined {
  return parseText(value, MAX_VALUE);
}

/** Page 1 is the default and stays out of the URL; anything invalid falls back to it. */
export function parsePage(value: unknown): number | undefined {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(raw)) return undefined;
  const page = Math.floor(raw);
  if (page <= 1) return undefined;
  return Math.min(page, MAX_PAGE);
}

/** Closed sets: an unknown value is dropped rather than passed to the query. */
export function parseOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** Budget bounds: non-negative, finite, and capped. */
export function parseMoney(value: unknown): number | undefined {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(raw) || raw < 0) return undefined;
  return Math.min(Math.round(raw), MAX_MONEY);
}

export interface ProjectsListSearch {
  q?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  city?: string;
  clientId?: string;
  type?: string;
  budgetMin?: number;
  budgetMax?: number;
  sort?: (typeof PROJECT_SORT_VALUES)[number];
  page?: number;
}

export function parseProjectsListSearch(raw: Record<string, unknown>): ProjectsListSearch {
  return {
    q: parseText(raw.q),
    status: parseOneOf(raw.status, PROJECT_STATUS_VALUES),
    priority: parseOneOf(raw.priority, PROJECT_PRIORITY_VALUES),
    city: parseValue(raw.city),
    clientId: parseValue(raw.clientId),
    type: parseOneOf(raw.type, ALL_PROJECT_TYPE_KEYS),
    budgetMin: parseMoney(raw.budgetMin),
    budgetMax: parseMoney(raw.budgetMax),
    sort: parseOneOf(raw.sort, PROJECT_SORT_VALUES),
    page: parsePage(raw.page),
  };
}

export interface ClientsListSearch {
  q?: string;
  city?: string;
  status?: ClientStatus;
  openProjects?: YesNo;
  sort?: (typeof CLIENT_SORT_VALUES)[number];
  page?: number;
}

export function parseClientsListSearch(raw: Record<string, unknown>): ClientsListSearch {
  return {
    q: parseText(raw.q),
    city: parseValue(raw.city),
    status: parseOneOf(raw.status, CLIENT_STATUS_VALUES),
    openProjects: parseOneOf(raw.openProjects, YES_NO_VALUES),
    sort: parseOneOf(raw.sort, CLIENT_SORT_VALUES),
    page: parsePage(raw.page),
  };
}

export interface PropertiesListSearch {
  q?: string;
  city?: string;
  clientId?: string;
  activeProjects?: YesNo;
  sort?: (typeof PROPERTY_SORT_VALUES)[number];
  page?: number;
}

export function parsePropertiesListSearch(raw: Record<string, unknown>): PropertiesListSearch {
  return {
    q: parseText(raw.q),
    city: parseValue(raw.city),
    clientId: parseValue(raw.clientId),
    activeProjects: parseOneOf(raw.activeProjects, YES_NO_VALUES),
    sort: parseOneOf(raw.sort, PROPERTY_SORT_VALUES),
    page: parsePage(raw.page),
  };
}
