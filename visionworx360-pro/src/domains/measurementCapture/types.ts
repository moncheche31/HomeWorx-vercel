/**
 * One normalized measurement model for every entry method.
 *
 * A contractor may speak a whole-house list, type it, or upload a plan and let
 * the app read it. Whichever path produced it, a measurement lands here in the
 * SAME shape, normalized to inches (the canonical unit from
 * `@/domains/measurement`), with its origin and its original wording intact.
 *
 * AUTHORITY RULE: only `status === "confirmed"` is a fact. Anything else is a
 * candidate/observation and must never silently price scope.
 */

/** Where a measurement came from. Never inferred, never overwritten. */
export type MeasurementSource = "spoken" | "typed" | "plan" | "manual";

export type MeasurementStatus = "candidate" | "ambiguous" | "confirmed";

/** Why an item needs a human look before it can be trusted. */
export type MeasurementFlag =
  | "unitless_small_item"
  | "plan_extraction"
  | "out_of_range"
  | null;

export interface MeasurementItem {
  id: string;
  /** Subject/room as the contractor said it: "Back kitchen wall", "Bedroom". */
  label: string;
  /** Normalized noun for grounding: wall, ceiling, vanity, window, room… */
  subject: string | null;
  /** `pair` carries a second dimension (12 by 14). */
  kind: "single" | "pair";
  /** Canonical value in inches. */
  inches: number;
  /** Second dimension in inches, for `pair` items. */
  secondaryInches: number | null;
  /** Construction-friendly rendering, e.g. `7' 10"` or `12' x 14'`. */
  display: string;
  /** Verbatim wording that produced this item. Never lost. */
  rawText: string;
  source: MeasurementSource;
  status: MeasurementStatus;
  flag: MeasurementFlag;
  /** Set when the contractor edited the value after extraction. */
  overriddenAt?: string | null;
  /** Plan/sheet the item was read from, when source is `plan`. */
  documentId?: string | null;
  createdAt?: string;
}

/** A stored source record: a dictation transcript or an uploaded plan. */
export interface MeasurementCapture {
  id: string;
  source: MeasurementSource;
  /** Dictated/typed text, or the text read off a plan. */
  transcript: string | null;
  documentId: string | null;
  fileName: string | null;
  createdAt: string;
}

export function isAuthoritative(item: MeasurementItem): boolean {
  return item.status === "confirmed";
}
