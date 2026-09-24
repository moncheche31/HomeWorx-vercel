import { describe, expect, it } from "vitest";
import { durableBallparkSessionSchema } from "../services/ballparkSession.schemas";

const ESTIMATE = "22222222-2222-4222-8222-222222222222";
const PROJECT = "11111111-1111-4111-8111-111111111111";

function session() {
  return {
    schemaKey: "quick_ballpark_v1",
    schemaVersion: 1,
    estimateId: ESTIMATE,
    projectId: PROJECT,
    intakeSource: "onsite",
    currentStage: "questions",
    answers: {
      bathroom: { status: "answered", value: "none", transcript: null },
      lengthFt: { status: "answered", value: 18, transcript: "18 feet" },
      useOfSpace: { status: "answered", value: "master suite" },
    },
    transcripts: { lengthFt: "18 feet" },
    photoReferences: [],
    photoAnalysis: {},
    confirmedValues: {},
    inferredValues: {},
    assumedValues: {},
    contractorOverrides: {},
    derivedGeometry: {},
    derivedQuantities: [],
    unknowns: [],
    rangeInputs: {},
    confidence: "medium",
    updatedAt: "2026-08-12T00:00:00.000Z",
  } as const;
}

describe("durable ballpark draft validation", () => {
  it("accepts the current scope-derived engine-v2 snapshot as an opaque saved baseline", () => {
    const parsed = durableBallparkSessionSchema.parse({
      ...session(),
      rangeSnapshot: {
        kind: "ballpark",
        engineVersion: 2,
        source: "scope_recalc",
        band: { low: 36500, expected: 50038.71, high: 65500 },
        geometry: { lengthFt: 18, widthFt: 16 },
        previous: { band: { low: 32500, expected: 44909.52, high: 58500 } },
      },
      draftPreview: {
        kind: "ballpark",
        mode: "ballpark",
        engineVersion: 2,
        currency: "USD",
        band: { low: 41000, expected: 56000, high: 72000 },
        confidence: "medium",
        unknownWidenPct: 0,
      },
    });

    expect(parsed.answers).toMatchObject({
      bathroom: { value: "none" },
      lengthFt: { value: 18 },
      useOfSpace: { value: "master suite" },
    });
    expect(parsed.rangeSnapshot).toMatchObject({ engineVersion: 2, source: "scope_recalc" });
  });

  it("does not discard valid answers because another field is an uninterpreted local draft", () => {
    const parsed = durableBallparkSessionSchema.parse(session());
    expect(parsed.answers.bathroom).toMatchObject({ value: "none" });
    expect(parsed.answers.lengthFt).toMatchObject({ value: 18 });
  });
});
