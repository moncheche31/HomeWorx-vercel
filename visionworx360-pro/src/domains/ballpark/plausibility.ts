/**
 * Ballpark plausibility policy — "fast and appropriately ranged, never careless".
 *
 * A ballpark is allowed to be a range. It is NOT allowed to be a useless one.
 * A realistically $60K project must not be quoted at $10K–$120K just because a
 * few line-item quantities were inferred, and it must not be quoted at
 * $59.9K–$60.1K when the evidence is thin.
 *
 * So the band width is governed by a deterministic policy instead of by an
 * unbounded sum of per-assumption widening:
 *
 *  - uncertainty is RELATIVE and SIZE-AWARE (a $6K bath tolerates a wider
 *    percentage than a $300K addition);
 *  - better evidence (dimensions, priced coverage, contractor corrections,
 *    known finish tier, media) narrows the allowed spread;
 *  - sparse evidence widens it, but never past a pathological ceiling;
 *  - the band is never narrower than the floor, so the engine can't fake
 *    precision it does not have.
 *
 * Pure module — no React, no IO, no i18n. Same inputs ⇒ same numbers.
 */

/** Everything the plausibility policy is allowed to look at. */
import { roundBand } from "@/domains/estimating";
import { roundMoney as money } from "@/domains/estimating/money";

export interface BallparkEvidence {
  /** Real length/width (or a measured floor area) is known. */
  hasDimensions: boolean;
  /** A finish/material tier was stated rather than defaulted. */
  hasFinishTier?: boolean;
  /** Priced scope subjects (assemblies/lines) behind the number. */
  pricedCount: number;
  /** Quantities derived from saved geometry. */
  derivedCount?: number;
  /** Quantities carried by a standard residential allowance. */
  allowanceCount?: number;
  /** Inferred quantities the contractor reviewed and corrected. */
  correctedCount?: number;
  /** Scope the ballpark could not price at all. */
  unpriceableCount?: number;
  /** Photos / video / drawings / renderings consumed as evidence. */
  mediaCount?: number;
}

export interface BallparkBand {
  low: number;
  expected: number;
  high: number;
}

/** Relative spread the policy considers reasonable at a given project size. */
export interface SpreadWindow {
  /** (high − low) / expected, minimum. */
  minRelSpread: number;
  /** (high − low) / expected, maximum. */
  maxRelSpread: number;
  /** Absolute dollar floor so tiny projects don't collapse to a point. */
  minAbsSpread: number;
}

/**
 * Base relative spread by project size. Bigger jobs carry more absolute
 * dollars of uncertainty but a smaller *percentage* of it: the assemblies
 * average out and the scope is better defined.
 */
const SIZE_BANDS: Array<{ upTo: number; base: number }> = [
  { upTo: 5_000, base: 0.46 },
  { upTo: 25_000, base: 0.38 },
  { upTo: 75_000, base: 0.32 },
  { upTo: 200_000, base: 0.26 },
  { upTo: Number.POSITIVE_INFINITY, base: 0.22 },
];

/** Hard ceiling: no evidence state justifies a wider planning range than this. */
export const MAX_REL_SPREAD = 0.72;
/** Hard floor: a ballpark is never presented tighter than this. */
export const MIN_REL_SPREAD = 0.10;
/** Small jobs still need a visible band. */
export const MIN_ABS_SPREAD = 1_200;

export function baseRelSpread(expected: number): number {
  const value = Number.isFinite(expected) ? Math.max(0, expected) : 0;
  return SIZE_BANDS.find((b) => value <= b.upTo)!.base;
}

/**
 * 0 = we know almost nothing, 1 = dimensions, priced coverage, a stated finish
 * tier, contractor corrections and visual evidence all present.
 *
 * Weighted so DIMENSIONS dominate: they are what separates "a bathroom" from
 * "this bathroom".
 */
export function evidenceCompleteness(evidence: BallparkEvidence): number {
  const priced = Math.max(0, evidence.pricedCount);
  const allowance = Math.max(0, evidence.allowanceCount ?? 0);
  const unpriceable = Math.max(0, evidence.unpriceableCount ?? 0);
  const corrected = Math.max(0, evidence.correctedCount ?? 0);
  const media = Math.max(0, evidence.mediaCount ?? 0);

  let score = 0;
  score += evidence.hasDimensions ? 0.4 : 0;
  score += evidence.hasFinishTier ? 0.1 : 0;
  /* How much of the priced scope rests on a generic allowance vs a real quantity. */
  const allowanceRatio = priced > 0 ? Math.min(1, allowance / priced) : 1;
  score += 0.25 * (1 - allowanceRatio);
  /* Scope depth: a two-line ballpark is thinner evidence than a 40-line one. */
  score += 0.1 * Math.min(1, priced / 20);
  score += 0.1 * Math.min(1, corrected / 4);
  score += 0.05 * Math.min(1, media / 4);
  /* Anything the engine could not price at all is a real hole. */
  score -= 0.12 * Math.min(1, unpriceable / 3);

  return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}

/** The spread window this project size + evidence state earns. */
export function spreadWindow(expected: number, evidence: BallparkEvidence): SpreadWindow {
  const base = baseRelSpread(expected);
  const completeness = evidenceCompleteness(evidence);

  /* Thin evidence widens up to ~1.75x the base; strong evidence tightens to ~0.8x. */
  const maxRelSpread = clamp(base * (0.8 + 0.95 * (1 - completeness)), MIN_REL_SPREAD, MAX_REL_SPREAD);
  const minRelSpread = clamp(base * 0.42, MIN_REL_SPREAD, maxRelSpread);

  return {
    minRelSpread: round4(minRelSpread),
    maxRelSpread: round4(maxRelSpread),
    minAbsSpread: MIN_ABS_SPREAD,
  };
}

export interface PlausibilityIssue {
  code: "too-wide" | "too-narrow" | "unordered" | "non-positive";
  /** Actual relative spread, for diagnostics. */
  relSpread: number;
  limit: number;
}

export interface PlausibilityReport {
  ok: boolean;
  relSpread: number;
  window: SpreadWindow;
  completeness: number;
  issues: PlausibilityIssue[];
}

/** Deterministic verdict on whether a band is a defensible planning range. */
export function evaluateBandPlausibility(
  band: BallparkBand,
  evidence: BallparkEvidence,
): PlausibilityReport {
  const window = spreadWindow(band.expected, evidence);
  const completeness = evidenceCompleteness(evidence);
  const spread = band.high - band.low;
  const relSpread = band.expected > 0 ? round4(spread / band.expected) : 0;
  const issues: PlausibilityIssue[] = [];

  if (!(band.expected > 0) || !(band.low > 0)) {
    issues.push({ code: "non-positive", relSpread, limit: 0 });
  } else if (band.low > band.expected || band.expected > band.high) {
    issues.push({ code: "unordered", relSpread, limit: 0 });
  } else {
    if (relSpread > window.maxRelSpread + 1e-6) {
      issues.push({ code: "too-wide", relSpread, limit: window.maxRelSpread });
    }
    const floor = Math.max(window.minRelSpread * band.expected, window.minAbsSpread);
    if (spread + 1e-6 < floor) {
      issues.push({ code: "too-narrow", relSpread, limit: round4(floor / band.expected) });
    }
  }

  return { ok: issues.length === 0, relSpread, window, completeness, issues };
}

/**
 * Bring a band inside its plausibility window, preserving the expected value
 * and the engine's low/high asymmetry. This is the only place band widths are
 * corrected, so the interview path and the scope path can't drift.
 */
export function constrainBand(band: BallparkBand, evidence: BallparkEvidence): BallparkBand {
  const expected = money(band.expected);
  if (!(expected > 0)) return { low: money(band.low), expected, high: money(band.high) };

  const window = spreadWindow(expected, evidence);
  const low = Math.min(band.low, expected);
  const high = Math.max(band.high, expected);
  const spread = high - low;

  const maxSpread = window.maxRelSpread * expected;
  const minSpread = Math.max(window.minRelSpread * expected, window.minAbsSpread);
  const target = clamp(spread, minSpread, maxSpread);
  if (Math.abs(target - spread) < 0.5) {
    return { low: money(low), expected, high: money(high) };
  }

  /* Keep the shape of the original band: engines are usually skewed high. */
  const lowShare = spread > 0 ? (expected - low) / spread : 0.42;
  const nextLow = Math.max(0, expected - target * lowShare);
  const nextHigh = expected + target * (1 - lowShare);

  return { low: money(nextLow), expected, high: money(nextHigh) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const round4 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 10000) / 10000;

/**
 * Constrain, then round for presentation — and never let the rounding push the
 * band back outside its window. Both ballpark paths (interview and scope) end
 * here so a displayed band is always a policy-valid band.
 */
export function finalizeBallparkBand(
  raw: BallparkBand,
  evidence: BallparkEvidence,
): BallparkBand {
  const constrained = constrainBand(raw, evidence);
  const window = spreadWindow(constrained.expected, evidence);
  const maxSpread = window.maxRelSpread * constrained.expected;
  const minSpread = Math.max(window.minRelSpread * constrained.expected, window.minAbsSpread);

  let low = roundBand(constrained.low, "down");
  let high = roundBand(constrained.high, "up");
  if (high - low > maxSpread) {
    /* Outward rounding overshot: round inward instead. */
    const tightLow = roundBand(constrained.low, "up");
    const tightHigh = roundBand(constrained.high, "down");
    if (tightHigh - tightLow >= minSpread && tightLow < constrained.expected && tightHigh > constrained.expected) {
      low = tightLow;
      high = tightHigh;
    } else {
      low = money(constrained.low);
      high = money(constrained.high);
    }
  }
  return { low, expected: constrained.expected, high };
}
