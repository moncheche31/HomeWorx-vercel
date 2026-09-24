/**
 * RANGE SNAPSHOT ENVELOPE.
 *
 * `estimates.range_snapshot` historically held EITHER of two unrelated things:
 *
 *   1. a BALLPARK snapshot  `{ kind: "ballpark", band: { low, expected, high }, ... }`
 *      — one scope, one price band, plus the contractor's selected band POSITION.
 *   2. a FINISH-TIER snapshot `{ currency, calculatedAt, tiers: [{ tier, low, mid, high }] }`
 *      — the same scope re-priced at three FINISH QUALITY levels.
 *
 * Both writers targeted the same column, so whichever saved last destroyed the
 * other. This module defines one envelope where the two coexist:
 *
 *   { version: 2, ballpark: <ballpark snapshot>, finishTiers: <tier snapshot> }
 *
 * Readers stay backwards compatible: a legacy top-level ballpark or top-level
 * tier snapshot is recognised in place and never rewritten on read. Writers
 * upgrade to the envelope while carrying the sibling slot forward untouched.
 *
 * The two concepts stay semantically distinct: a BAND POSITION is a price
 * position on fixed scope/cost; a FINISH TIER legitimately changes material and
 * labor assumptions. Neither may be presented as the other.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

export const RANGE_SNAPSHOT_ENVELOPE_VERSION = 2;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

export const isBallparkSnapshotShape = (v: unknown): boolean =>
  isRecord(v) && (v.kind === "ballpark" || v.mode === "ballpark");

export const isFinishTierSnapshotShape = (v: unknown): boolean =>
  isRecord(v) && Array.isArray(v.tiers);

/** The ballpark slot: envelope member, legacy top level, or legacy nested. */
export function readBallparkSlot(snapshot: unknown): unknown | null {
  if (!isRecord(snapshot)) return null;
  if (isBallparkSnapshotShape(snapshot)) return snapshot;
  if (isBallparkSnapshotShape(snapshot.ballpark)) return snapshot.ballpark;
  return null;
}

/** The finish-tier slot: envelope member or legacy top-level `{ tiers: [...] }`. */
export function readFinishTierSlot(snapshot: unknown): unknown | null {
  if (!isRecord(snapshot)) return null;
  if (isFinishTierSnapshotShape(snapshot.finishTiers)) return snapshot.finishTiers;
  if (isFinishTierSnapshotShape(snapshot)) return snapshot;
  return null;
}

/** True when the value is already an envelope rather than a legacy snapshot. */
export function isRangeSnapshotEnvelope(snapshot: unknown): boolean {
  return (
    isRecord(snapshot) &&
    !isBallparkSnapshotShape(snapshot) &&
    !isFinishTierSnapshotShape(snapshot) &&
    (snapshot.ballpark !== undefined || snapshot.finishTiers !== undefined)
  );
}

const envelopeFrom = (snapshot: unknown): Record<string, unknown> => {
  if (!isRecord(snapshot)) return {};
  if (isBallparkSnapshotShape(snapshot) || isFinishTierSnapshotShape(snapshot)) {
    /* Legacy top-level snapshot: keep siblings out of the legacy object. */
    return {};
  }
  const { ...rest } = snapshot;
  return rest;
};

/**
 * Write the ballpark slot, preserving any finish-tier data (and vice versa).
 * Nothing is deleted: legacy siblings are lifted into the envelope untouched.
 */
export function writeBallparkSlot(existing: unknown, ballpark: unknown): unknown {
  const finishTiers = readFinishTierSlot(existing);
  const base = envelopeFrom(existing);
  const next: Record<string, unknown> = {
    ...base,
    version: RANGE_SNAPSHOT_ENVELOPE_VERSION,
    ballpark,
  };
  if (finishTiers) next.finishTiers = finishTiers;
  return next;
}

/** Write the finish-tier slot, preserving the ballpark snapshot and its position. */
export function writeFinishTierSlot(existing: unknown, finishTiers: unknown): unknown {
  const ballpark = readBallparkSlot(existing);
  const base = envelopeFrom(existing);
  const next: Record<string, unknown> = {
    ...base,
    version: RANGE_SNAPSHOT_ENVELOPE_VERSION,
    finishTiers,
  };
  if (ballpark) next.ballpark = ballpark;
  return next;
}

/**
 * Route an incoming snapshot of unknown provenance into the right slot without
 * clobbering its sibling. Anything unrecognised replaces the envelope body but
 * still carries both known slots forward.
 */
export function mergeRangeSnapshot(existing: unknown, next: unknown): unknown {
  if (isBallparkSnapshotShape(next)) return writeBallparkSlot(existing, next);
  if (isFinishTierSnapshotShape(next)) return writeFinishTierSlot(existing, next);
  if (!isRecord(next)) return next;
  const ballpark = readBallparkSlot(existing);
  const finishTiers = readFinishTierSlot(existing);
  const merged: Record<string, unknown> = { ...next };
  if (ballpark && merged.ballpark === undefined) merged.ballpark = ballpark;
  if (finishTiers && merged.finishTiers === undefined) merged.finishTiers = finishTiers;
  return merged;
}
