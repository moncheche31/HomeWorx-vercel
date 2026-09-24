/**
 * Copy-on-write override resolution (Module 008).
 *
 * Contractors may override labor rate, material price, waste, production rate,
 * crew size, markup and profit. Overrides are stored SEPARATELY from the
 * Knowledge Base / catalog record and are applied at resolution time — the
 * master record is never mutated.
 */

import type { ValueProvenance, ValueSource } from "./engine/types";

export const OVERRIDABLE_FIELDS = [
  "laborRate",
  "materialCost",
  "wasteFactorPct",
  "productionRate",
  "laborHoursPerUnit",
  "crewSize",
  "overheadPct",
  "profitPct",
  "contingencyPct",
  "equipmentCost",
  "subcontractorCost",
] as const;

export type OverridableField = (typeof OVERRIDABLE_FIELDS)[number];

export type OverrideMap = Partial<Record<OverridableField, number | null>>;

export interface ResolvedOverrides<T> {
  /** Values to use in math (base merged with overrides). */
  values: T;
  /** Provenance per field: user-override when overridden, base source otherwise. */
  provenance: Record<string, ValueProvenance>;
  overriddenFields: OverridableField[];
}

/**
 * Merge overrides onto a base record without mutating either input.
 * `baseSource` describes where the untouched values came from.
 */
export function resolveOverrides<T extends Record<string, unknown>>(
  base: T,
  overrides: OverrideMap | null | undefined,
  baseSource: ValueSource = "knowledge-base",
  baseMeta: Partial<ValueProvenance> = {},
): ResolvedOverrides<T> {
  const values: Record<string, unknown> = { ...base };
  const provenance: Record<string, ValueProvenance> = {};
  const overriddenFields: OverridableField[] = [];

  for (const field of OVERRIDABLE_FIELDS) {
    const baseValue = base[field];
    const suggested = typeof baseValue === "number" ? baseValue : null;
    const override = overrides?.[field];

    if (override != null && override !== suggested) {
      values[field] = override;
      overriddenFields.push(field);
      provenance[field] = {
        source: "user-override",
        suggestedValue: suggested,
        valueAt: new Date().toISOString(),
      };
    } else if (suggested != null) {
      provenance[field] = { source: baseSource, suggestedValue: suggested, ...baseMeta };
    }
  }

  return { values: values as T, provenance, overriddenFields };
}

export function isOverridden(
  resolved: ResolvedOverrides<unknown>,
  field: OverridableField,
): boolean {
  return resolved.overriddenFields.includes(field);
}
