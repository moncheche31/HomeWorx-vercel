/**
 * Ballpark snapshot history.
 *
 * A ballpark band can be produced by two paths: the intake interview and the
 * scope-derived recalculation. Whichever writes last must never erase the
 * chain the other built — a stale intake re-run silently replacing corrected
 * scope pricing (and wiping `originalBallpark`) was a real pricing-integrity
 * regression.
 */

type Snapshot = Record<string, unknown>;

/** Strips a snapshot's own history so chains cannot grow without bound. */
export function stripBallparkHistory(snapshot: unknown): Snapshot | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const { previous: _previous, originalBallpark: _original, ...rest } = snapshot as Snapshot;
  return rest;
}

/**
 * Attaches `previous` (the band being replaced) and `originalBallpark` (the
 * oldest credible band on the chain) to a freshly computed snapshot.
 */
export function withBallparkHistory<T extends Snapshot>(next: T, existing: unknown): T {
  const stripped = stripBallparkHistory(existing);
  if (!stripped) return next;
  const original = (existing as Snapshot).originalBallpark ?? stripped;
  return { ...next, previous: stripped, originalBallpark: original };
}
