/**
 * GLOBAL WHOLE-DOLLAR MONEY POLICY.
 *
 * VisionWorx360 Pro never quotes cents. Every monetary value produced by the
 * estimator — line extensions, direct cost, overhead, profit, contingency,
 * tax, fees, subtotals, grand totals, preliminary bands, selected selling
 * price, realized gross profit — is rounded to the nearest whole dollar using
 * standard half-up rounding ($0.50 rounds up).
 *
 * This is a CALCULATION rule, not a display rule: canonical outputs and saved
 * snapshots carry whole dollars, so screens, PDFs, proposals, exports and
 * recalculations always reconcile.
 *
 * NOT money and therefore untouched by this module: percentages, labor hours,
 * quantities, square footage, production rates, and internal per-unit rates
 * (which may keep cent precision so extensions stay accurate).
 *
 * Pure module — no React, no IO.
 */

const finite = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Nearest whole dollar, half-up, symmetric for negatives (-0.5 -> -1). */
export function roundMoney(value: unknown): number {
  const n = finite(value);
  if (n === 0) return 0;
  const rounded = n > 0 ? Math.round(n) : -Math.round(-n);
  return rounded === 0 ? 0 : rounded;
}

/** Alias used inside calculators for terseness. */
export const money = roundMoney;

/** Sum a list of monetary values; the result is whole dollars. */
export function sumMoney(values: readonly unknown[]): number {
  return roundMoney(values.reduce<number>((acc, v) => acc + finite(v), 0));
}

/** Percentage of a monetary base, itself expressed in whole dollars. */
export function moneyPct(base: unknown, percent: unknown): number {
  return roundMoney((finite(base) * finite(percent)) / 100);
}

/** True when the value carries no cents. */
export function isWholeDollars(value: unknown): boolean {
  return Number.isInteger(finite(value));
}
