import { describe, expect, it } from "vitest";
import { analyzeDescription } from "@/domains/remoteVision/analyze";
import { buildRemoteNarrative } from "@/domains/remoteVision/narrative";
import { buildScenarios } from "@/domains/remoteVision/scenarios";
import { priceFeature } from "@/domains/remoteVision/canonicalPricing";
import { mergeDescriptionBody } from "@/domains/remoteVision/descriptionMerge";
import type { DetectedFeatureBase } from "@/domains/remoteVision/types";

/**
 * Live regression from project "Kitchen Cabinet adds": one narration stating
 * THREE work items produced a single base-cabinetry line priced at a silent
 * quantity of 1, and the breakfast bar was thrown away as an exclusion.
 */
const NARRATION =
  "OK, what we're doing here is we are. When we close up the existing kitchen door " +
  "that goes into the garage now, we're going to put a pantry cabinet there and then " +
  "we're going to put a breakfast bar that seats probably 3 coming out from that wall. " +
  "Almost like an island. That separates the the new dining room from the kitchen. " +
  "But it's going to be a breakfast bar, not not an island.";

function analyze() {
  return analyzeDescription({
    description: NARRATION,
    media: [],
    locale: "en-US",
    confirmedMeasurements: [],
  } as never);
}

describe("multi-item narration recognition", () => {
  it("recognizes each stated work item instead of collapsing to one", () => {
    const keys = (analyze().grounded?.explicit ?? []).map((i) => i.featureKey);
    expect(keys).toContain("cabinets.replace");
    expect(keys).toContain("cabinets.island");
    expect(keys).toContain("carpentry.opening_infill");
  });

  it("shows the contractor's own words, not the internal subject name", () => {
    const explicit = analyze().grounded?.explicit ?? [];
    const bar = explicit.find((i) => i.featureKey === "cabinets.island");
    expect(bar?.label).toBe("Breakfast bar");
    const pantry = explicit.find((i) => i.featureKey === "cabinets.replace");
    expect(pantry?.label).toBe("Pantry cabinet");
    expect(explicit.map((i) => i.label)).not.toContain("Island");
  });

  it("treats descriptive contrast as description, not an exclusion", () => {
    const observations = analyze().grounded?.observations ?? [];
    expect(observations.map((o) => o.id)).not.toContain("observation:cabinets.island");
  });


  it("never adopts an unrelated spoken number as an opening count", () => {
    const infill = (analyze().grounded?.explicit ?? []).find(
      (i) => i.featureKey === "carpentry.opening_infill",
    );
    expect(infill?.quantity ?? 1).toBe(1);
  });
});

describe("the written scope reads back the contractor's words", () => {
  it("names the pantry cabinet and breakfast bar, not the catalog subject", () => {
    const text = buildRemoteNarrative({
      projectName: "Kitchen Cabinet adds",
      locale: "en-US",
      result: analyze(),
      assumptions: [],
      answers: {},
    } as never).text;
    expect(text).toContain("pantry cabinet");
    expect(text).toContain("breakfast bar");
    expect(text).not.toContain("kitchen base cabinetry");
  });
});

describe("unresolved quantities are never priced as one unit", () => {
  it("returns a measured feature with no quantity as explicitly unpriced", () => {
    const feature = {
      id: "f1",
      featureKey: "cabinets.replace",
      label: "Base cabinetry",
      quantity: null,
      unitKey: "linear_foot",
      confidence: 0.8,
      source: "description",
      evidence: "pantry cabinet",
      mediaIds: [],
    } as unknown as DetectedFeatureBase;
    const { line, unpriced } = priceFeature(feature, [], "mid_range");
    expect(line).toBeNull();
    expect(unpriced?.reason).toBe("no-quantity");
  });

  it("prices it in the BALLPARK from a flagged standard allowance", () => {
    const feature = {
      id: "f1",
      featureKey: "cabinets.replace",
      label: "Pantry cabinet",
      quantity: null,
      unitKey: "linear_foot",
      confidence: 0.8,
      source: "description",
      evidence: "pantry cabinet",
      mediaIds: [],
    } as unknown as DetectedFeatureBase;
    const { line, unpriced } = priceFeature(feature, [], "mid_range", { mode: "ballpark" });
    expect(unpriced).toBeNull();
    expect(line?.total).toBeGreaterThan(0);
    /* Never a silent default: the assumption is attributed and flagged. */
    expect(line?.quantityBasis).toBe("ballpark_allowance");
    expect(line?.needsReview).toBe(true);
  });

  it("surfaces it on the scenario as a disclosed allowance, inside the range", () => {
    const scenarios = buildScenarios(analyze() as never, [], {} as never);
    for (const scenario of scenarios) {
      expect((scenario.allowanceFeatures ?? []).map((f) => f.featureKey)).toContain(
        "cabinets.replace",
      );
      expect(scenario.costHigh).toBeGreaterThan(0);
    }
  });

});

describe("project description stays additive", () => {
  it("appends new capture text instead of replacing prior content", () => {
    expect(mergeDescriptionBody("First walkthrough notes.", "Second capture.")).toBe(
      "First walkthrough notes.\n\nSecond capture.",
    );
  });

  it("does not duplicate text already present", () => {
    expect(mergeDescriptionBody("Same words here.", "same words here")).toBe("Same words here.");
  });

  it("keeps the longer re-dictation without losing the original", () => {
    expect(mergeDescriptionBody("Close up the door.", "Close up the door. Add a pantry.")).toBe(
      "Close up the door. Add a pantry.",
    );
  });
});
