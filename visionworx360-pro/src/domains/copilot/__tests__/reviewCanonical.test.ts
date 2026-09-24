import { describe, expect, it } from "vitest";
import {
  factsFromDecisions,
  planReviewCommit,
  reviewFactKey,
  reviewProject,
  suppressAnsweredRecommendations,
  type CopilotReviewInput,
} from "../index";

const input: CopilotReviewInput = {
  projectName: "Garage Conversion",
  locale: "en-US",
  items: [
    { id: "1", title: "Install new drywall", roomName: "Garage", materialSelection: null, notes: null },
  ],
};

describe("Estimate Review — canonical fact model", () => {
  it("uses stable semantic fact ids shared with the other question surfaces", () => {
    expect(reviewFactKey("standard.floor_protection")).toBe("review.standard.floor_protection");
  });

  it("never re-asks a recommendation the contractor already decided", () => {
    const review = reviewProject(input);
    const first = review.recommendations[0];
    const answers = { [reviewFactKey(first.itemKey)]: "accepted" };
    const next = suppressAnsweredRecommendations(review, answers);
    expect(next.recommendations.some((r) => r.itemKey === first.itemKey)).toBe(false);
    expect(next.recommendations.length).toBe(review.recommendations.length - 1);
  });

  it("no substantive change means no fact patch and no recalculation", () => {
    const review = reviewProject(input);
    const decisions = Object.fromEntries(review.recommendations.map((r) => [r.id, "accepted" as const]));
    const persisted = factsFromDecisions(review, decisions);
    const plan = planReviewCommit(review, decisions, persisted);
    expect(plan.hasFactChange).toBe(false);
    expect(plan.shouldRecalculate).toBe(false);
    expect(plan.additions).toHaveLength(0);
  });

  it("one cost-driving acceptance updates facts and recalculates exactly once", () => {
    const review = reviewProject(input);
    const rec = review.recommendations.find((r) => r.sectionKey === "standard_items");
    expect(rec).toBeTruthy();
    const plan = planReviewCommit(review, { [rec!.id]: "accepted" }, {});
    expect(plan.hasFactChange).toBe(true);
    expect(plan.shouldRecalculate).toBe(true);
    expect(plan.additions).toHaveLength(1);
    expect(plan.factPatch[reviewFactKey(rec!.itemKey)]).toBe("accepted");
  });

  it("a removal is remembered but never re-prices the estimate", () => {
    const review = reviewProject(input);
    const rec = review.recommendations[0];
    const plan = planReviewCommit(review, { [rec.id]: "removed" }, {});
    expect(plan.hasFactChange).toBe(true);
    expect(plan.shouldRecalculate).toBe(false);
  });

  it("decisions survive a reload through the persisted answer map", () => {
    const review = reviewProject(input);
    const rec = review.recommendations[0];
    const persisted = factsFromDecisions(review, { [rec.id]: "accepted" });
    const plan = planReviewCommit(review, { [rec.id]: "accepted" }, persisted);
    expect(plan.hasFactChange).toBe(false);
  });
});
