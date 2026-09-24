/**
 * Bridge: Estimate Review (Module 013) recommendations → range adjustments.
 *
 * Deterministic and read-only. Accepted upsells widen the range; accepted
 * value-engineering options reduce it. Everything else is informational.
 *
 * Two safety rules exist because accepted value-engineering options are
 * usually ALTERNATIVES, not cumulative savings:
 *  1. Competing options in the same family (countertops, cabinets, flooring…)
 *     collapse to a single adjustment — the largest saving in the family.
 *  2. A single option may never claim more than `MAX_OPTION_SAVINGS_PCT`.
 * The engine additionally caps the combined reduction (`capAdjustments`).
 */

import type { RangeAdjustment } from "./types";

export interface BridgeRecommendation {
  id: string;
  sectionKey: string;
  customerLabel: string;
  label: string;
  /** Catalog key, e.g. `ve.countertop.laminate`. Used to group alternatives. */
  itemKey?: string | null;
  typicalPriceRange?: { low: number; high: number } | null;
  valueEngineering?: { savingsPct: number } | undefined;
}

/** No single value-engineering option may claim more than this of the total. */
export const MAX_OPTION_SAVINGS_PCT = 15;

/** Family key for competing alternatives: `ve.countertop.laminate` → `ve.countertop`. */
function familyKey(rec: BridgeRecommendation): string {
  const key = rec.itemKey?.trim();
  if (!key) return `id:${rec.id}`;
  const parts = key.split(".");
  return parts.length > 2 ? parts.slice(0, 2).join(".") : key;
}

/**
 * @param accepted recommendations the contractor accepted
 * @param baseMid  midpoint used to size percentage-based savings
 */
export function recommendationsToAdjustments(
  accepted: BridgeRecommendation[],
  baseMid: number,
): RangeAdjustment[] {
  const out: RangeAdjustment[] = [];
  const bestInFamily = new Map<string, RangeAdjustment>();

  for (const rec of accepted) {
    if (rec.sectionKey === "upsell" && rec.typicalPriceRange) {
      out.push({
        id: rec.id,
        label: rec.customerLabel || rec.label,
        kind: "add",
        low: Math.max(0, Math.round(rec.typicalPriceRange.low)),
        high: Math.max(0, Math.round(rec.typicalPriceRange.high)),
      });
      continue;
    }
    if (rec.sectionKey === "value_engineering" && rec.valueEngineering) {
      const pct = Math.max(
        0,
        Math.min(MAX_OPTION_SAVINGS_PCT, rec.valueEngineering.savingsPct),
      );
      const mid = Math.max(0, baseMid) * (pct / 100);
      const adjustment: RangeAdjustment = {
        id: rec.id,
        label: rec.customerLabel || rec.label,
        kind: "reduce",
        low: Math.round(mid * 0.7),
        high: Math.round(mid * 1.1),
      };
      const family = familyKey(rec);
      const current = bestInFamily.get(family);
      if (!current || adjustment.high > current.high) bestInFamily.set(family, adjustment);
    }
  }

  return [...out, ...bestInFamily.values()];
}
