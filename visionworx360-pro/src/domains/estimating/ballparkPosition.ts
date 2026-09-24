/**
 * Ballpark BAND POSITION (Low / Recommended / High).
 *
 * A preliminary ballpark is ONE estimate of ONE scope carrying an uncertainty
 * range. The contractor may sell that same scope anywhere inside the range:
 * Low, Recommended (the expected value) or High. That choice is a PRICE
 * POSITION, never a scope, quantity or finish-quality change.
 *
 * Deliberately distinct from `PreliminaryLevel` (economy / recommended /
 * premium) in `preliminaryLevels.ts`, which models FINISH/ALLOWANCE quality
 * packages. Conflating the two is what made the range feel "stuck on
 * Recommended": keep the vocabularies separate.
 *
 * Pure and trade-agnostic: no React, no Supabase, no i18n, no IO.
 */

export type BallparkBandPosition = "low" | "expected" | "high";

export const BALLPARK_BAND_POSITIONS: readonly BallparkBandPosition[] = [
  "low",
  "expected",
  "high",
] as const;

/** With no explicit contractor choice the recommended (expected) value stands. */
export const DEFAULT_BALLPARK_BAND_POSITION: BallparkBandPosition = "expected";

export interface BallparkBand {
  low: number;
  expected: number;
  high: number;
}

export function isBallparkBandPosition(value: unknown): value is BallparkBandPosition {
  return value === "low" || value === "expected" || value === "high";
}

const isBallparkShape = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return o.kind === "ballpark" || o.mode === "ballpark";
};

/**
 * The contractor's persisted position, from the ballpark snapshot at the top
 * level or preserved under `ballpark` after a detailed conversion.
 */
export function readBallparkBandPosition(snapshot: unknown): BallparkBandPosition {
  if (!snapshot || typeof snapshot !== "object") return DEFAULT_BALLPARK_BAND_POSITION;
  const snap = snapshot as Record<string, unknown>;
  if (isBallparkShape(snap) && isBallparkBandPosition(snap.selectedBandPosition)) {
    return snap.selectedBandPosition;
  }
  const nested = snap.ballpark;
  if (isBallparkShape(nested) && isBallparkBandPosition((nested as Record<string, unknown>).selectedBandPosition)) {
    return (nested as Record<string, unknown>).selectedBandPosition as BallparkBandPosition;
  }
  return DEFAULT_BALLPARK_BAND_POSITION;
}

/** The selling price the contractor selected, inside the saved band. */
export function priceForBandPosition(
  band: BallparkBand,
  position: BallparkBandPosition,
): number {
  const value = band[position];
  return typeof value === "number" && Number.isFinite(value) ? value : band.expected;
}

/**
 * Stamp the position onto the snapshot WITHOUT touching the band, assumptions,
 * quantities, confidence or any other evidence. Returns a new object; the input
 * is never mutated. A snapshot with no ballpark band is returned unchanged.
 */
export function applyBallparkBandPosition(
  snapshot: unknown,
  position: BallparkBandPosition,
): unknown {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const snap = snapshot as Record<string, unknown>;
  if (isBallparkShape(snap)) return { ...snap, selectedBandPosition: position };
  if (isBallparkShape(snap.ballpark)) {
    return {
      ...snap,
      ballpark: { ...(snap.ballpark as Record<string, unknown>), selectedBandPosition: position },
    };
  }
  return snapshot;
}
