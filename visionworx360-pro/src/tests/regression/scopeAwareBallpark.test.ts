import { describe, expect, it } from "vitest";
import {
  buildBallpark,
  deriveWorkDomains,
  HIGH_VALUE_INPUTS,
  QUICK_BALLPARK_SCHEMA,
  schemaForScope,
  signalsFromNarrative,
  unresolvedQuestions,
  visibleQuestions,
  type BallparkAnswers,
} from "@/domains/ballpark";
import { selectBallparkClarifications } from "@/domains/estimating/modes";

/** The live pilot job: 94" cabinet run, countertop, one receptacle move. */
const CABINET_SCOPE = [
  { key: "cabinets.base.install", title: 'Install base cabinets, 94" run', tradeKey: "cabinetry" },
  { key: "cabinets.upper.install", title: "Install upper cabinets", tradeKey: "cabinetry" },
  { key: "countertops.replace", title: "New quartz countertop", tradeKey: "countertops" },
  { key: "electrical.receptacle", title: "Relocate one receptacle", tradeKey: "electrical" },
];

const GARAGE_SCOPE = [
  { key: "conversion.master_suite", title: "Garage conversion to master suite", tradeKey: "framing" },
  { key: "drywall.hang_finish", title: "Drywall walls and ceiling", tradeKey: "drywall" },
  { key: "electrical.moderate", title: "Electrical rough-in", tradeKey: "electrical" },
];

const ANSWERS: BallparkAnswers = {
  lengthFt: { status: "answered", value: 12 },
  widthFt: { status: "answered", value: 10 },
};

const ROOM_GEOMETRY_QUESTIONS = [
  "lengthFt",
  "widthFt",
  "ceilingHeightFt",
  "useOfSpace",
  "bathroom",
  "closet",
  "partitions",
  "partitionLfKnown",
  "raisedFloor",
  "insulationWalls",
  "insulationCeiling",
  "insulationFloor",
  "drywall",
  "flooringQuality",
  "newDoors",
  "newWindows",
  "plumbing",
];

describe("scope-aware ballpark questioning", () => {
  it("recognizes the work domains present in the scope", () => {
    const domains = deriveWorkDomains(CABINET_SCOPE);
    expect(domains).toEqual(expect.arrayContaining(["cabinets", "countertops", "electrical"]));
    expect(domains).not.toContain("room_conversion");
    expect(domains).not.toContain("flooring");
  });

  it("treats cabinet doors as cabinetry, not an openings trade", () => {
    const domains = deriveWorkDomains([
      { key: "cabinets.doors", title: "Replace cabinet doors and drawer fronts", tradeKey: "cabinetry" },
    ]);
    expect(domains).not.toContain("openings");
  });

  it("never asks whole-room geometry on a cabinet job", () => {
    const schema = schemaForScope(CABINET_SCOPE);
    const ids = visibleQuestions(schema, {}).map((q) => q.id);
    for (const irrelevant of ROOM_GEOMETRY_QUESTIONS) {
      expect(ids).not.toContain(irrelevant);
    }
  });

  it("surfaces zero generic room-geometry critical questions in Improve Accuracy", () => {
    const schema = schemaForScope(CABINET_SCOPE);
    const answers: BallparkAnswers = {
      finishLevel: { status: "answered", value: "economy" },
    };
    const askable = new Set(unresolvedQuestions(schema, answers).map((q) => q.id));
    const missing = selectBallparkClarifications(
      visibleQuestions(schema, answers).filter(
        (q) =>
          askable.has(q.id) &&
          HIGH_VALUE_INPUTS.includes(q.id) &&
          answers[q.id]?.status !== "answered",
      ),
    );
    const missingIds = missing.map((q) => q.id);
    // The exact live symptom: the first follow-up was "How long is the space?".
    expect(missingIds[0]).not.toBe("lengthFt");
    for (const irrelevant of ROOM_GEOMETRY_QUESTIONS) {
      expect(missingIds).not.toContain(irrelevant);
    }
    // Only genuinely in-scope trades may remain (the receptacle relocation).
    expect(missingIds.every((id) => !ROOM_GEOMETRY_QUESTIONS.includes(id))).toBe(true);
    expect(missingIds).toEqual(["electrical"]);
  });

  it("does not re-ask a finish level that is already selected", () => {
    const schema = schemaForScope(CABINET_SCOPE);
    const answers: BallparkAnswers = { finishLevel: { status: "answered", value: "economy" } };
    expect(unresolvedQuestions(schema, answers).map((q) => q.id)).not.toContain("finishLevel");
    expect(unresolvedQuestions(schema, {}).map((q) => q.id)).toContain("finishLevel");
  });

  it("suppresses a question whose fact is already known from intake", () => {
    const schema = schemaForScope(GARAGE_SCOPE);
    const known = { lengthFt: 24, widthFt: 20 };
    const ids = unresolvedQuestions(schema, {}, known).map((q) => q.id);
    expect(ids).not.toContain("lengthFt");
    expect(ids).not.toContain("widthFt");
  });

  it("derives scope from the approved narrative when no scope rows exist", () => {
    // The live Kitchen Cabinets project: approved narrative, zero scope_items.
    const narrative = [
      "Kitchen Cabinets",
      "Kitchen",
      "Modify one electrical device relocated to counter height (approximately 1 each).",
      "Install kitchen base cabinetry (approximately 7.83 linear feet) using mid grade.",
      "Install upper cabinetry (approximately 7.83 linear feet) using mid grade.",
      "Finish all work in accordance with local building code.",
    ].join("\n");
    const schema = schemaForScope(signalsFromNarrative(narrative));
    const ids = schema.questions.map((q) => q.id);
    expect(ids).not.toContain("lengthFt");
    expect(ids).not.toContain("widthFt");
    expect(ids).not.toContain("raisedFloor");
    expect(ids).toContain("electrical");
  });

  it("keeps the full conversion interview for a garage conversion", () => {
    const schema = schemaForScope(GARAGE_SCOPE);
    const ids = schema.questions.map((q) => q.id);
    expect(ids).toContain("lengthFt");
    expect(ids).toContain("widthFt");
    expect(ids).toContain("ceilingHeightFt");
    expect(ids).toContain("partitions");
    /* Every base conversion question survives (the scope may add trade-specific ones). */
    for (const base of QUICK_BALLPARK_SCHEMA.questions) {
      expect(ids).toContain(base.id);
    }
  });

  it("does not assume or price out-of-scope work on a cabinet job", () => {
    const result = buildBallpark(ANSWERS, { schema: schemaForScope(CABINET_SCOPE) });
    const assumptionKeys = result.assumptions.map((a) => a.key);
    for (const key of ["partitions", "bathroom", "closet", "dimensions", "floorArea", "wallArea"]) {
      expect(assumptionKeys).not.toContain(key);
    }

    const itemKeys = result.quantities.map((q) => q.itemKey);
    expect(itemKeys).not.toContain("framing.partition_wall");
    expect(itemKeys).not.toContain("framing.raised_floor");
    expect(itemKeys.some((k) => k.startsWith("insulation."))).toBe(false);
    expect(itemKeys.some((k) => k.startsWith("drywall."))).toBe(false);
    expect(itemKeys.some((k) => k.startsWith("flooring."))).toBe(false);

    const unknownIds = result.unknowns.map((u) => u.questionId);
    for (const id of ROOM_GEOMETRY_QUESTIONS) {
      expect(unknownIds).not.toContain(id);
    }
  });

  it("leaves the conversion ballpark unchanged", () => {
    const base = buildBallpark(ANSWERS);
    const scoped = buildBallpark(ANSWERS, { schema: schemaForScope(GARAGE_SCOPE) });
    expect(scoped.band).toEqual(base.band);
  });
});
