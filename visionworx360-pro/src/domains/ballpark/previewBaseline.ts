/**
 * Which band the refinement screen is allowed to show.
 *
 * Re-opening the interview is NOT a pricing event. The current saved snapshot
 * (whatever wrote it last — intake or the scope-derived recalculation) stays
 * the baseline until the contractor actually changes a fact, and it is only
 * replaced in the database when they explicitly accept the refined preview.
 *
 * History (`previous`, `originalBallpark`) is audit material and is never read
 * here: an older band must never come back just because a newer one exists.
 *
 * Pure: no React, no network, no i18n.
 */

export interface BallparkBandLike {
  low: number;
  expected: number;
  high: number;
}

function isBand(value: unknown): value is BallparkBandLike {
  if (!value || typeof value !== "object") return false;
  const band = value as Record<string, unknown>;
  return (["low", "expected", "high"] as const).every(
    (key) => typeof band[key] === "number" && Number.isFinite(band[key] as number),
  );
}

/**
 * The band of the CURRENT saved snapshot. Reads `snapshot.band` only — never
 * `previous` and never `originalBallpark`.
 */
export function currentBallparkBand(snapshot: unknown): BallparkBandLike | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const band = (snapshot as Record<string, unknown>).band;
  return isBand(band) ? { low: band.low, expected: band.expected, high: band.high } : null;
}

export interface PreviewBandInput {
  /** The current active editable snapshot, exactly as stored. */
  savedSnapshot: unknown;
  /** The band the interview engine just computed from current answers. */
  computedBand: BallparkBandLike;
  /** True only when an answer that can move pricing actually changed. */
  factsChanged: boolean;
  /** Current scope/question schema identity. */
  schemaKey?: string | null;
  /** Schema identity that produced the saved interview/range. */
  savedSchemaKey?: string | null;
}

export interface PreviewBandResult {
  /** The band to display. */
  band: BallparkBandLike;
  /** The current saved band, for reference (null when nothing is saved yet). */
  savedBand: BallparkBandLike | null;
  /** True when what is displayed is an uncommitted refinement of the saved band. */
  isPreview: boolean;
  /** Which source supplied the saved baseline before any uncommitted preview. */
  source: "estimate" | "session" | "computed";
}

export interface BallparkBaselineInput {
  /** Current snapshot from the known estimate being refined. */
  estimateSnapshot: unknown;
  /** Durable interview snapshot; answers may be newer even when this range is stale. */
  sessionSnapshot: unknown;
  /** The band freshly computed from the hydrated interview answers. */
  computedBand: BallparkBandLike;
  /** True only when an answer that can move pricing actually changed. */
  factsChanged: boolean;
  /** Current scope/question schema identity. */
  schemaKey?: string | null;
  /** Schema identity that produced the durable session snapshot. */
  savedSchemaKey?: string | null;
}

/**
 * The sole source-of-truth resolver for refinement.
 *
 * A known estimate always owns pricing. The durable session owns interview
 * continuity, not the range, and is considered only when no estimate snapshot
 * exists (for example a standalone Quick Ballpark). History is never read.
 */
export function resolveBallparkBaseline({
  estimateSnapshot,
  sessionSnapshot,
  computedBand,
  factsChanged,
  schemaKey,
  savedSchemaKey,
}: BallparkBaselineInput): PreviewBandResult {
  const schemaChanged = Boolean(schemaKey && savedSchemaKey && schemaKey !== savedSchemaKey);
  const estimateBand = currentBallparkBand(estimateSnapshot);
  const sessionBand = schemaChanged ? null : currentBallparkBand(sessionSnapshot);
  const savedBand = estimateBand ?? sessionBand;
  const source = estimateBand ? "estimate" : sessionBand ? "session" : "computed";

  if (!savedBand) return { band: computedBand, savedBand: null, isPreview: false, source };
  if (!factsChanged && !schemaChanged) return { band: savedBand, savedBand, isPreview: false, source };
  return { band: computedBand, savedBand, isPreview: true, source };
}

/** Resolve what the results screen shows without committing anything. */
export function resolvePreviewBand({
  savedSnapshot,
  computedBand,
  factsChanged,
  schemaKey,
  savedSchemaKey,
}: PreviewBandInput): PreviewBandResult {
  return resolveBallparkBaseline({
    estimateSnapshot: savedSnapshot,
    sessionSnapshot: null,
    computedBand,
    factsChanged,
    schemaKey,
    savedSchemaKey,
  });
}
