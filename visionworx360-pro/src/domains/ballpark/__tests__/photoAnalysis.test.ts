import { describe, expect, it } from "vitest";
import {
  MAX_CLARIFICATIONS,
  MIN_CLARIFICATIONS,
  analyzePhotoPackage,
  clarificationsFor,
  scopeCategoriesFor,
} from "../photoAnalysis";
import type { BallparkAnswers } from "../types";

const answered = (value: string) => ({ status: "answered" as const, value, source: "manual" as const });

function answers(map: Record<string, string>): BallparkAnswers {
  return Object.fromEntries(
    Object.entries(map).map(([k, v]) => [k, answered(v)]),
  ) as unknown as BallparkAnswers;
}

const photo = (
  id: string,
  kind:
    | "room_photo"
    | "sketch_plan"
    | "rendering"
    | "detail_photo"
    | "exterior"
    | "damage_photo"
    | "unknown",
) => ({
  id,
  name: `${id}.jpg`,
  kind,
});

describe("photo analysis (V1, no vision provider)", () => {
  it("never claims the images were analyzed", () => {
    const a = analyzePhotoPackage({ photos: [photo("a", "room_photo")] });
    expect(a.analyzed).toBe(false);
    expect(a.provider).toBe("none");
    expect(a.notes.some((n) => n.code === "no-vision-provider")).toBe(true);
  });

  it("classifies the package and switches object scale off for sketches", () => {
    const a = analyzePhotoPackage({ photos: [photo("a", "sketch_plan"), photo("b", "sketch_plan")] });
    expect(a.dominantKind).toBe("sketch_plan");
    expect(a.objectScaleAvailable).toBe(false);
    expect(a.notes.some((n) => n.code === "sketch")).toBe(true);
  });

  it("refuses an existing-condition claim from a rendering", () => {
    const a = analyzePhotoPackage({
      photos: [photo("a", "rendering")],
      answers: answers({ "obs.wallsFinished": "yes" }),
    });
    expect(a.conditionStatus).toBe("unknown");
  });

  it("asks no more than eight questions and never repeats an answered one", () => {
    const ids = clarificationsFor({
      roomType: "kitchen",
      scopeType: "full",
      dominantKind: "room_photo",
      hasRoomPhoto: true,
      answered: new Set(["roomType"]),
      dimensionsKnown: false,
    });
    expect(ids.length).toBeLessThanOrEqual(MAX_CLARIFICATIONS);
    expect(ids).not.toContain("roomType");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps questions conditional on the project", () => {
    const garage = clarificationsFor({
      roomType: "garage",
      scopeType: "conversion",
      dominantKind: "room_photo",
      hasRoomPhoto: true,
      answered: new Set(),
      dimensionsKnown: false,
    });
    expect(garage).not.toContain("cabinets");
    expect(garage).toContain("wallRemoval");
  });

  it("drops the size-class question once dimensions are known", () => {
    const ids = clarificationsFor({
      roomType: "bedroom",
      scopeType: "cosmetic",
      dominantKind: "room_photo",
      hasRoomPhoto: true,
      answered: new Set(),
      dimensionsKnown: true,
    });
    expect(ids).not.toContain("sizeClass");
  });

  it("labels an allowance-grade footprint as photo_inferred, not measured", () => {
    const a = analyzePhotoPackage({
      photos: [photo("a", "room_photo")],
      answers: answers({ roomType: "garage", sizeClass: "medium" }),
    });
    const area = a.facts.find((f) => f.key === "floorAreaSf");
    expect(area?.sourceType).toBe("photo_inferred");
    expect(area?.confidence).toBeLessThan(0.5);
    expect(area?.basisKey).toBe("analysis.basis.sizeAllowance");
  });

  it("marks dimensions taken off a sketch as sketch_inferred", () => {
    const a = analyzePhotoPackage({
      photos: [photo("a", "sketch_plan")],
      answers: answers({ roomType: "garage", lengthFt: "20", widthFt: "12" }),
    });
    expect(a.facts.find((f) => f.key === "floorAreaSf")?.sourceType).toBe("sketch_inferred");
    expect(a.dimensionRangeFt?.areaSf).toBe(240);
  });

  it("only reports components a human confirmed, with image references", () => {
    const a = analyzePhotoPackage({
      photos: [photo("a", "room_photo")],
      answers: answers({ "obs.cabinetsPresent": "yes", "obs.visibleDamage": "no" }),
    });
    expect(a.visibleComponents).toEqual(["cabinetsPresent"]);
    expect(a.facts.find((f) => f.key === "obs.cabinetsPresent")?.imageIds).toEqual(["a"]);
  });

  it("derives scope categories from room, scope and components", () => {
    expect(scopeCategoriesFor("kitchen", "full", ["flooringToReplace"])).toEqual(
      expect.arrayContaining(["plumbing", "cabinetry", "demolition", "flooring"]),
    );
  });
});

describe("photo-assisted intake, phase 1", () => {
  it("caps clarifications at seven and keeps at least three worth asking", () => {
    const ids = clarificationsFor({
      roomType: "kitchen",
      scopeType: "full",
      dominantKind: "room_photo",
      hasRoomPhoto: true,
      answered: new Set(),
      dimensionsKnown: false,
    });
    expect(ids.length).toBeLessThanOrEqual(MAX_CLARIFICATIONS);
    expect(MAX_CLARIFICATIONS).toBe(7);
    expect(ids.length).toBeGreaterThanOrEqual(MIN_CLARIFICATIONS);
  });

  it("never asks about flooring from exterior shots but still asks about damage", () => {
    const ids = clarificationsFor({
      roomType: "exteriorSiding",
      scopeType: "cosmetic",
      dominantKind: "exterior",
      hasRoomPhoto: true,
      answered: new Set(),
      dimensionsKnown: true,
    });
    expect(ids).not.toContain("obs.flooringToReplace");
    expect(ids).toContain("obs.visibleDamage");
  });

  it("separates confirmed observations from uncertain ones", () => {
    const a = analyzePhotoPackage({
      photos: [photo("a", "damage_photo")],
      answers: answers({ "obs.visibleDamage": "yes" }),
    });
    expect(a.confirmedObservations).toContain("visibleDamage");
    expect(a.uncertainObservations).not.toContain("visibleDamage");
    expect(a.uncertainObservations).toContain("cabinetsPresent");
  });

  it("reports unknown measurements rather than inventing them", () => {
    const a = analyzePhotoPackage({ photos: [photo("a", "room_photo")] });
    expect(a.knownMeasurements).toEqual([]);
    expect(a.unknownMeasurements).toEqual(
      expect.arrayContaining(["lengthFt", "widthFt", "ceilingHeightFt"]),
    );
  });

  it("treats contractor-entered dimensions as known and confirmed", () => {
    const a = analyzePhotoPackage({
      photos: [photo("a", "room_photo")],
      answers: answers({ lengthFt: "20", widthFt: "12" }),
    });
    expect(a.knownMeasurements.map((m) => m.key)).toEqual(["lengthFt", "widthFt"]);
    expect(a.knownMeasurements[0]?.sourceType).toBe("user_confirmed");
    expect(a.unknownMeasurements).toEqual(["ceilingHeightFt"]);
  });
});
