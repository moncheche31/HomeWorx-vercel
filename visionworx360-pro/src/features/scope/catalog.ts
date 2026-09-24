import type {
  ScopeAction,
  ScopeCompletion,
  ScopeConfidence,
  ScopePriority,
  ScopeUnit,
} from "./types";

export const SCOPE_UNITS: ScopeUnit[] = [
  "each","linear_foot","square_foot","cubic_foot","cubic_yard","sheet","board_foot",
  "gallon","pound","hour","day","allowance","lump_sum","other",
];

export const SCOPE_ACTIONS: ScopeAction[] = [
  "install","remove","replace","repair","refinish","paint","clean","relocate",
  "modify","build","inspect","protect","supply_only","labor_only","other",
];

export const SCOPE_CONFIDENCES: ScopeConfidence[] = [
  "confirmed","needs_verification","assumed","customer_decision_required","not_applicable",
];

export const SCOPE_COMPLETIONS: ScopeCompletion[] = [
  "draft","ready","approved","deferred","completed",
];

/**
 * Statuses surfaced in the v2 authoring UI. The database enum keeps the wider
 * legacy set (`approved`, `deferred`) so existing rows stay valid and readable.
 */
export const SCOPE_PRIMARY_STATUSES: ScopeCompletion[] = ["draft", "ready", "completed"];

export const SCOPE_PRIORITIES: ScopePriority[] = ["low", "normal", "high", "urgent"];

export const SCOPE_TRADES = [
  "general","carpentry","plumbing","electrical","hvac","drywall","painting",
  "flooring","tile","roofing","siding","masonry","concrete","insulation",
  "countertops","cabinets","landscaping","other",
] as const;

export const SCOPE_SECTION_KEYS = [
  "demolition","framing","structural","insulation","drywall","flooring",
  "cabinets","countertops","plumbing","electrical","hvac","painting","trim",
  "windows_doors","roofing","siding","masonry","exterior","fixtures",
  "appliances","site_work","permits","cleanup","general_conditions","other",
] as const;

/** Work-classification taxonomy (independent of trade). */
export const SCOPE_CATEGORIES = [
  "site_prep","structural","envelope","interior_finishes","mechanical",
  "electrical","plumbing","fixtures_appliances","exterior","admin","other",
] as const;

export type ScopeCategoryKey = (typeof SCOPE_CATEGORIES)[number];

export const SCOPE_SUBCATEGORIES: Record<ScopeCategoryKey, readonly string[]> = {
  site_prep: ["protection", "demolition", "debris_removal", "temporary_services"],
  structural: ["foundation", "framing", "beams_headers", "reinforcement"],
  envelope: ["roofing", "siding", "windows_doors", "insulation", "waterproofing"],
  interior_finishes: ["drywall", "paint", "flooring", "tile", "trim", "cabinets", "countertops"],
  mechanical: ["hvac_equipment", "ductwork", "ventilation"],
  electrical: ["service_panel", "rough_in", "devices", "lighting"],
  plumbing: ["supply", "drainage", "gas", "fixtures_rough_in"],
  fixtures_appliances: ["appliances", "plumbing_fixtures", "hardware", "specialty"],
  exterior: ["decking", "concrete_flatwork", "fencing", "landscaping"],
  admin: ["permits", "engineering", "inspections", "general_conditions"],
  other: ["other"],
} as const;

export function subcategoriesFor(categoryKey: string | null | undefined): readonly string[] {
  if (!categoryKey) return [];
  return SCOPE_SUBCATEGORIES[categoryKey as ScopeCategoryKey] ?? [];
}
