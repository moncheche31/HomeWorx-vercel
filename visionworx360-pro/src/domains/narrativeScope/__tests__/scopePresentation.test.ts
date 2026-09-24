import { describe, expect, it } from "vitest";
import {
  generateNarrative,
  rawAnswerFragments,
  stripScopeArtifacts,
  translateAnswer,
} from "../index";

const sections = [{ id: "s1", name: "Framing & Insulation", roomId: null, sortOrder: 0 }];
const flooring = { id: "s2", name: "Flooring", roomId: null, sortOrder: 1 };

const item = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "i1",
  sectionId: "s1",
  roomId: null,
  title: "Frame walls",
  actionKey: "install",
  trade: "framing",
  quantity: null,
  unit: null,
  unitKey: null,
  materialSelection: null,
  finishSelection: null,
  customerNotes: null,
  isIncluded: true,
  isClientVisible: true,
  confidenceStatus: "confirmed",
  sortOrder: 0,
  ...over,
});

const base = {
  projectName: "Garage Conversion",
  locale: "en-US" as const,
  audience: "contractor" as const,
  rooms: [],
};

describe("scope presentation — semantic answers, no raw fragments", () => {
  it("never renders a raw answer value in the narrative", () => {
    const doc = generateNarrative({
      ...base,
      sections,
      items: [item()] as never,
      answers: {
        "topic:garage_door_disposition": "Removed and framed in",
        "topic:structural_wall": "Load-bearing",
        "topic:bath_exhaust_venting": "Through the wall",
        "topic:finish_level": "Standard",
        "topic:electrical_service": "Not sure yet",
        "topic:interior_door_style": "Yes, match existing",
        "review.missing.permit": "accepted",
      },
    } as never);

    for (const orphan of [
      "Removed and framed in.",
      "Load-bearing.",
      "Through the wall.",
      "Standard.",
      "Not sure yet.",
      "Yes, match existing.",
      "Accepted.",
    ]) {
      expect(doc.text).not.toContain(orphan);
    }

    expect(doc.text).toContain("Remove the existing garage door and frame in the opening.");
    expect(doc.text).toContain("is load-bearing");
    expect(doc.text).toContain("Vent the bathroom exhaust fan through the exterior wall.");
    expect(doc.text).toContain("standard-grade");
  });

  it("places translated statements under the matching section", () => {
    const doc = generateNarrative({
      ...base,
      sections: [sections[0], flooring],
      items: [item(), item({ id: "i2", sectionId: "s2", title: "Finished flooring" })] as never,
      answers: { "topic:flooring_selection": "Hardwood" },
    } as never);

    const group = doc.groups.find((g) => g.title === "Flooring");
    expect(group?.lines.some((l) => l.text.includes("hardwood flooring"))).toBe(true);
  });

  it("returns nothing for unknown context, unknown answers and decisions", () => {
    expect(translateAnswer("topic:electrical_service", "Not sure yet", "en-US")).toBeNull();
    expect(translateAnswer("topic:made_up_topic", "Whatever", "en-US")).toBeNull();
    expect(translateAnswer("review.upsell.led", "accepted", "en-US")).toBeNull();
    expect(translateAnswer("selection:abc", "Hardwood", "en-US")).toBeNull();
  });

  it("does not echo a note that restates the scope line", () => {
    const doc = generateNarrative({
      ...base,
      sections,
      items: [
        item({ title: "Close in existing back garage entry door", customerNotes: "Close in existing back garage entry door." }),
      ] as never,
      answers: {},
    } as never);
    expect(doc.text).not.toContain("Note:");
  });

  it("keeps a note that adds new information", () => {
    const doc = generateNarrative({
      ...base,
      sections,
      items: [item({ customerNotes: "Owner supplies the door hardware" })] as never,
      answers: {},
    } as never);
    expect(doc.text).toContain("Note: Owner supplies the door hardware.");
  });
});

describe("legacy wording cleanup", () => {
  const answers = {
    "topic:bath_exhaust_venting": "Through the wall",
    "topic:finish_level": "Standard",
    "selection:i1:Hardwood": "Hardwood",
  };

  it("scrubs orphan fragments, statuses and duplicated notes but keeps real scope", () => {
    const dirty = [
      "Garage Conversion",
      "",
      "Framing & Insulation",
      "Install close in existing back garage entry door.",
      "Note: Close in existing back garage entry door.",
      "Building permit.",
      "Hardwood.",
      "Through the wall.",
      "Standard.",
      "Accepted.",
      "",
      "Flooring",
      "Hardwood Flooring.",
      "",
      "Finish all work in accordance with local building code.",
    ].join("\n");

    const clean = stripScopeArtifacts(dirty, rawAnswerFragments(answers));

    expect(clean).not.toMatch(/^Note:/m);
    expect(clean).not.toMatch(/^Hardwood\.$/m);
    expect(clean).not.toMatch(/^Through the wall\.$/m);
    expect(clean).not.toMatch(/^Accepted\.$/m);
    expect(clean).toContain("Building permit.");
    expect(clean).toContain("Hardwood Flooring.");
    expect(clean).toContain("Install close in existing back garage entry door.");
    expect(stripScopeArtifacts(clean, rawAnswerFragments(answers))).toBe(clean);
  });

  it("preserves manually written contractor wording verbatim", () => {
    const manual = [
      "Garage Conversion",
      "",
      "Framing & Insulation",
      "Remove existing kitchen door to garage and close in.",
      "Furr out the north wall to accept 2 inch rigid insulation.",
    ].join("\n");
    expect(stripScopeArtifacts(manual)).toBe(manual);
  });
});
