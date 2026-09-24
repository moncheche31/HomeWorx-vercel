import { describe, expect, it } from "vitest";
import {
  acceptedRecommendations,
  containsInternalTerms,
  defaultDecisions,
  isDeterministicCopilotOnly,
  pendingCount,
  reviewProject,
  STANDARD_ITEMS,
  toCustomerPresentation,
  type CopilotReviewInput,
} from "../index";

const input = (over: Partial<CopilotReviewInput> = {}): CopilotReviewInput => ({
  projectName: "Miller Kitchen",
  locale: "en-US",
  items: [{ id: "1", title: "Install new cabinets", roomName: "Kitchen", materialSelection: "Quartz countertop", notes: null }],
  ...over,
});

describe("copilot review — section 1 standard items", () => {
  it("adds the standard construction items by default", () => {
    const review = reviewProject(input());
    const keys = review.sections[0].recommendations.map((r) => r.itemKey);
    expect(keys).toContain("standard.dust_containment");
    expect(keys).toContain("standard.floor_protection");
    expect(review.counts.standard_items).toBe(STANDARD_ITEMS.length);
    expect(review.sections[0].recommendations.every((r) => r.defaultDecision === "accepted")).toBe(true);
  });

  it("does not duplicate an item the contractor already scoped", () => {
    const review = reviewProject(
      input({ items: [{ id: "1", title: "Dust containment at kitchen entry", roomName: "Kitchen", materialSelection: null, notes: null }] }),
    );
    const keys = review.sections[0].recommendations.map((r) => r.itemKey);
    expect(keys).not.toContain("standard.dust_containment");
  });

  it("returns nothing at all when there is no scope", () => {
    const review = reviewProject(input({ items: [] }));
    expect(review.isEmpty).toBe(true);
  });
});

describe("copilot review — section 2 missing scope", () => {
  it("detects structural wall removal follow-on work", () => {
    const review = reviewProject(
      input({ items: [{ id: "1", title: "Remove load-bearing wall between kitchen and dining", roomName: "Kitchen", materialSelection: null, notes: null }] }),
    );
    const keys = review.sections[1].recommendations.map((r) => r.itemKey);
    expect(keys).toEqual(expect.arrayContaining([
      "missing.temporary_support",
      "missing.lvl_beam",
      "missing.engineering",
      "missing.permit",
      "missing.drywall_repair",
    ]));
  });

  it("detects cabinet accessories and never auto-approves them", () => {
    const review = reviewProject(input());
    const cabinets = review.sections[1].recommendations;
    expect(cabinets.map((r) => r.itemKey)).toContain("missing.countertop_template");
    expect(cabinets.every((r) => r.defaultDecision === "pending")).toBe(true);
  });

  it("matches Spanish scope text", () => {
    const review = reviewProject(
      input({ locale: "es-US", items: [{ id: "1", title: "Demoler muro de carga", roomName: "Cocina", materialSelection: null, notes: null }] }),
    );
    expect(review.counts.missing_scope).toBeGreaterThan(0);
    expect(review.sections[1].recommendations[0].label).toMatch(/[a-záéíóúñ]/i);
    expect(review.sections[1].recommendations.map((r) => r.itemKey)).toContain("missing.lvl_beam");
  });

  it("orders recommendations by confidence", () => {
    const review = reviewProject(
      input({ items: [{ id: "1", title: "Remove wall", roomName: "Kitchen", materialSelection: null, notes: null }] }),
    );
    expect(review.sections[1].recommendations[0].confidence).toBe("high");
  });
});

describe("copilot review — section 3 upsells", () => {
  it("suggests kitchen upgrades marked optional", () => {
    const review = reviewProject(input());
    const upsells = review.sections[2].recommendations;
    expect(upsells.map((r) => r.itemKey)).toContain("upsell.under_cabinet_lighting");
    expect(upsells.every((r) => r.confidence === "optional")).toBe(true);
    expect(upsells.every((r) => r.defaultDecision === "pending")).toBe(true);
  });

  it("suggests deck upgrades from a room type key", () => {
    const review = reviewProject(
      input({ items: [{ id: "1", title: "Rebuild surface", roomName: null, materialSelection: null, notes: null }], roomTypeKeys: ["deck"] }),
    );
    expect(review.sections[2].recommendations.map((r) => r.itemKey)).toContain("upsell.cable_railing");
  });
});

describe("copilot review — section 4 value engineering", () => {
  it("offers downgrade ladders with indicative savings", () => {
    const review = reviewProject(input());
    const ve = review.sections[3].recommendations;
    const counter = ve.find((r) => r.itemKey === "ve.countertop.laminate");
    expect(counter?.valueEngineering).toMatchObject({ fromKey: "quartz", toKey: "laminate" });
    expect(counter?.valueEngineering?.savingsPct).toBeGreaterThan(0);
    expect(ve.every((r) => r.defaultDecision === "pending")).toBe(true);
  });
});

describe("contractor control", () => {
  it("defaults only section 1 to accepted and tracks pending work", () => {
    const review = reviewProject(input());
    const decisions = defaultDecisions(review);
    expect(acceptedRecommendations(review, decisions)).toHaveLength(review.counts.standard_items);
    expect(pendingCount(review, decisions)).toBe(
      review.recommendations.length - review.counts.standard_items,
    );
  });

  it("honours a removal decision", () => {
    const review = reviewProject(input());
    const target = review.sections[0].recommendations[0];
    const decisions = { ...defaultDecisions(review), [target.id]: "removed" as const };
    expect(acceptedRecommendations(review, decisions).map((r) => r.id)).not.toContain(target.id);
  });
});

describe("customer presentation mode", () => {
  it("shows only accepted items and never uses internal terminology", () => {
    const review = reviewProject(input());
    const decisions = defaultDecisions(review);
    const presentation = toCustomerPresentation(review, decisions);
    expect(presentation.mode).toBe("customer");
    expect(presentation.lines.length).toBeGreaterThan(0);
    for (const line of presentation.lines) expect(containsInternalTerms(line)).toBe(false);
  });

  it("hides pending suggestions from the customer", () => {
    const review = reviewProject(input());
    const presentation = toCustomerPresentation(review, defaultDecisions(review));
    expect(presentation.lines.join(" ")).not.toContain("Countertop template");
  });

  it("produces Spanish customer copy", () => {
    const review = reviewProject(input({ locale: "es-US" }));
    const presentation = toCustomerPresentation(review, defaultDecisions(review));
    expect(presentation.lines[0]).toContain("Lo que incluimos");
  });
});

describe("provider registry", () => {
  it("is deterministic in version 1", () => {
    expect(isDeterministicCopilotOnly()).toBe(true);
  });
});
