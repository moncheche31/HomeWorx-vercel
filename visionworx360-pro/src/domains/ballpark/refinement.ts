/**
 * Refining a ballpark instead of restarting one.
 *
 * A ballpark is the first version of an estimate, not a throwaway. Adding real
 * measurements, more answers, or a sketch later patches the same answer set and
 * appends a history event — the contractor never re-enters what they already
 * said, and the trail of how the number changed stays on the project.
 */

import { mergeMeasuredGeometry } from "./continuity";
import type { BallparkAnswers, BallparkBand, BallparkConfidence } from "./types";
import type { BallparkIntakeSource } from "./intake";

export type BallparkRefinementKind =
  | "answers"
  | "measurements"
  | "observations"
  | "selections"
  | "sketch";

export interface BallparkRefinementEvent {
  id: string;
  at: string;
  kind: BallparkRefinementKind;
  source: BallparkIntakeSource;
  /** Answer ids that actually changed. Empty means the patch was a no-op. */
  changedKeys: string[];
  bandBefore: BallparkBand | null;
  bandAfter: BallparkBand | null;
  confidenceBefore: BallparkConfidence | null;
  confidenceAfter: BallparkConfidence | null;
}

export interface BallparkHistory {
  version: 1;
  createdAt: string;
  events: BallparkRefinementEvent[];
}

/** Keep the trail useful without letting it grow forever. */
export const MAX_HISTORY_EVENTS = 50;

export function emptyHistory(at: string = new Date().toISOString()): BallparkHistory {
  return { version: 1, createdAt: at, events: [] };
}

const sameValue = (a: BallparkAnswers[string] | undefined, b: BallparkAnswers[string] | undefined) =>
  a?.status === b?.status && String(a?.value ?? "") === String(b?.value ?? "");

/** Merge a patch, reporting exactly what moved. Idempotent. */
export function refineWithAnswers(
  previous: BallparkAnswers,
  patch: BallparkAnswers,
): { answers: BallparkAnswers; changedKeys: string[] } {
  const answers: BallparkAnswers = { ...previous };
  const changedKeys: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (sameValue(previous[key], value)) continue;
    answers[key] = value;
    changedKeys.push(key);
  }
  return { answers, changedKeys };
}

/**
 * Overlay a saved measurement record. Real numbers always beat the ballpark's
 * allowances, and running it twice changes nothing the second time.
 */
export function refineWithMeasurements(
  previous: BallparkAnswers,
  record: Parameters<typeof mergeMeasuredGeometry>[1],
  /** Only geometry the current scope depends on may refine the band. */
  domains: Parameters<typeof mergeMeasuredGeometry>[2] = [],
): { answers: BallparkAnswers; changedKeys: string[] } {
  const merged = mergeMeasuredGeometry(previous, record, domains);
  const changedKeys = Object.keys(merged).filter((key) => !sameValue(previous[key], merged[key]));
  return { answers: merged, changedKeys };
}

/** Append an event, dropping the oldest once the cap is reached. */
export function recordRefinement(
  history: BallparkHistory,
  event: Omit<BallparkRefinementEvent, "id" | "at"> & { id?: string; at?: string },
): BallparkHistory {
  if (event.changedKeys.length === 0) return history;
  const at = event.at ?? new Date().toISOString();
  const entry: BallparkRefinementEvent = {
    id: event.id ?? `${at}-${event.kind}`,
    at,
    kind: event.kind,
    source: event.source,
    changedKeys: event.changedKeys,
    bandBefore: event.bandBefore ?? null,
    bandAfter: event.bandAfter ?? null,
    confidenceBefore: event.confidenceBefore ?? null,
    confidenceAfter: event.confidenceAfter ?? null,
  };
  const events = [...history.events, entry].slice(-MAX_HISTORY_EVENTS);
  return { ...history, events };
}
