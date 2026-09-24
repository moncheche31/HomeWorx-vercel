/**
 * Ballpark must be QUICK: missing measurements become disclosed assumptions,
 * never blocking prompts. These tests pin the behaviours that regressed:
 *
 *   1. No measurement blocks a band when a reasonable allowance exists.
 *   2. Dimensions stated by voice/text are reused verbatim.
 *   3. Saved project measurements are reused.
 *   4. Measurement questions irrelevant to the work domains are suppressed.
 *   5. Contractor-stated facts outrank inferred/measured values.
 *   6. A band still calculates with non-critical measurements missing.
 */

import { describe, expect, it } from "vitest";

import {
  deriveBallpark,
  QUICK_BALLPARK_SCHEMA,
  SIZE_CLASS_FOOTPRINT,
  mergeMeasuredGeometry,
  measurementFieldsForScope,
  type BallparkAnswers,
} from "@/domains/ballpark";

const answered = (value: string | number, transcript: string | null = null) => ({
  status: "answered" as const,
  value,
  transcript,
});

describe("ballpark never hard-blocks on a measurement", () => {
  it("prices a room from a documented footprint allowance when no dimensions were given", () => {
    const derived = deriveBallpark({}, QUICK_BALLPARK_SCHEMA);
    expect(derived.geometryInput.lengthFt).toBe(SIZE_CLASS_FOOTPRINT.medium.lengthFt);
    expect(derived.geometryInput.widthFt).toBe(SIZE_CLASS_FOOTPRINT.medium.widthFt);
    expect(derived.quantities.length).toBeGreaterThan(0);
  });

  it("discloses that footprint as an assumption, not as an answer", () => {
    const derived = deriveBallpark({}, QUICK_BALLPARK_SCHEMA);
    const dimensions = derived.assumptions.find((a) => a.key === "dimensions");
    expect(dimensions?.source).toBe("assumed");
  });

  it("still registers the missing dimensions as unknowns so the band widens", () => {
    const derived = deriveBallpark({}, QUICK_BALLPARK_SCHEMA);
    const ids = derived.unknowns.map((u) => u.questionId);
    expect(ids).toContain("lengthFt");
    expect(ids).toContain("widthFt");
  });

  it("lets the contractor skip every measurement question in the quick schema", () => {
    const dimensionQuestions = QUICK_BALLPARK_SCHEMA.questions.filter(
      (q) => q.kind === "dimension",
    );
    expect(dimensionQuestions.length).toBeGreaterThan(0);
    for (const question of dimensionQuestions) {
      expect(question.allowUnknown).toBe(true);
    }
  });

  it("still calculates when a non-critical measurement (ceiling height) is missing", () => {
    const answers: BallparkAnswers = {
      lengthFt: answered(12, "twelve by sixteen"),
      widthFt: answered(16, "twelve by sixteen"),
    };
    const derived = deriveBallpark(answers, QUICK_BALLPARK_SCHEMA);
    expect(derived.geometryInput.ceilingHeightFt).toBe(8);
    expect(derived.quantities.length).toBeGreaterThan(0);
  });
});

describe("existing evidence is reused instead of re-asked", () => {
  it("uses dimensions the contractor stated in voice/text", () => {
    const answers: BallparkAnswers = {
      lengthFt: answered(15.5, "fifteen and a half by eighteen"),
      widthFt: answered(18, "fifteen and a half by eighteen"),
    };
    const derived = deriveBallpark(answers, QUICK_BALLPARK_SCHEMA);
    expect(derived.geometryInput.lengthFt).toBe(15.5);
    expect(derived.geometryInput.widthFt).toBe(18);
    expect(derived.assumptions.find((a) => a.key === "dimensions")?.source).toBe("answered");
  });

  it("reuses saved project measurements as answers", () => {
    const merged = mergeMeasuredGeometry({}, { lengthFt: 14, widthFt: 11 }, ["flooring"]);
    expect(merged.lengthFt).toMatchObject({ status: "answered", value: 14 });
    const derived = deriveBallpark(merged, QUICK_BALLPARK_SCHEMA);
    expect(derived.geometryInput.lengthFt).toBe(14);
    expect(derived.assumptions.find((a) => a.key === "dimensions")?.source).toBe("answered");
  });
});

describe("authority order and scope relevance", () => {
  it("never overwrites a contractor-stated dimension with a measured value", () => {
    const answers: BallparkAnswers = { lengthFt: answered(20, "twenty feet") };
    const merged = mergeMeasuredGeometry(answers, { lengthFt: 14, widthFt: 11 }, ["flooring"]);
    expect(merged.lengthFt).toMatchObject({ value: 20 });
    expect(merged.widthFt).toMatchObject({ value: 11 });
  });

  it("does not ask for room dimensions on cabinet-only work", () => {
    const fields = measurementFieldsForScope([{ title: "Replace kitchen cabinets" }]);
    expect(fields).not.toContain("lengthFt");
    expect(fields).not.toContain("widthFt");
  });

  it("does ask for room dimensions when the work is genuinely room-wide", () => {
    const fields = measurementFieldsForScope([{ title: "Install new hardwood flooring throughout" }]);
    expect(fields).toContain("lengthFt");
  });
});
