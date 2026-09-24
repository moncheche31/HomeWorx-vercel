/**
 * Preliminary <-> final reconciliation.
 *
 * INVARIANT: for the same confirmed scope, quantities, quality level and
 * pricing settings, the preliminary recommended value and the final selling
 * price must resolve to the SAME cost model. A remaining difference is only
 * legitimate when an input actually changed, and when that happens the change
 * must be reported — never absorbed silently.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import type { PricingStrategy } from "./pricingStrategy";
import { roundMoney as money } from "./money";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Money within this percentage of the preliminary value counts as reconciled. */
export const RECONCILE_TOLERANCE_PCT = 0.5;

export type PricingDeltaReason =
  | { code: "no_preliminary" }
  | { code: "no_final" }
  | { code: "scope_added"; count: number }
  | { code: "scope_removed"; count: number }
  | { code: "quantity_changed"; count: number }
  | { code: "pricing_method_changed"; from: string; to: string }
  | { code: "margin_changed"; from: number; to: number }
  | { code: "markup_changed"; from: number; to: number }
  | { code: "labor_rate_changed"; from: number; to: number }
  | { code: "tax_changed"; from: number; to: number }
  | { code: "unexplained" };

export interface PricingReconciliation {
  preliminary: number | null;
  final: number | null;
  delta: number;
  deltaPct: number;
  /** True when the two values agree within tolerance. */
  reconciles: boolean;
  /** True when they disagree AND nothing explains it. This is a defect. */
  isUnexplained: boolean;
  reasons: PricingDeltaReason[];
}

export interface PricingInputsSnapshot {
  strategy: PricingStrategy;
  laborRate: number;
  taxRatePct: number;
  /** Ids of the scope/line subjects the number was priced from. */
  subjectIds?: string[];
  /** Quantity per subject id, for change detection. */
  quantities?: Record<string, number>;
}

function inputReasons(
  before: PricingInputsSnapshot | null,
  after: PricingInputsSnapshot | null,
): PricingDeltaReason[] {
  if (!before || !after) return [];
  const reasons: PricingDeltaReason[] = [];

  if (before.strategy.method !== after.strategy.method) {
    reasons.push({
      code: "pricing_method_changed",
      from: before.strategy.method,
      to: after.strategy.method,
    });
  } else if (after.strategy.method === "target_gross_margin") {
    if (round2(before.strategy.targetGrossMarginPct) !== round2(after.strategy.targetGrossMarginPct)) {
      reasons.push({
        code: "margin_changed",
        from: round2(before.strategy.targetGrossMarginPct),
        to: round2(after.strategy.targetGrossMarginPct),
      });
    }
  } else {
    const b = round2(before.strategy.overheadPct + before.strategy.profitPct);
    const a = round2(after.strategy.overheadPct + after.strategy.profitPct);
    if (b !== a) reasons.push({ code: "markup_changed", from: b, to: a });
  }

  if (round2(before.laborRate) !== round2(after.laborRate)) {
    reasons.push({
      code: "labor_rate_changed",
      from: round2(before.laborRate),
      to: round2(after.laborRate),
    });
  }
  if (round2(before.taxRatePct) !== round2(after.taxRatePct)) {
    reasons.push({
      code: "tax_changed",
      from: round2(before.taxRatePct),
      to: round2(after.taxRatePct),
    });
  }

  const beforeIds = new Set(before.subjectIds ?? []);
  const afterIds = new Set(after.subjectIds ?? []);
  if (beforeIds.size || afterIds.size) {
    const added = [...afterIds].filter((id) => !beforeIds.has(id));
    const removed = [...beforeIds].filter((id) => !afterIds.has(id));
    if (added.length) reasons.push({ code: "scope_added", count: added.length });
    if (removed.length) reasons.push({ code: "scope_removed", count: removed.length });
    const changed = [...afterIds].filter(
      (id) =>
        beforeIds.has(id) &&
        round2(num(before.quantities?.[id])) !== round2(num(after.quantities?.[id])),
    );
    if (changed.length) reasons.push({ code: "quantity_changed", count: changed.length });
  }

  return reasons;
}

/**
 * Compare the preliminary recommended value with the final selling price and
 * say — explicitly — whether the difference is explained.
 */
export function reconcilePreliminaryToFinal(input: {
  preliminary: number | null | undefined;
  final: number | null | undefined;
  preliminaryInputs?: PricingInputsSnapshot | null;
  finalInputs?: PricingInputsSnapshot | null;
  tolerancePct?: number;
}): PricingReconciliation {
  const preliminary = input.preliminary == null ? null : money(num(input.preliminary));
  const final = input.final == null ? null : money(num(input.final));
  const tolerancePct = input.tolerancePct ?? RECONCILE_TOLERANCE_PCT;

  if (preliminary == null || preliminary <= 0) {
    return {
      preliminary,
      final,
      delta: 0,
      deltaPct: 0,
      reconciles: true,
      isUnexplained: false,
      reasons: [{ code: "no_preliminary" }],
    };
  }
  if (final == null) {
    return {
      preliminary,
      final,
      delta: 0,
      deltaPct: 0,
      reconciles: false,
      isUnexplained: false,
      reasons: [{ code: "no_final" }],
    };
  }

  const delta = money(final - preliminary);
  const deltaPct = round2((delta / preliminary) * 100);
  const reconciles = Math.abs(deltaPct) <= tolerancePct;
  const reasons = reconciles
    ? []
    : inputReasons(input.preliminaryInputs ?? null, input.finalInputs ?? null);
  if (!reconciles && reasons.length === 0) reasons.push({ code: "unexplained" });

  return {
    preliminary,
    final,
    delta,
    deltaPct,
    reconciles,
    isUnexplained: !reconciles && reasons.some((r) => r.code === "unexplained"),
    reasons,
  };
}
