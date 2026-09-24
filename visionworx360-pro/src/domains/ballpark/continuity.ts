/**
 * Continuity between the ballpark and the detailed walkthrough.
 *
 * When a sketch or tape-measure numbers arrive later, they REPLACE the
 * assumptions in the same session — the contractor never restarts the
 * estimate. Contractor-answered values always win over derived ones, and
 * merging is idempotent.
 */

import type { RoomGeometryInput } from "@/domains/geometry";
import {
  ALL_MEASUREMENT_FIELDS,
  measurementFieldsForDomains,

  type MeasurementFieldId,
  type WorkDomain,
} from "./scopeProfile";
import type { BallparkAnswers } from "./types";

const answered = (value: string | number) => ({ status: "answered" as const, value });

/**
 * Overlay confirmed measurements onto interview answers.
 *
 * Only the fields the measurement record actually carries are replaced; every
 * other answer (bathroom, finish level, electrical scope…) is preserved
 * untouched. Running it twice with the same record changes nothing.
 */
export function mergeMeasuredGeometry(
  answers: BallparkAnswers,
  measured: Partial<RoomGeometryInput> | null | undefined,
  /**
   * The CURRENT project's work domains. A measured value only becomes an
   * interview answer when the scope actually depends on it: a cabinet job with
   * a stray 7.83 ft wall reading must never acquire room length/width answers,
   * because those drive floor/wall quantities and repriced the job as a room.
   */
  domains: WorkDomain[] = [],
): BallparkAnswers {
  if (!measured) return answers;
  const next: BallparkAnswers = { ...answers };
  /*
   * Values reaching this function were typed by the contractor into a form
   * that was ALREADY scope-filtered, so an explicit statement is honoured.
   * Domain gating here is the second line of defence for callers that merge
   * values from an older, unfiltered record.
   */
  const allowed = new Set<MeasurementFieldId>(
    domains.length > 0 ? measurementFieldsForDomains(domains) : ALL_MEASUREMENT_FIELDS,
  );
  const allows = (field: MeasurementFieldId) => allowed.has(field);

  /*
   * AUTHORITY ORDER. A measured record may fill or refresh a value the
   * interview derived, but it must never overwrite a value the contractor
   * stated in their own words: an older 20 LF partition reading silently
   * replacing a spoken "36" is how a credible estimate loses its facts.
   */
  const contractorStated = (id: string) => {
    const answer = answers[id];
    return Boolean(answer && answer.status === "answered" && (answer.transcript ?? "").trim());
  };

  const set = (id: string, field: MeasurementFieldId, value: number | null | undefined) => {
    if (!allows(field)) return;
    if (contractorStated(id)) return;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return;
    next[id] = { ...answered(value), transcript: null };
  };


  set("lengthFt", "lengthFt", measured.lengthFt ?? null);
  set("widthFt", "widthFt", measured.widthFt ?? null);
  set("ceilingHeightFt", "ceilingHeightFt", measured.ceilingHeightFt ?? null);
  set("partitionLfKnown", "interiorPartitionLf", measured.interiorPartitionLf ?? null);

  if (
    allows("interiorPartitionLf") &&
    typeof measured.interiorPartitionLf === "number" &&
    measured.interiorPartitionLf > 0
  ) {
    /* A measured partition length means the extent allowance no longer
       decides anything, but the contractor's own choice is never erased. */
    if (!next.partitions || next.partitions.status !== "answered") {
      next.partitions = { ...answered("moderate"), transcript: null };
    }
  }

  const openings = allows("doors") || allows("windows") ? measured.openings ?? null : null;
  if (openings) {
    const count = (kind: "door" | "window") =>
      openings.filter((o) => o.kind === kind).reduce((sum, o) => sum + Math.max(0, o.count), 0);
    if (!contractorStated("newDoors")) next.newDoors = { ...answered(count("door")), transcript: null };
    if (!contractorStated("newWindows")) {
      next.newWindows = { ...answered(count("window")), transcript: null };
    }
  }


  return next;
}

/** Seed a fresh interview from an existing measurement record. */
export function ballparkAnswersFromGeometry(
  measured: Partial<RoomGeometryInput> | null | undefined,
  domains: WorkDomain[] = [],
): BallparkAnswers {
  return mergeMeasuredGeometry({}, measured, domains);
}

/* ------------------------------------------------------------------ *
 * Surgical geometry writes
 * ------------------------------------------------------------------ */

/** Which measurement record field each interview question actually controls. */
const QUESTION_GEOMETRY_FIELDS: Record<string, keyof RoomGeometryInput> = {
  lengthFt: "lengthFt",
  widthFt: "widthFt",
  footprint: "lengthFt",
  ceilingHeightFt: "ceilingHeightFt",
  partitionLfKnown: "interiorPartitionLf",
  partitions: "interiorPartitionLf",
  newDoors: "openings",
  newWindows: "openings",
};

/**
 * Completing a clarification round must write ONLY the facts the answered
 * questions control.
 *
 * The interview always derives a COMPLETE geometry object, most of it assumed.
 * Saving that whole object over the project's measurement record republished
 * assumptions as measurements and re-derived quantities the contractor never
 * touched — an "Improve accuracy" round could move the estimate for reasons
 * unrelated to what was asked. This keeps the existing record intact except
 * for the fields the answered questions own.
 */
export function controlledGeometryPatch(
  derived: RoomGeometryInput,
  existing: Partial<RoomGeometryInput> | null | undefined,
  answeredQuestionIds: readonly string[],
): RoomGeometryInput {
  if (!existing) return derived;
  const controlled = new Set<keyof RoomGeometryInput>();
  for (const id of answeredQuestionIds) {
    const field = QUESTION_GEOMETRY_FIELDS[id];
    if (field) controlled.add(field);
  }

  const keep = <K extends keyof RoomGeometryInput>(field: K): RoomGeometryInput[K] =>
    controlled.has(field) || existing[field] == null
      ? derived[field]
      : (existing[field] as RoomGeometryInput[K]);

  return {
    ...derived,
    lengthFt: keep("lengthFt"),
    widthFt: keep("widthFt"),
    ceilingHeightFt: keep("ceilingHeightFt"),
    interiorPartitionLf: keep("interiorPartitionLf"),
    openings: controlled.has("openings") ? derived.openings : existing.openings ?? derived.openings,
  };
}
