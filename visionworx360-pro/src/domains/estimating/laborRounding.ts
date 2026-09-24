/**
 * Labor rate normalization and extended-amount display rounding.
 *
 * Contractors quote clean numbers. A blended rate of $63.24/hr and a line
 * extension of $632.40 both read like a spreadsheet accident, so:
 *
 *  1. RATES are normalized to the nearest $0.05 BEFORE any math runs, so the
 *     rate shown is the rate used ($63.24 -> $63.25).
 *  2. HOURS stay the source quantity. Nothing here ever back-solves hours from
 *     a rounded dollar figure.
 *  3. RAW extension = hours x normalized rate. This is the calculation value.
 *  4. DISPLAY extension = raw extension rounded UP to the next whole dollar
 *     ($632.40 -> $633; $633.00 stays $633).
 *
 * Display rounding never feeds back into hours or unit rates: every rollup
 * sums the per-task DISPLAY amounts, so Tasks, Trades and Project agree
 * exactly at both raw and displayed precision.
 *
 * Pure module — no React, no IO.
 */
import { roundQuarterHour } from "./laborTime";

const finite = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Money precision used for raw (calculation) values. */
export const round2 = (v: number): number => Math.round(finite(v) * 100) / 100;

/** Rates are quoted and calculated on a $0.05 grid. */
export const LABOR_RATE_INCREMENT = 0.05;

/** $63.24 -> $63.25. Negative or non-finite input collapses to 0. */
export function normalizeLaborRate(rate: unknown): number {
  const n = finite(rate);
  if (n <= 0) return 0;
  return round2(Math.round(n / LABOR_RATE_INCREMENT) * LABOR_RATE_INCREMENT);
}

/** hours x normalized rate, at cent precision. The calculation value. */
export function rawLaborExtension(hours: unknown, rate: unknown): number {
  /* Hours are always billed on the quarter-hour grid before money is derived. */
  return round2(roundQuarterHour(hours) * normalizeLaborRate(rate));
}

/**
 * The displayed extended labor amount: always up to the next whole dollar.
 * Exact whole dollars are left alone; cents-level float noise is discarded
 * before the ceiling so 632.9999999 does not become 634.
 */
export function displayLaborExtension(amount: unknown): number {
  const cents = Math.round(finite(amount) * 100);
  if (cents <= 0) return 0;
  return Math.ceil(cents / 100);
}

/** hours -> normalized rate -> raw extension -> displayed whole dollars. */
export function laborExtension(
  hours: unknown,
  rate: unknown,
): { rate: number; raw: number; display: number } {
  const normalizedRate = normalizeLaborRate(rate);
  const raw = rawLaborExtension(hours, normalizedRate);
  return { rate: normalizedRate, raw, display: displayLaborExtension(raw) };
}

/** Sum of already-displayed amounts. Rollups add whole dollars, never re-ceil. */
export function sumDisplayLabor(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + displayLaborExtension(v), 0);
}
