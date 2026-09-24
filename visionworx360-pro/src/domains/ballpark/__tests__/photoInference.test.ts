import { describe, expect, it } from "vitest";
import {
  adjustMeasurement,
  buildMultiInputBallpark,
  confirmMeasurement,
  inferMeasurements,
  measurementsToAnswers,
  scaleReferenceFor,
  sizeClassFromArea,
  summaryMeasurements,
  type PhotoScaleObservation,
} from "../index";

const obs = (
  target: PhotoScaleObservation["target"],
  referenceKey: string,
  spans: number,
  photoId = "p1",
): PhotoScaleObservation => ({ target, referenceKey, spans, photoId });

describe("scale references", () => {
  it("keeps min <= nominal <= max for every reference", () => {
    for (const key of ["dishwasher", "range", "bathtub", "switchHeight", "tile12"]) {
      const ref = scaleReferenceFor(key)!;
      expect(ref.minIn).toBeLessThanOrEqual(ref.nominalIn);
      expect(ref.nominalIn).toBeLessThanOrEqual(ref.maxIn);
    }
  });

  it("ignores unknown reference keys", () => {
    const result = inferMeasurements({ observations: [obs("roomLengthFt", "nope", 4)] });
    expect(result.hasInferredDimensions).toBe(false);
  });
});

describe("inferMeasurements", () => {
  it("scales a run from a standard object and keeps a band", () => {
    const result = inferMeasurements({ observations: [obs("roomLengthFt", "dishwasher", 6)] });
    const length = result.measurements["roomLengthFt"]!;
    expect(length.sourceType).toBe("inferred");
    expect(length.value).toBe(12); // 6 × 24 in
    expect(length.low).toBeLessThan(length.value);
    expect(length.high).toBeGreaterThan(length.value);
    expect(length.photoIds).toEqual(["p1"]);
    expect(length.referenceKeys).toEqual(["dishwasher"]);
  });

  it("never claims certainty, however many photos agree", () => {
    const result = inferMeasurements({
      observations: [
        obs("roomLengthFt", "dishwasher", 6, "p1"),
        obs("roomLengthFt", "tile12", 12, "p2"),
        obs("roomLengthFt", "baseCabinetDepth", 6, "p3"),
      ],
    });
    const length = result.measurements["roomLengthFt"]!;
    expect(length.confidence).toBeLessThanOrEqual(0.8);
    expect(length.photoIds).toHaveLength(3);
  });

  it("tightens the band when observations agree", () => {
    const one = inferMeasurements({ observations: [obs("roomLengthFt", "range", 4)] });
    const two = inferMeasurements({
      observations: [obs("roomLengthFt", "range", 4, "p1"), obs("roomLengthFt", "range", 4, "p2")],
    });
    const spread = (m: { low: number; high: number }) => m.high - m.low;
    expect(spread(two.measurements["roomLengthFt"]!)).toBeLessThan(
      spread(one.measurements["roomLengthFt"]!),
    );
  });

  it("falls back to a labeled allowance when photos give nothing", () => {
    const result = inferMeasurements({ observations: [], roomType: "kitchen", sizeClass: "medium" });
    expect(result.measurements["roomLengthFt"]!.sourceType).toBe("assumed");
    expect(result.measurements["ceilingHeightFt"]!.value).toBe(8);
    expect(result.hasInferredDimensions).toBe(false);
  });

  it("derives area, perimeter and wall area from the inferred footprint", () => {
    const result = inferMeasurements({
      observations: [obs("roomLengthFt", "dishwasher", 6), obs("roomWidthFt", "dishwasher", 5)],
    });
    expect(result.measurements["floorAreaSf"]!.value).toBe(120);
    expect(result.measurements["perimeterLf"]!.value).toBe(44);
    expect(result.measurements["wallAreaSf"]!.sourceType).toBe("assumed"); // ceiling is an allowance
    expect(result.sizeClass).toBe("medium");
  });

  it("only lists real measurements in the summary order", () => {
    const result = inferMeasurements({
      observations: [obs("cabinetRunLf", "baseCabinetWidth", 8)],
      roomType: "kitchen",
      evidence: { cabinetsPresent: "yes" },
    });
    const keys = summaryMeasurements(result).map((m) => m.key);
    expect(keys).toContain("cabinetRunLf");
    expect(keys).toContain("backsplashAreaSf");
  });

  it("maps areas onto size classes", () => {
    expect(sizeClassFromArea(60)).toBe("small");
    expect(sizeClassFromArea(120)).toBe("medium");
    expect(sizeClassFromArea(200)).toBe("large");
    expect(sizeClassFromArea(400)).toBe("xlarge");
  });
});

describe("corrections", () => {
  const base = inferMeasurements({
    observations: [obs("roomLengthFt", "dishwasher", 6), obs("roomWidthFt", "dishwasher", 5)],
  });

  it("confirms an inferred value without restarting", () => {
    const next = confirmMeasurement(base, "roomLengthFt");
    const length = next.measurements["roomLengthFt"]!;
    expect(length.sourceType).toBe("confirmed");
    expect(length.confirmed).toBe(true);
    expect(length.photoIds).toEqual(["p1"]); // provenance survives
  });

  it("adjusts a value and recomputes derived numbers", () => {
    const next = adjustMeasurement(base, "roomLengthFt", 14);
    expect(next.measurements["roomLengthFt"]!.sourceType).toBe("user_entered");
    expect(next.measurements["floorAreaSf"]!.value).toBe(140);
  });

  it("ignores nonsense corrections", () => {
    expect(adjustMeasurement(base, "roomLengthFt", -3)).toBe(base);
    expect(adjustMeasurement(base, "nope", 10)).toBe(base);
  });
});

describe("normalization into the shared engine", () => {
  it("passes evidence through and leaves allowances out", () => {
    const result = inferMeasurements({
      observations: [obs("roomLengthFt", "dishwasher", 6), obs("roomWidthFt", "dishwasher", 5)],
    });
    const answers = measurementsToAnswers(result);
    expect(answers["lengthFt"]?.value).toBe(12);
    expect(answers["widthFt"]?.value).toBe(10);
    expect(answers["ceilingHeightFt"]).toBeUndefined(); // still an allowance
    expect(answers["sizeClass"]?.value).toBe("medium");
  });

  it("narrows the band versus a size-class-only photo ballpark", () => {
    const answers = {
      roomType: { status: "answered" as const, value: "kitchen" },
      sizeClass: { status: "answered" as const, value: "medium" },
      scopeType: { status: "answered" as const, value: "cosmetic" },
      finishLevel: { status: "answered" as const, value: "standard" },
    };
    const withoutPhotos = buildMultiInputBallpark({ source: "photos", answers });
    const withInference = buildMultiInputBallpark({
      source: "photos",
      answers,
      inference: inferMeasurements({
        observations: [obs("roomLengthFt", "dishwasher", 6), obs("roomWidthFt", "dishwasher", 5)],
        roomType: "kitchen",
        sizeClass: "medium",
      }),
    });

    expect(withoutPhotos.footprintAssumed).toBe(true);
    expect(withInference.footprintInferred).toBe(true);
    expect(withInference.footprintAssumed).toBe(false);
    expect(withInference.sourceWidenPct).toBeLessThan(withoutPhotos.sourceWidenPct);
    expect(withInference.ledger.inferred.length).toBeGreaterThan(0);
    expect(withInference.ledger.risks.map((r) => r.key)).toContain("inferredFootprint");
    expect(withInference.ledger.risks.map((r) => r.key)).not.toContain("assumedFootprint");
    expect(withInference.warnings.map((w) => w.code)).toContain("inferred-footprint");
  });

  it("lets a typed dimension beat an inference", () => {
    const result = buildMultiInputBallpark({
      source: "photos",
      answers: {
        roomType: { status: "answered", value: "kitchen" },
        sizeClass: { status: "answered", value: "medium" },
        lengthFt: { status: "answered", value: 20 },
        widthFt: { status: "answered", value: 15 },
      },
      inference: inferMeasurements({
        observations: [obs("roomLengthFt", "dishwasher", 6), obs("roomWidthFt", "dishwasher", 5)],
      }),
    });
    expect(result.footprintInferred).toBe(false);
    expect(result.derived.geometryInput.lengthFt).toBe(20);
  });

  it("is deterministic", () => {
    const build = () =>
      buildMultiInputBallpark({
        source: "photos",
        answers: { roomType: { status: "answered", value: "bathroom" } },
        inference: inferMeasurements({
          observations: [obs("roomLengthFt", "bathtub", 2), obs("roomWidthFt", "toilet", 2)],
        }),
      });
    expect(build().band).toEqual(build().band);
  });
});
