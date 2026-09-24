import { describe, expect, it } from "vitest";
import {
  generateNarrative,
  isDecisionAnswer,
  stripDecisionLines,
  summarizeDecisions,
} from "../index";

const baseInput = {
  projectName: "Garage Conversion",
  locale: "en-US" as const,
  audience: "contractor" as const,
  items: [
    {
      id: "i1",
      sectionId: "s1",
      roomId: null,
      title: "Hardwood flooring",
      trade: "flooring",
      action: "install",
      quantity: 288,
      unit: "square_foot",
      materialSelection: null,
      finishSelection: null,
      customerNotes: null,
      isIncluded: true,
      isClientVisible: true,
      confidenceStatus: "confirmed",
      sortOrder: 0,
    },
  ] as never,
  sections: [{ id: "s1", name: "Garage", roomId: null, sortOrder: 0 }],
  rooms: [],
};

describe("narrative scope decision hygiene", () => {
  it("never renders decision statuses in the visible narrative", () => {
    const doc = generateNarrative({
      ...baseInput,
      answers: {
        "review.standard.floor_protection": "accepted",
        "review.upsell.led": "removed",
        // Contractor free text against an item decision is real prose.
        "decision:i1": "Garage door is removed and framed in",
      },
    } as never);

    // No standalone status line; legitimate prose using the word survives.
    expect(doc.text.split("\n").some((line) => /^(accepted|removed|approved)\.?$/i.test(line.trim()))).toBe(false);
    expect(doc.text).toContain("Garage door is removed and framed in");

  });


  it("classifies decision answers in EN and ES", () => {
    expect(isDecisionAnswer("review.x", "accepted")).toBe(true);
    expect(isDecisionAnswer("q.a", "Aprobado.")).toBe(true);
    expect(isDecisionAnswer("q.a", "Eliminado")).toBe(true);
    expect(isDecisionAnswer("q.a", "Install new drywall throughout")).toBe(false);
  });

  it("strips orphaned tokens from saved wording and is idempotent", () => {
    const dirty = [
      "Garage Conversion",
      "",
      "Garage",
      "Install hardwood flooring, approximately 288 square feet.",
      "Approved.",
      "Accepted.",
      "Removed.",
      "Aprobado.",
      "",
      "All work per plans.",
    ].join("\n");

    const clean = stripDecisionLines(dirty);
    expect(clean).not.toMatch(/Approved|Accepted|Removed|Aprobado/);
    expect(clean).toContain("Install hardwood flooring");
    expect(clean).toContain("All work per plans.");
    expect(stripDecisionLines(clean)).toBe(clean);
  });

  it("summarizes decisions for the history surface only", () => {
    expect(
      summarizeDecisions({ "review.a": "accepted", "review.b": "removed", "q.c": "text" }),
    ).toEqual({ accepted: 1, removed: 1, total: 2 });
  });
});
