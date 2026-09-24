/**
 * "Use Previous Project as Template" — the copy contract.
 *
 * Product invariant: a prior project can NEVER influence a new project
 * automatically. Prior-project data enters a new project only when the
 * contractor explicitly selects a source estimate and confirms what to copy.
 * This module is the single place that says WHAT may travel between projects,
 * so the current-project isolation architecture stays enforceable and testable.
 *
 * Pure: no React, no Supabase, no i18n, no network.
 */

export interface EstimateCopyOptions {
  /** Scope sections + items (structure, quantities, finish selections). */
  copyScope: boolean;
  /** Estimate line items / assemblies. */
  copyLines: boolean;
  /** Quantities and units. Off means every copied line starts at 1. */
  copyQuantities: boolean;
  /** Labor hours + rates, material, equipment, subcontractor, other costs. */
  copyPricing: boolean;
  /** Markup: overhead, profit, contingency. */
  copyMarkup: boolean;
  /** Assumptions, exclusions, internal notes, proposal notes. */
  copyAssumptions: boolean;
}

export const DEFAULT_ESTIMATE_COPY_OPTIONS: EstimateCopyOptions = {
  copyScope: true,
  copyLines: true,
  copyQuantities: true,
  copyPricing: true,
  copyMarkup: true,
  copyAssumptions: true,
};

export function normalizeCopyOptions(
  input: Partial<EstimateCopyOptions> | null | undefined,
): EstimateCopyOptions {
  return { ...DEFAULT_ESTIMATE_COPY_OPTIONS, ...(input ?? {}) };
}

/**
 * Data that must NEVER cross a project boundary through this feature, no
 * matter what the contractor selects. Transactional, identity and history
 * data belongs to the job it happened on.
 */
export const NEVER_COPIED_FIELDS = [
  "clientId",
  "clientName",
  "clientEmail",
  "clientPhone",
  "propertyId",
  "addressLine1",
  "city",
  "region",
  "postalCode",
  "signature",
  "acceptedAt",
  "declinedAt",
  "sentAt",
  "approvedAt",
  "approvedBy",
  "lockedAt",
  "payments",
  "invoices",
  "contractAcceptance",
  "permitNumber",
  "projectDates",
  "targetCompletion",
  "communications",
  "auditHistory",
  "measurements",
  "media",
  "photos",
  "proposalShares",
  "changeRequests",
] as const;

export type NeverCopiedField = (typeof NEVER_COPIED_FIELDS)[number];

const NEVER_COPIED = new Set<string>(NEVER_COPIED_FIELDS);

/** True when a field is allowed to be carried into the new project. */
export function isCopyableField(field: string): boolean {
  return !NEVER_COPIED.has(field);
}

/**
 * Strips every never-copied field from an arbitrary payload. Used as the
 * boundary for both project-to-project copy and (future) promotion of an
 * estimate into a clean, reusable company template.
 */
export function sanitizeForTemplate<T extends Record<string, unknown>>(
  payload: T,
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (isCopyableField(key)) out[key] = value;
  }
  return out as Partial<T>;
}

/** Internal provenance recorded on the copied estimate. */
export interface CopyProvenance {
  sourceEstimateId: string;
  sourceProjectId: string;
  /** "Jackie's Kitchen — 2026-08-12". */
  label: string;
  /** ISO date of the source estimate. */
  sourceDatedAt: string | null;
}

export function buildCopyProvenanceLabel(
  projectName: string | null | undefined,
  datedAtIso: string | null | undefined,
): string {
  const name = (projectName ?? "").trim() || "previous project";
  const date = (datedAtIso ?? "").slice(0, 10);
  return date ? `${name} — ${date}` : name;
}

/** How the copied pricing is currently being treated. */
export type PricingCopyMode = "copied" | "refreshed";

export function normalizePricingCopyMode(value: unknown): PricingCopyMode | null {
  return value === "copied" || value === "refreshed" ? value : null;
}

/**
 * Copied prices are contractor-authoritative from the moment they land, so no
 * load/reopen path may silently reprice them. Only a line still holding an
 * untouched copied price is eligible when the contractor asks for a refresh —
 * a line they edited is stamped `contractor` and is preserved.
 */
export function isPricingRefreshEligible(line: {
  pricingSource: string | null | undefined;
}): boolean {
  return line.pricingSource === "copied";
}

/** Lines a "Refresh current pricing" action would actually re-price. */
export function refreshableLineIds(
  lines: { id: string; pricingSource: string | null | undefined }[],
): string[] {
  return lines.filter(isPricingRefreshEligible).map((l) => l.id);
}
