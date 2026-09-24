/**
 * Binding a captured measurement to the estimate line that asked for it.
 *
 * The estimating engine refuses to price a line whose quantity was never
 * measured. This module is the only place that turns a captured measurement
 * (spoken, typed, plan) into a quantity in the LINE's unit of measure — and it
 * refuses just as loudly when the shape of the measurement cannot answer the
 * question the line is asking (a single length cannot become square footage).
 *
 * Pure. No React, no Supabase, no i18n, no IO.
 */

import type { MeasurementItem } from "@/domains/measurementCapture";

const INCHES_PER_FOOT = 12;

/** What kind of number the line needs before it can be priced. */
export type MeasurementNeed = "area" | "length" | "count" | "volume" | "unsupported";

export function measurementNeedFor(unitKey: string | null): MeasurementNeed {
  switch (unitKey) {
    case "square_foot":
    case "square_yard":
    case "square":
    case "sheet":
      return "area";
    case "linear_foot":
    case "board_foot":
      return "length";
    case "each":
      return "count";
    case "cubic_foot":
    case "cubic_yard":
      return "volume";
    default:
      return "unsupported";
  }
}

export interface BoundQuantity {
  quantity: number;
  /** Human-auditable derivation, stored as the quantity basis note. */
  formula: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Convert one measurement into the line's unit, or return null when the
 * measurement cannot honestly answer it. Never guesses a missing dimension.
 */
export function quantityFromMeasurement(
  unitKey: string | null,
  item: Pick<MeasurementItem, "kind" | "inches" | "secondaryInches" | "display">,
): BoundQuantity | null {
  const need = measurementNeedFor(unitKey);
  const feet = item.inches / INCHES_PER_FOOT;
  const secondaryFeet =
    item.secondaryInches == null ? null : item.secondaryInches / INCHES_PER_FOOT;

  if (need === "area") {
    if (item.kind !== "pair" || secondaryFeet == null) return null;
    const sqft = round2(feet * secondaryFeet);
    if (sqft <= 0) return null;
    if (unitKey === "square_yard") {
      return { quantity: round2(sqft / 9), formula: `${item.display} = ${sqft} sq ft / 9` };
    }
    if (unitKey === "square") {
      return { quantity: round2(sqft / 100), formula: `${item.display} = ${sqft} sq ft / 100` };
    }
    if (unitKey === "sheet") {
      return { quantity: Math.ceil(sqft / 32), formula: `${item.display} = ${sqft} sq ft / 32 sq ft per sheet` };
    }
    return { quantity: sqft, formula: `${item.display} = ${sqft} sq ft` };
  }

  if (need === "length") {
    if (item.kind !== "single") return null;
    const lf = round2(feet);
    if (lf <= 0) return null;
    return { quantity: lf, formula: `${item.display} = ${lf} lf` };
  }

  /* Counts and volumes are not derivable from a single captured dimension. */
  return null;
}

/** Pick the first captured measurement that can answer the line, if any. */
export function selectBindableMeasurement<
  T extends Pick<MeasurementItem, "kind" | "inches" | "secondaryInches" | "display">,
>(unitKey: string | null, items: readonly T[]): { item: T; bound: BoundQuantity } | null {
  for (const item of items) {
    const bound = quantityFromMeasurement(unitKey, item);
    if (bound) return { item, bound };
  }
  return null;
}
