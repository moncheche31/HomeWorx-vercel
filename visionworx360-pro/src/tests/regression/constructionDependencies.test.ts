import { describe, expect, it } from "vitest";
import { detectConstructionDependencies } from "@/domains/constructionDependencies";
import { detectQuestions } from "@/domains/narrativeScope";

const ask = (narrativeText: string, answers: Record<string, string> = {}) =>
  detectQuestions({
    items: [],
    answers,
    narrativeText,
    projectName: "Test project",
    hasGeometry: false,
    geometry: null,
  }).map((q) => q.topic);

describe("construction dependency: load-bearing wall determination", () => {
  it("asks when a wall is being removed and load-bearing status was never stated", () => {
    const text = "We're taking down the wall between the kitchen and the dining room to open up the space.";
    expect(detectConstructionDependencies(text).map((d) => d.rule.id)).toEqual(["load_bearing_wall"]);
    expect(ask(text)).toContain("structural_wall");
  });

  it("does not ask when the contractor already said it is load-bearing", () => {
    const text = "Remove the load-bearing wall between the kitchen and dining room.";
    expect(detectConstructionDependencies(text)).toHaveLength(0);
    expect(ask(text)).not.toContain("structural_wall");
  });

  it("does not ask when he already said it is not load-bearing", () => {
    const text = "We're removing that wall, it's a non-load-bearing partition wall.";
    expect(detectConstructionDependencies(text)).toHaveLength(0);
    expect(ask(text)).not.toContain("structural_wall");
  });

  it("does not ask when a beam/header is already in the narrated scope", () => {
    const text = "Remove the wall and install a new LVL beam with posts each end.";
    expect(detectConstructionDependencies(text)).toHaveLength(0);
  });

  it("does not fire without a wall removal", () => {
    expect(detectConstructionDependencies("Replace the deck railing and add a header over the slider")).toHaveLength(0);
    expect(detectConstructionDependencies("Paint all the walls in the bedroom")).toHaveLength(0);
  });

  it("is not re-asked once answered", () => {
    const text = "Knock down the wall to open up the living room.";
    expect(ask(text, { "topic:structural_wall": "load_bearing" })).not.toContain("structural_wall");
  });
});
