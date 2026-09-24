import { describe, expect, it } from "vitest";
import {
  analyzePhotoPackage,
  backsplashSupported,
  cabinetsConfirmed,
  candidateFor,
  confirmMeasurement,
  inferMeasurements,
  measurementsToAnswers,
  suggestedReferencesForAxis,
  HAS_VISION_PROVIDER,
  type PhotoScaleObservation,
} from "../index";

const obs = (
  target: PhotoScaleObservation["target"],
  referenceKey: string,
  spans: number,
  extra: Partial<PhotoScaleObservation> = {},
): PhotoScaleObservation => ({ target, referenceKey, spans, photoId: "p1", ...extra });

/* Test case 3: a door height must never become a room length or width. */
describe("axis discipline", () => {
  it("refuses an elevation reference for a horizontal run", () => {
    const outcome = candidateFor(obs("roomWidthFt", "doorHeight", 1));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("elevation-cross-axis");
  });

  it("refuses it even when the contractor forces cross-axis use", () => {
    const outcome = candidateFor(obs("roomLengthFt", "doorHeight", 1, { allowCrossAxis: true }));
    expect(outcome.ok).toBe(false);
  });

  it("accepts the same door height for a ceiling", () => {
    const outcome = candidateFor(obs("ceilingHeightFt", "doorHeight", 1.2));
    expect(outcome.ok).toBe(true);
  });

  it("allows a non-elevation cross-axis reference only when explicitly enabled", () => {
    expect(candidateFor(obs("ceilingHeightFt", "tile12", 8)).ok).toBe(false);
    expect(candidateFor(obs("ceilingHeightFt", "tile12", 8, { allowCrossAxis: true })).ok).toBe(true);
  });

  it("only offers same-axis rulers in the picker", () => {
    const horizontal = suggestedReferencesForAxis("garage", "horizontal").map((r) => r.key);
    expect(horizontal).not.toContain("doorHeight");
    expect(suggestedReferencesForAxis("garage", "vertical").map((r) => r.key)).toContain("doorHeight");
  });
});

/* Test case 4: the reported 6.7 × 6.7 / 43 SF garage must not stand. */
describe("plausibility guards", () => {
  const badCalibration = inferMeasurements({
    observations: [obs("roomLengthFt", "doorHeight", 1), obs("roomWidthFt", "doorHeight", 1)],
    roomType: "garage",
    sizeClass: "large",
  });

  it("rejects the door-height calibration outright", () => {
    expect(badCalibration.rejected.map((r) => r.code)).toEqual([
      "elevation-cross-axis",
      "elevation-cross-axis",
    ]);
    expect(badCalibration.hasInferredDimensions).toBe(false);
  });

  it("falls back to the documented allowance instead of a 43 SF garage", () => {
    expect(badCalibration.measurements["roomLengthFt"]!.sourceType).toBe("assumed");
    expect(badCalibration.measurements["floorAreaSf"]!.value).toBeGreaterThan(60);
  });

  it("forces low confidence and warns", () => {
    expect(badCalibration.confidenceBand).toBe("low");
    expect(badCalibration.warnings.some((w) => w.severity === "error")).toBe(true);
  });

  it("flags an impossibly small habitable footprint", () => {
    const tiny = inferMeasurements({
      observations: [obs("roomLengthFt", "tile12", 6), obs("roomWidthFt", "tile12", 6)],
      roomType: "garage",
    });
    expect(tiny.warnings.map((w) => w.code)).toContain("tiny-floor-area");
    expect(tiny.confidenceBand).toBe("low");
  });

  it("drops a dimension outside the plausible envelope", () => {
    const huge = inferMeasurements({
      observations: [obs("roomLengthFt", "dishwasher", 60)],
      roomType: "garage",
      sizeClass: "large",
    });
    expect(huge.measurements["roomLengthFt"]!.sourceType).toBe("assumed");
    expect(huge.rejected.some((r) => r.code === "implausible-result")).toBe(true);
  });

  it("keeps a flagged inference out of the pricing engine", () => {
    expect(measurementsToAnswers(badCalibration)["lengthFt"]).toBeUndefined();
  });

  it("lets a human correction clear the flag", () => {
    const tiny = inferMeasurements({
      observations: [obs("roomLengthFt", "tile12", 6), obs("roomWidthFt", "tile12", 6)],
      roomType: "garage",
    });
    const confirmed = confirmMeasurement(
      confirmMeasurement(tiny, "roomLengthFt"),
      "roomWidthFt",
    );
    expect(confirmed.warnings.map((w) => w.code)).not.toContain("tiny-floor-area");
  });
});

/* Test case 5: no backsplash in a garage with no cabinets. */
describe("evidence gating", () => {
  it("never infers a cabinet run or backsplash without cabinets", () => {
    const garage = inferMeasurements({
      observations: [obs("cabinetRunLf", "baseCabinetWidth", 8)],
      roomType: "garage",
      evidence: { cabinetsPresent: "no" },
    });
    expect(garage.measurements["cabinetRunLf"]).toBeUndefined();
    expect(garage.measurements["backsplashAreaSf"]).toBeUndefined();
    expect(garage.rejected.some((r) => r.code === "cabinets-not-confirmed")).toBe(true);
  });

  it("still refuses a backsplash in a garage that does have cabinets", () => {
    const garage = inferMeasurements({
      observations: [obs("cabinetRunLf", "baseCabinetWidth", 8)],
      roomType: "garage",
      evidence: { cabinetsPresent: "yes" },
    });
    expect(garage.measurements["cabinetRunLf"]).toBeDefined();
    expect(garage.measurements["backsplashAreaSf"]).toBeUndefined();
  });

  it("reads cabinet evidence from either the observation or the interview", () => {
    expect(cabinetsConfirmed({ cabinetsPresent: "unclear" })).toBe(false);
    expect(cabinetsConfirmed({ cabinetsScope: "none" })).toBe(false);
    expect(cabinetsConfirmed({ cabinetsScope: "replace" })).toBe(true);
    expect(backsplashSupported("kitchen", { cabinetsScope: "replace" })).toBe(true);
    expect(backsplashSupported("kitchen", { backsplashPresent: "no", cabinetsScope: "replace" })).toBe(false);
  });
});

/* Test case 2: a sketch is not a photograph. */
describe("image kind", () => {
  it("skips object-scale heuristics on a sketch", () => {
    const sketch = inferMeasurements({
      observations: [obs("roomLengthFt", "dishwasher", 8), obs("roomWidthFt", "dishwasher", 8)],
      photoKind: "sketch_plan",
      roomType: "garage",
      sizeClass: "large",
    });
    expect(sketch.hasInferredDimensions).toBe(false);
    expect(sketch.rejected.every((r) => r.code === "not-a-photograph")).toBe(true);
    expect(sketch.measurements["roomLengthFt"]!.sourceType).toBe("assumed");
    expect(sketch.confidence).toBeLessThanOrEqual(0.3);
  });

  it("turns object-scale calibration off for sketches and renderings", () => {
    const analysis = analyzePhotoPackage({
      photos: [{ id: "a", name: "plan.png", kind: "sketch_plan" }],
    });
    expect(analysis.objectScaleAvailable).toBe(false);
    expect(analysis.dominantKind).toBe("sketch_plan");
    expect(analysis.notes.map((n) => n.code)).toContain("sketch");
  });
});

/* Test case 1: the photo path completes with no exact dimensions at all. */
describe("automatic-first analysis", () => {
  it("never pretends to have analyzed the pixels", () => {
    expect(HAS_VISION_PROVIDER).toBe(false);
    const analysis = analyzePhotoPackage({
      photos: [{ id: "a", name: "garage.jpg", kind: "room_photo" }],
    });
    expect(analysis.analyzed).toBe(false);
    expect(analysis.provider).toBe("none");
    expect(analysis.notes.map((n) => n.code)).toContain("no-vision-provider");
  });

  it("asks only high-value clarifications, and not ones already answered", () => {
    const analysis = analyzePhotoPackage({
      photos: [{ id: "a", name: "garage.jpg", kind: "room_photo" }],
      answeredIds: ["roomType", "sizeClass"],
    });
    expect(analysis.clarificationIds).not.toContain("roomType");
    expect(analysis.clarificationIds).toContain("scopeType");
  });

  it("produces a usable range from photos plus answers, with zero calibration", () => {
    const result = inferMeasurements({
      observations: [],
      roomType: "garage",
      sizeClass: "large",
      photoIds: ["a"],
    });
    expect(result.measurements["floorAreaSf"]!.value).toBeGreaterThan(60);
    expect(result.measurements["floorAreaSf"]!.sourceType).toBe("assumed");
    expect(result.warnings.some((w) => w.severity === "error")).toBe(false);
  });
});
