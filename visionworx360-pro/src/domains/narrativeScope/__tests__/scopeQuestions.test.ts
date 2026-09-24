import { describe, expect, it } from "vitest";
import { detectQuestions } from "../questions";
import type { NarrativeSourceItem } from "../types";

let seq = 0;
const item = (title: string, over: Partial<NarrativeSourceItem> = {}): NarrativeSourceItem => ({
  id: `i${seq++}`,
  title,
  actionKey: null,
  quantity: null,
  unitKey: null,
  materialSelection: null,
  customerNotes: null,
  roomId: null,
  sectionId: "s1",
  isIncluded: true,
  isClientVisible: true,
  confidenceStatus: null,
  sortOrder: 0,
  ...over,
});

/** The live Garage Conversion scope (included items, 2026-08-10). */
const garageItems = [
  "Paint walls and ceilings",
  "Frame an approximately 16' x 18' platform floor using 2 x 8 lumber and 3/4\" Advantech",
  "Shower tile",
  "New circuits, outlets, lighting",
  "Install finished flooring",
  "Extend HVAC to new space",
  "Hang, tape, finish drywall",
  "Install/replace baseboards",
  "Hardwood Flooring",
  "Prime and paint trim",
  "Install interior doors and trim",
  "Prime and paint walls and ceilings",
  "Add GFCI receptacles at counters",
  "Insulate walls, ceiling, floor",
  "Close in existing back garage entry door",
  "Move and reframe 1 garage window",
  "Remove and reframe 1 large egress window",
  "Cut out and frame opening for new entry door to master bedroom from existing dining room",
  "Vanity 60\u201d double sink",
  "Remove existing garage partition wall",
  "Remove existing back entry door",
  "Install rough plumbing for bathroom fixtures",
].map((t) => item(t));

const garage = () =>
  detectQuestions({
    items: garageItems,
    projectName: "Garage Conversion",
    hasGeometry: true,
    narrativeText: "18 ft by 16 ft garage conversion with 12 ft ceiling, full bathroom.",
  });

describe("scope clarification questions", () => {
  it("never asks for geometry-derivable measurements", () => {
    const topics = garage().map((q) => q.topic);
    expect(topics).not.toContain("quantity");
    expect(garage().every((q) => q.answerType !== "text" || q.topic === "customer_decision")).toBe(
      true,
    );
  });

  it("suppresses flooring selection when hardwood is already specified", () => {
    expect(garage().map((q) => q.topic)).not.toContain("flooring_selection");
  });

  it("suppresses HVAC strategy when the scope says extend HVAC", () => {
    expect(garage().map((q) => q.topic)).not.toContain("hvac_strategy");
  });

  it("suppresses window questions when openings are already described", () => {
    expect(garage().map((q) => q.topic)).not.toContain("opening_disposition");
  });

  it("suppresses bathroom fixture questions when a shower is in scope", () => {
    expect(garage().map((q) => q.topic)).not.toContain("bath_fixture_type");
  });

  it("shows at most five ranked questions", () => {
    const qs = garage();
    expect(qs.length).toBeLessThanOrEqual(5);
    expect(qs.map((q) => q.priority)).toEqual([...qs.map((q) => q.priority)].sort((a, b) => b - a));
  });

  it("asks the garage door disposition while it is genuinely unknown", () => {
    expect(garage().map((q) => q.topic)).toContain("garage_door_disposition");
  });

  it("produces zero questions when everything is resolved", () => {
    const qs = detectQuestions({
      items: [item("Repaint bedroom, premium finish")],
      narrativeText: "Premium repaint only.",
    });
    expect(qs).toHaveLength(0);
  });

  it("drops stale questions once the scope answers them", () => {
    const before = detectQuestions({ items: [item("Remove garage partition wall")] });
    expect(before.map((q) => q.topic)).toContain("structural_wall");
    const after = detectQuestions({
      items: [item("Remove non-load-bearing garage partition wall")],
    });
    expect(after.map((q) => q.topic)).not.toContain("structural_wall");
  });

  it("collapses semantically duplicate items into one topic question", () => {
    const qs = detectQuestions({
      items: [item("Paint walls and ceilings"), item("Prime and paint walls and ceilings")],
    });
    expect(qs.filter((q) => q.topic === "finish_level")).toHaveLength(1);
  });

  it("marks substantive vs wording-only answers", () => {
    const qs = garage();
    expect(qs.find((q) => q.topic === "garage_door_disposition")?.substantive).toBe(true);
    const finish = detectQuestions({ items: [item("Paint walls")] })[0];
    expect(finish.substantive).toBe(false);
  });

  it("surfaces item-level customer decisions first", () => {
    const qs = detectQuestions({
      items: [item("Countertop selection", { confidenceStatus: "customer_decision_required" })],
    });
    expect(qs[0].topic).toBe("customer_decision");
    expect(qs[0].answerType).toBe("text");
  });
});
