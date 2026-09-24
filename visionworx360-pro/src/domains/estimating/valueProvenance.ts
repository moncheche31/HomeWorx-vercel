/**
 * Value provenance for estimate lines (Module 007A contract).
 *
 * The engine must keep these layers separate and never collapse them:
 *   localized benchmark cost | contractor-custom cost | live supplier price |
 *   allowance | estimate price snapshot | actual purchased cost
 *
 * The contractor can always override a suggested value; the suggestion is
 * retained alongside the override so variance and provenance stay auditable.
 */

export type CostValueOrigin =
  | "localized-benchmark"
  | "catalog-default"
  | "contractor-custom"
  | "supplier-live-price"
  | "allowance"
  | "price-snapshot"
  | "actual-purchase";

export interface ValuedCostField {
  /** Where the suggestion came from. */
  origin: CostValueOrigin;
  /** Suggested value from the source, before any contractor edit. */
  suggestedValue: number | null;
  /** Contractor-adjusted value, when overridden. */
  adjustedValue?: number | null;
  overrideReason?: string | null;
  source?: string | null;
  sourceVersion?: string | null;
  /** Localized location identifier the suggestion was resolved for. */
  costLocationId?: string | null;
  /** Timestamp of the price/suggestion (ISO 8601). */
  valueAt?: string | null;
}

/** The value actually used in math: override wins, suggestion otherwise. */
export function effectiveValue(field: ValuedCostField | null | undefined): number | null {
  if (!field) return null;
  return field.adjustedValue ?? field.suggestedValue ?? null;
}

export function isOverridden(field: ValuedCostField | null | undefined): boolean {
  return !!field && field.adjustedValue != null && field.adjustedValue !== field.suggestedValue;
}
