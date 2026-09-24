/**
 * Small job / handyman economics.
 *
 * A door swap is not "1/40th of a kitchen". Small work carries fixed costs the
 * quantity never sees: driving there, unloading, protecting the floor, setting
 * up, cleaning up, hauling the old fixture away and writing the invoice. A
 * ballpark that simply multiplies a unit price by a tiny quantity produces a
 * number no contractor would ever accept, so this layer applies the same
 * service-call economics a real shop uses.
 *
 * Applies ONLY below the small-job threshold, so full remodels are untouched.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import type { BallparkBand } from "./plausibility";
import { roundMoney as money } from "@/domains/estimating/money";

/** Above this expected value the job carries its own overhead; no adders. */
export const SMALL_JOB_THRESHOLD = 3500;

/** Trip / mobilization: truck, drive time, materials run, invoicing. */
export const MOBILIZATION_FEE = 95;

/** Setup, floor protection, cleanup and disposal on any small job. */
export const SETUP_CLEANUP_HOURS = 1;

/** No skilled trade shows up for less than this many billable hours. */
export const MINIMUM_LABOR_HOURS = 2;

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface SmallJobAdjustment {
  /** i18n key under the `estimating` namespace. */
  key: "mobilization" | "setupCleanup" | "serviceCallMinimum";
  amount: number;
}

export interface SmallJobResult {
  band: BallparkBand;
  isSmallJob: boolean;
  /** Floor applied to every point in the band. */
  minimumCharge: number;
  adjustments: SmallJobAdjustment[];
}

/** The least a contractor can invoice for showing up at all. */
export function serviceCallMinimum(laborRate: number, markupPct = 20): number {
  const labor = Math.max(0, num(laborRate)) * MINIMUM_LABOR_HOURS;
  return money((labor + MOBILIZATION_FEE) * (1 + Math.max(0, markupPct) / 100));
}

/**
 * Apply mobilization and service-call minimums to a small-job ballpark band.
 * Large jobs pass through untouched and byte-identical.
 */
export function applySmallJobEconomics(
  band: BallparkBand,
  options: { laborRate: number; markupPct?: number; threshold?: number },
): SmallJobResult {
  const threshold = options.threshold ?? SMALL_JOB_THRESHOLD;
  const expected = num(band.expected);
  if (expected <= 0 || expected >= threshold) {
    return { band, isSmallJob: false, minimumCharge: 0, adjustments: [] };
  }

  const markupPct = options.markupPct ?? 20;
  const uplift = 1 + Math.max(0, markupPct) / 100;
  const rate = Math.max(0, num(options.laborRate));
  const mobilization = money(MOBILIZATION_FEE * uplift);
  const setup = money(rate * SETUP_CLEANUP_HOURS * uplift);
  const adder = money(mobilization + setup);
  const minimum = serviceCallMinimum(rate, markupPct);

  const lift = (v: number) => money(Math.max(minimum, num(v) + adder));
  const low = lift(band.low);
  const mid = Math.max(low, lift(band.expected));
  const high = Math.max(mid, lift(band.high));

  return {
    band: { low, expected: mid, high },
    isSmallJob: true,
    minimumCharge: minimum,
    adjustments: [
      { key: "mobilization", amount: mobilization },
      { key: "setupCleanup", amount: setup },
      { key: "serviceCallMinimum", amount: minimum },
    ],
  };
}
