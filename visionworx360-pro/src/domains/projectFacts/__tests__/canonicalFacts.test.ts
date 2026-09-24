import { describe, expect, it } from "vitest";
import {
  BALLPARK_QUESTION_FACT,
  eligibleBallparkQuestionIds,
  hasSubstantiveAnswerChange,
  resolveProjectFacts,
  substantiveAnswerChanges,
} from "@/domains/projectFacts";
import { QUICK_BALLPARK_SCHEMA } from "@/domains/ballpark";
import { detectQuestions } from "@/domains/narrativeScope";

/** The live Garage Conversion facts, as persisted today. */
const GARAGE_GEOMETRY = {
  lengthFt: 18,
  widthFt: 16,
  ceilingHeightFt: 12,
  interiorPartitionLf: 20,
  openings: [
    { kind: "door" },
    { kind: "door" },
    { kind: "window" },
    { kind: "window" },
  ],
};

const GARAGE_ITEMS = [
  { title: "Remove existing garage partition wall", isIncluded: true },
  { title: "Frame walls to code", isIncluded: true },
  { title: "Insulate walls and ceiling", isIncluded: true },
  { title: "Insulate raised floor system", isIncluded: true },
  { title: "Hang and finish drywall", isIncluded: true },
  { title: "Hardwood flooring", isIncluded: true },
  { title: "Prime and paint walls and ceilings", isIncluded: true },
  { title: "Full bathroom with 60\" double vanity and shower", isIncluded: true },
  { title: "New shutoffs and supply lines", isIncluded: true },
  { title: "GFCI receptacles and lighting circuits", isIncluded: true },
  { title: "Extend HVAC to the new bedroom", isIncluded: true },
  { title: "Install two interior doors and two egress windows", isIncluded: true },
];

const garageFacts = () =>
  resolveProjectFacts({
    projectName: "Garage Conversion",
    geometry: GARAGE_GEOMETRY,
    items: GARAGE_ITEMS,
    narrativeText: "Convert the garage into a bedroom with a full bathroom, standard finishes.",
  });

const allQuestionIds = QUICK_BALLPARK_SCHEMA.questions.map((q) => q.id);

describe("canonical project facts", () => {
  it("resolves geometry, scope and narrative into one fact set", () => {
    const facts = garageFacts();
    expect(facts.hasGeometry).toBe(true);
    expect(facts.facts["dimensions.length"]?.source).toBe("geometry");
    expect(facts.facts["openings.doors"]?.value).toBe(2);
    expect(facts.facts["bathroom"]).toBeTruthy();
    expect(facts.facts["drywall"]).toBeTruthy();
  });

  it("every ballpark question maps to a stable semantic fact key", () => {
    for (const id of allQuestionIds) {
      expect(BALLPARK_QUESTION_FACT[id], `missing fact mapping for ${id}`).toBeTruthy();
    }
  });

  it("Full Interview asks nothing already known for the Garage Conversion", () => {
    const remaining = eligibleBallparkQuestionIds(allQuestionIds, garageFacts());
    for (const suppressed of [
      "lengthFt",
      "widthFt",
      "ceilingHeightFt",
      "bathroom",
      "drywall",
      "flooringQuality",
      "plumbing",
      "electrical",
      "insulationWalls",
      "insulationCeiling",
      "newDoors",
      "newWindows",
      "partitions",
    ]) {
      expect(remaining).not.toContain(suppressed);
    }
  });

  it("never shows more than five remaining questions", () => {
    const bare = resolveProjectFacts({ projectName: "New job" });
    expect(eligibleBallparkQuestionIds(allQuestionIds, bare).length).toBeLessThanOrEqual(5);
  });

  it("prior interview answers suppress the same question on a later open", () => {
    const withAnswers = resolveProjectFacts({
      projectName: "New job",
      priorAnswers: {
        lengthFt: { status: "answered", value: 18 },
        widthFt: { status: "answered", value: 16 },
        useOfSpace: { status: "answered", value: "bedroom" },
      },
    });
    const remaining = eligibleBallparkQuestionIds(allQuestionIds, withAnswers);
    expect(remaining).not.toContain("lengthFt");
    expect(remaining).not.toContain("widthFt");
    expect(remaining).not.toContain("useOfSpace");
  });

  it("both entry points suppress a fact once the narrative answers it", () => {
    const before = detectQuestions({
      items: [{ ...GARAGE_ITEMS[0], id: "1", actionKey: null, quantity: null, unitKey: null, materialSelection: null, customerNotes: null, roomId: null, sectionId: "s", isClientVisible: true, confidenceStatus: null, sortOrder: 0 }],
      narrativeText: "Remove the wall between the garage and the house.",
      projectName: "Garage Conversion",
      geometry: GARAGE_GEOMETRY,
    });
    expect(before.some((q) => q.topic === "structural_wall")).toBe(true);

    const after = detectQuestions({
      items: [{ ...GARAGE_ITEMS[0], id: "1", actionKey: null, quantity: null, unitKey: null, materialSelection: null, customerNotes: null, roomId: null, sectionId: "s", isClientVisible: true, confidenceStatus: null, sortOrder: 0 }],
      narrativeText:
        "Remove the wall between the garage and the house; it is non load-bearing per the engineer.",
      projectName: "Garage Conversion",
      geometry: GARAGE_GEOMETRY,
    });
    expect(after.some((q) => q.topic === "structural_wall")).toBe(false);

    /* And the same fact suppresses the ballpark partition question. */
    const facts = resolveProjectFacts({
      projectName: "Garage Conversion",
      geometry: GARAGE_GEOMETRY,
    });
    expect(eligibleBallparkQuestionIds(allQuestionIds, facts)).not.toContain("partitions");
  });
});

describe("ballpark recalculation gate", () => {
  const answers = {
    lengthFt: { status: "answered", value: 18 },
    widthFt: { status: "answered", value: 16 },
  };

  it("completing an interview with no changes is not a pricing event", () => {
    expect(hasSubstantiveAnswerChange(answers, { ...answers })).toBe(false);
    expect(substantiveAnswerChanges(answers, { ...answers })).toEqual([]);
  });

  it("re-answering with the same value is not a change", () => {
    expect(
      hasSubstantiveAnswerChange(answers, {
        ...answers,
        widthFt: { status: "answered", value: "16" },
      }),
    ).toBe(false);
  });

  it("a genuinely new fact is a change", () => {
    expect(
      substantiveAnswerChanges(answers, {
        ...answers,
        bathroom: { status: "answered", value: "full" },
      }),
    ).toEqual(["bathroom"]);
  });

  it("an altered fact is a change", () => {
    expect(
      substantiveAnswerChanges(answers, {
        ...answers,
        widthFt: { status: "answered", value: 20 },
      }),
    ).toEqual(["widthFt"]);
  });

  it("clearing an answer never rewrites pricing", () => {
    expect(hasSubstantiveAnswerChange(answers, { ...answers, widthFt: { status: "skipped" } })).toBe(
      false,
    );
  });
});
