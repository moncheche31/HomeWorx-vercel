/**
 * Ballpark engine versioning.
 *
 * A saved ballpark snapshot is a frozen output of a specific pricing and
 * inference engine. When that engine learns to price work it previously
 * reported as an unpriced blocker (permits, code-required protection,
 * structural sizing, transitions), a snapshot produced by the older engine is
 * not merely old — it is WRONG about what the estimate can price.
 *
 * The version stamp makes that detectable without a schema change: an editable
 * ballpark whose snapshot predates the current engine is recomputed from the
 * current active scope the next time it is opened, and a snapshot already at
 * the current version is never rewritten (no churn, no recalc loop).
 *
 * Bump this ONLY when the engine's pricing/inference output changes in a way
 * that should retroactively replace already-saved editable snapshots.
 *
 * Pure: no React, no network, no i18n.
 */

/**
 * Current ballpark pricing/inference engine version.
 *
 * 3 — canonical assemblies: base and wall cabinetry price as distinct
 *     subjects, single-device relocations no longer resolve to the whole-room
 *     electrical package, and ballpark rates mirror the Knowledge Base.
 * 4 — structural / finish-carpentry primitives: bearing-wall demo, temporary
 *     shoring, LVL span, posts and the engineering allowance price separately,
 *     beam/column wraps and built-in casework are their own subjects, and a
 *     measured total is never reinterpreted as a count.
 */
export const BALLPARK_ENGINE_VERSION = 4;


/** Version stamped on a snapshot; unstamped legacy snapshots read as 1. */
export function ballparkSnapshotVersion(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== "object") return 0;
  const raw = (snapshot as Record<string, unknown>).engineVersion;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * True when a saved ballpark snapshot was produced by an older engine and must
 * be recomputed before the contractor is shown its conclusions.
 */
export function isBallparkSnapshotStale(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  return ballparkSnapshotVersion(snapshot) < BALLPARK_ENGINE_VERSION;
}
