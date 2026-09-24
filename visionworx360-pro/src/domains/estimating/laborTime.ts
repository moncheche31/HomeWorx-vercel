/**
 * GLOBAL LABOR-TIME INVARIANT — quarter hours only.
 *
 * Every labor-hour value the estimator uses, writes, displays or prices from
 * must land on a 15-minute increment: .00, .25, .50, .75.
 *
 *   0.4 -> 0.50   0.6 -> 0.50   0.9 -> 1.00   1.4 -> 1.50   2.1 -> 2.00
 *
 * Standard nearest-quarter rounding: round(hours * 4) / 4. Internal
 * productivity math (hours-per-unit rates, production rates, multipliers) may
 * stay at full precision WHILE calculating, but the authoritative total hours
 * written to an estimate line are normalized BEFORE labor dollars are derived.
 *
 * This is labor time only. Quantities, measurements, percentages and the
 * whole-dollar money invariant are untouched.
 *
 * Pure module — no React, no IO.
 */

const finite = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** The only legal labor-time increment. */
export const QUARTER_HOUR = 0.25;

/**
 * Snap any hour value to the nearest quarter hour.
 *
 * Zero and negatives collapse to 0 — "no labor" stays "no labor". Any POSITIVE
 * amount of labor time is at least one quarter hour: nobody sends a crew for
 * six minutes, and rounding 0.1 hr down to zero would silently delete work the
 * contractor (or the catalog) said exists.
 */
export function roundQuarterHour(hours: unknown): number {
  const n = finite(hours);
  if (n <= 0) return 0;
  return Math.max(QUARTER_HOUR, Math.round(n * 4) / 4);
}

/** True when `hours` is already a legal quarter-hour value. */
export function isQuarterHour(hours: unknown): boolean {
  const n = finite(hours);
  return Number.isInteger(Math.round(n * 4 * 1e6) / 1e6);
}

/** Normalize a nullable hour field, preserving null/undefined. */
export function normalizeHours<T extends number | null | undefined>(
  hours: T,
): T extends number ? number : number | null {
  if (hours == null) return null as never;
  return roundQuarterHour(hours) as never;
}

/** Sum hour values that are already quarter-normalized. Stays on the grid. */
export function sumQuarterHours(values: readonly number[]): number {
  return roundQuarterHour(values.reduce((sum, v) => sum + roundQuarterHour(v), 0));
}
