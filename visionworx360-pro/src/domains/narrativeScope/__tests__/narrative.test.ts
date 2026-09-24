import { describe, expect, it } from "vitest";
import { detectQuestions, generateNarrative, type NarrativeSourceItem } from "../index";

function item(over: Partial<NarrativeSourceItem>): NarrativeSourceItem {
  return {
    id: "i1",
    title: "tile flooring",
    actionKey: "install",
    quantity: 240,
    unitKey: "square_foot",
    materialSelection: null,
    customerNotes: null,
    roomId: "r1",
    sectionId: "s1",
    isIncluded: true,
    isClientVisible: true,
    confidenceStatus: null,
    sortOrder: 0,
    ...over,
  };
}

const base = {
  projectName: "Garage Conversion",
  sections: [{ id: "s1", name: "Walkthrough", roomId: "r1", sortOrder: 0 }],
  rooms: [{ id: "r1", name: "Garage" }],
  locale: "en-US" as const,
};

describe("generateNarrative", () => {
  it("renders readable sentences grouped by room", () => {
    const doc = generateNarrative({ ...base, items: [item({})] });
    expect(doc.groups[0].title).toBe("Garage");
    expect(doc.groups[0].lines[0].text).toBe(
      "Install tile flooring (approximately 240 square feet).",
    );
    expect(doc.text).toContain("Finish all work in accordance with local building code.");
  });

  it("is deterministic", () => {
    const a = generateNarrative({ ...base, items: [item({}), item({ id: "i2", sortOrder: 1 })] });
    const b = generateNarrative({ ...base, items: [item({}), item({ id: "i2", sortOrder: 1 })] });
    expect(a.text).toEqual(b.text);
  });

  it("hides internal items from the customer audience", () => {
    const doc = generateNarrative({
      ...base,
      items: [item({ isClientVisible: false })],
      audience: "customer",
    });
    expect(doc.groups).toHaveLength(0);
  });

  it("supports Spanish", () => {
    const doc = generateNarrative({ ...base, locale: "es-US", items: [item({})] });
    expect(doc.groups[0].lines[0].text).toContain("Instalar");
    expect(doc.closing).toContain("código de construcción");
  });
});

describe("detectQuestions", () => {
  it("asks a high-value finish question when nothing is specified", () => {
    const qs = detectQuestions({
      items: [item({ id: "a", title: "paint walls", materialSelection: null })],
    });
    expect(qs.map((q) => q.topic)).toEqual(["finish_level"]);
  });

  it("does not repeat answered questions", () => {
    const qs = detectQuestions({
      items: [item({ id: "a", title: "paint walls" })],
      answers: { "topic:finish_level": "Premium" },
    });
    expect(qs).toHaveLength(0);
  });
});
