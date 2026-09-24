/**
 * Garage-conversion regression: an "Improve accuracy" round must refine only
 * the facts it asked about, and a transcript may never disagree with the value
 * the estimate prices.
 *
 * Reproduces the live failure on the Master Suite Garage Conversion:
 *  - "5'x11' bathroom" stored as `none`
 *  - spoken 36 LF partitions replaced by a stale 20 LF measurement
 *  - "9.5" beam span truncated to 9
 *  - a whole assumed geometry object republished over the measurement record
 */

import { describe, expect, it } from "vitest";
import {
  controlledGeometryPatch,
  mergeMeasuredGeometry,
  reconcileAnswerIntegrity,
  mergeBallparkAnswers,
  parseCount,
  type BallparkAnswers,
  type BallparkInterviewSchema,
  type BallparkOption,
} from "@/domains/ballpark";
import { matchOptionLoose } from "@/domains/ballpark/parse";
import type { RoomGeometryInput } from "@/domains/geometry";

const BATH_OPTIONS: BallparkOption[] = [
  { value: "none", labelKey: "o.none", match: { "en-US": ["no bathroom", "no bath", "none"] } },
  { value: "full", labelKey: "o.full", match: { "en-US": ["full bathroom", "full bath"] } },
];

const schema: BallparkInterviewSchema = {
  key: "test.garage",
  questions: [
    { id: "bathroom", kind: "choice", promptKey: "q.bathroom", options: BATH_OPTIONS },
    { id: "partitionLfKnown", kind: "dimension", promptKey: "q.partitions", unit: "ft" },
    { id: "beamSpanFt", kind: "dimension", promptKey: "q.beam", unit: "ft" },
    { id: "newDoors", kind: "count", promptKey: "q.doors", unit: "each" },
  ],
} as unknown as BallparkInterviewSchema;

describe("answer integrity", () => {
  it("does not match a negated option from word overlap", () => {
    expect(matchOptionLoose(BATH_OPTIONS, "5'x11' bathroom", "en-US")?.value).not.toBe("none");
    /* Verbatim negation still matches. */
    expect(matchOptionLoose(BATH_OPTIONS, "no bathroom in there", "en-US")?.value).toBe("none");
  });

  it("never truncates a fractional answer into a count", () => {
    expect(parseCount("9.5")).toBeNull();
    expect(parseCount("2 doors")).toBe(2);
    expect(parseCount("none")).toBe(0);
  });

  it("restores the contractor's transcript over a contradicted value", () => {
    const answers: BallparkAnswers = {
      bathroom: { status: "answered", value: "none", transcript: "5'x11' bathroom" },
      partitionLfKnown: { status: "answered", value: 20, transcript: "36" },
      beamSpanFt: { status: "answered", value: 9, transcript: "9.5" },
    };
    const { answers: fixed, conflicts } = reconcileAnswerIntegrity(schema, answers, "en-US");
    expect(fixed.partitionLfKnown?.value).toBe(36);
    expect(fixed.beamSpanFt?.value).toBe(9.5);
    expect(fixed.bathroom?.value).not.toBe("none");
    expect(conflicts.length).toBeGreaterThanOrEqual(2);
  });

  it("is idempotent", () => {
    const answers: BallparkAnswers = {
      partitionLfKnown: { status: "answered", value: 36, transcript: "36" },
    };
    const once = reconcileAnswerIntegrity(schema, answers, "en-US").answers;
    const twice = reconcileAnswerIntegrity(schema, once, "en-US").answers;
    expect(twice).toEqual(answers);
    expect(reconcileAnswerIntegrity(schema, answers, "en-US").conflicts).toHaveLength(0);
  });

  it("leaves structured picks with no transcript untouched", () => {
    const answers: BallparkAnswers = {
      bathroom: { status: "answered", value: "full", transcript: null },
    };
    expect(reconcileAnswerIntegrity(schema, answers, "en-US").answers).toEqual(answers);
  });
});

describe("measurement authority", () => {
  it("a stale measured partition never overwrites a spoken value", () => {
    const answers: BallparkAnswers = {
      partitionLfKnown: { status: "answered", value: 36, transcript: "36" },
    };
    const merged = mergeMeasuredGeometry(answers, { interiorPartitionLf: 20 }, ["structure"]);
    expect(merged.partitionLfKnown?.value).toBe(36);
  });

  it("still fills a value the contractor never stated", () => {
    const merged = mergeMeasuredGeometry({}, { interiorPartitionLf: 20 }, []);
    expect(merged.partitionLfKnown?.value).toBe(20);
  });
});

describe("controlled geometry writes", () => {
  const existing: RoomGeometryInput = {
    lengthFt: 22,
    widthFt: 20,
    ceilingHeightFt: 9,
    openings: [{ kind: "door", widthFt: 3, heightFt: 7, count: 1 }],
    interiorPartitionLf: 20,
  } as unknown as RoomGeometryInput;

  const derived: RoomGeometryInput = {
    lengthFt: 16,
    widthFt: 14,
    ceilingHeightFt: 8,
    openings: [],
    interiorPartitionLf: 36,
  } as unknown as RoomGeometryInput;

  it("writes only the fields the answered questions control", () => {
    const patch = controlledGeometryPatch(derived, existing, ["partitionLfKnown"]);
    expect(patch.interiorPartitionLf).toBe(36);
    expect(patch.lengthFt).toBe(22);
    expect(patch.widthFt).toBe(20);
    expect(patch.ceilingHeightFt).toBe(9);
    expect(patch.openings).toEqual(existing.openings);
  });

  it("bootstraps the full record when the project has no measurements", () => {
    expect(controlledGeometryPatch(derived, null, [])).toEqual(derived);
  });
});

describe("session rehydration priority", () => {
  it("a spoken local answer survives a derived server value", () => {
    const merged = mergeBallparkAnswers(
      { partitionLfKnown: { status: "answered", value: 20, transcript: null } },
      { partitionLfKnown: { status: "answered", value: 36, transcript: "36" } },
    );
    expect(merged.partitionLfKnown?.value).toBe(36);
  });

  it("a stored spoken answer still beats an unsaved local draft", () => {
    const merged = mergeBallparkAnswers(
      { partitionLfKnown: { status: "answered", value: 36, transcript: "36 feet" } },
      { partitionLfKnown: { status: "answered", value: 20, transcript: "20" } },
    );
    expect(merged.partitionLfKnown?.value).toBe(36);
  });

  it("keeps legacy keys and unanswered local drafts", () => {
    const merged = mergeBallparkAnswers(
      { legacyKey: { status: "answered", value: "x", transcript: null } },
      { newDoors: { status: "unknown", transcript: null } },
    );
    expect(Object.keys(merged).sort()).toEqual(["legacyKey", "newDoors"]);
  });
});
