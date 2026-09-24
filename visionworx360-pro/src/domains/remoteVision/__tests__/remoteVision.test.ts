import { describe, expect, it } from "vitest";
import {
  analyzeDescription,
  buildAssumptions,
  buildQuestions,
  buildRemoteNarrative,
  buildScenarios,
  collectFeatures,
  isDeterministicVisionOnly,
  type RemoteVisionMedia,
  type VisionAnalysisRequest,
} from "..";

const DESCRIPTION =
  "Remove the wall between the kitchen and dining room. Install an LVL beam. " +
  "Replace all cabinets with painted shaker cabinets. Install quartz countertops. " +
  "Add an island. Install recessed lighting. Replace flooring with LVP. Paint entire first floor.";

const media: RemoteVisionMedia[] = [
  {
    id: "m1",
    kind: "before_photo",
    fileName: "before.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 100,
    previewUrl: null,
    storagePath: null,
    roomHint: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const request: VisionAnalysisRequest = { locale: "en-US", description: DESCRIPTION, media };

describe("remote vision analysis", () => {
  it("ships with no AI provider wired in", () => {
    expect(isDeterministicVisionOnly()).toBe(true);
  });

  it("detects rooms, structural, and finish work from the description", () => {
    const result = analyzeDescription(request);
    expect(result.rooms.map((r) => r.roomTypeKey)).toEqual(
      expect.arrayContaining(["kitchen", "dining_room"]),
    );
    expect(result.structuralChanges.map((s) => s.changeKind)).toEqual(
      expect.arrayContaining(["wall_removal", "beam"]),
    );
    expect(collectFeatures(result).length).toBeGreaterThan(5);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("returns an empty, zero-confidence result for an empty description", () => {
    const result = analyzeDescription({ ...request, description: "" });
    expect(collectFeatures(result)).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  it("is deterministic", () => {
    expect(analyzeDescription(request)).toEqual(analyzeDescription(request));
  });
});

describe("assumption engine", () => {
  it("assumes reasonable grades and honours contractor overrides", () => {
    const result = analyzeDescription(request);
    const auto = buildAssumptions(result, DESCRIPTION);
    const countertop = auto.find((a) => a.topic === "countertop_material");
    expect(countertop?.selectedKey).toBe("quartz");

    const overridden = buildAssumptions(result, DESCRIPTION, {
      "assumption:cabinet_grade": "premium",
    });
    const cabinets = overridden.find((a) => a.topic === "cabinet_grade");
    expect(cabinets?.selectedKey).toBe("premium");
    expect(cabinets?.isAutomatic).toBe(false);
  });
});

describe("estimate scenarios", () => {
  it("produces three ordered levels with ranges, labor, and duration", () => {
    const result = analyzeDescription(request);
    const assumptions = buildAssumptions(result, DESCRIPTION);
    const scenarios = buildScenarios(result, assumptions, "en-US");

    expect(scenarios.map((s) => s.level)).toEqual(["economy", "mid_range", "premium"]);
    for (const s of scenarios) {
      expect(s.costLow).toBeLessThan(s.costHigh);
      expect(s.laborHours).toBeGreaterThan(0);
      expect(s.durationDays).toBeGreaterThan(0);
      expect(s.drivers.length).toBeGreaterThan(0);
    }
    expect(scenarios[0].costHigh).toBeLessThan(scenarios[2].costHigh);
  });
});

describe("questions", () => {
  it("asks only about detected, unconfirmed decisions", () => {
    const result = analyzeDescription(request);
    const assumptions = buildAssumptions(result, DESCRIPTION, {
      "assumption:flooring_type": "lvp",
    });
    const questions = buildQuestions(result, assumptions);
    const topics = questions.map((q) => q.topic);
    expect(topics).toContain("cabinet_manufacturer");
    expect(topics).not.toContain("flooring_type");
    expect(buildQuestions(result, assumptions, { "question:cabinet_manufacturer": "Stock" }).map(
      (q) => q.topic,
    )).not.toContain("cabinet_manufacturer");
  });
});

describe("narrative", () => {
  it("generates plain-language scope text in both locales", () => {
    const result = analyzeDescription(request);
    const assumptions = buildAssumptions(result, DESCRIPTION);
    const en = buildRemoteNarrative({ projectName: "Maple St", locale: "en-US", result, assumptions });
    const es = buildRemoteNarrative({
      projectName: "Maple St",
      locale: "es-US",
      result,
      assumptions,
    });
    expect(en.text.length).toBeGreaterThan(50);
    expect(es.text.length).toBeGreaterThan(50);
    expect(en.text).not.toEqual(es.text);
  });
});
