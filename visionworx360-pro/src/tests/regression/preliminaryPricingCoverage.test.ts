/**
 * PRELIMINARY PRICING COVERAGE — the $0 – $0 production failure.
 *
 * A real remodel ("remove two closets, remove ~6 ft of wall, install a double
 * 26 ft LVL, two columns, built-in bookcases") was recognized by intake and
 * then priced at $0 – $0 with tasks: []. Preliminary pricing resolved an
 * assembly through an eight-case switch, so every feature outside that switch
 * silently produced nothing.
 *
 * These tests lock the universal contract: recognized work is priced or is
 * visibly unresolved, and it is never a silent zero.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeDescription,
  buildAssumptions,
  buildScenarios,
  collectFeatures,
  FEATURE_ASSEMBLY_MAP,
  priceFeature,
  resolveFeatureAssembly,
  WORK_RULES,
  evaluatePricingGuard,
  PricingUnresolvedError,
} from "@/domains/remoteVision";
import { buildRemoteVisionCommit } from "@/domains/remoteVision/commitPayload";
import { SAMPLE_PRICEBOOK } from "@/domains/ballpark/pricebook";
import type { DetectedFeatureBase, VisionAnalysisRequest } from "@/domains/remoteVision/types";

const NARRATIVE =
  "Okay, what we're doing here is we are removing the two closets. It's about six feet width of the two closets that's on the backside of that range hood. " +
  "So we're removing those closets completely. We're gonna remove that green wall. It's about six foot length of wall. " +
  "And then we are going to put in a LVL, about 26 foot LVL and double LVL to span that whole distance. " +
  "We're gonna open up the floor plan and we're gonna put in some two columns in between and we're gonna do some built-in bookcases, just like the after rendering. " +
  "So we wanna make this an open floor plan look exactly like the rendering photo that I've uploaded. Installing a LVL is 26 ft.";

function request(description: string): VisionAnalysisRequest {
  return {
    locale: "en-US",
    description,
    media: [
      { id: "m1", kind: "before_photo" },
      { id: "m2", kind: "after_rendering" },
    ],
  } as unknown as VisionAnalysisRequest;
}

function analyzeNarrative(text = NARRATIVE) {
  const result = analyzeDescription(request(text));
  const assumptions = buildAssumptions(result, "en-US");
  const scenarios = buildScenarios(result, assumptions, "en-US");
  return { result, assumptions, scenarios };
}

describe("representative open-plan remodel narrative", () => {
  it("recognizes the wall, closets, beam, columns and built-ins", () => {
    const { result } = analyzeNarrative();
    const keys = collectFeatures(result).map((f) => f.featureKey);
    expect(keys).toContain("structural.wall_removal");
    expect(keys).toContain("demolition.closet_removal");
    expect(keys).toContain("structural.lvl_beam");
    expect(keys).toContain("structural.column");
    expect(keys).toContain("trim.builtin_casework");
  });

  it("prices every level with real tasks and nonzero money", () => {
    const { scenarios } = analyzeNarrative();
    expect(scenarios).toHaveLength(3);
    for (const scenario of scenarios) {
      expect(scenario.drivers.length).toBeGreaterThan(0);
      expect(scenario.costLow).toBeGreaterThan(0);
      expect(scenario.costHigh).toBeGreaterThan(scenario.costLow);
      expect(scenario.laborHours).toBeGreaterThan(0);
      expect(scenario.pricingBlocked).toBe(false);
      /* Quarter-hour invariant. */
      expect((scenario.laborHours * 4) % 1).toBe(0);
      for (const driver of scenario.drivers) {
        expect(driver.costHigh).toBeGreaterThan(0);
        expect(Number.isInteger(driver.costLow)).toBe(true);
        expect(Number.isInteger(driver.costHigh)).toBe(true);
      }
    }
  });

  it("never infers appliance work from range-hood spatial context", () => {
    const { result, scenarios } = analyzeNarrative();
    const keys = collectFeatures(result).map((f) => f.featureKey);
    expect(keys).not.toContain("appliances.install");
    expect(result.appliances).toHaveLength(0);
    for (const scenario of scenarios) {
      expect(scenario.drivers.map((d) => d.featureKey)).not.toContain("appliances.install");
    }
  });

  it("does not read 'open up the floor plan' as flooring scope", () => {
    const { result } = analyzeNarrative();
    expect(collectFeatures(result).map((f) => f.featureKey)).not.toContain("flooring.replace");
  });

  it("treats a 26 ft LVL as 26 linear feet of beam, not 26 beams", () => {
    const { result, assumptions } = analyzeNarrative();
    const beam = collectFeatures(result).find((f) => f.featureKey === "structural.lvl_beam");
    expect(beam).toBeTruthy();
    expect(beam?.unitKey).toBe("linear_foot");

    const { line } = priceFeature(beam as DetectedFeatureBase, assumptions, "mid_range");
    expect(line?.assemblyKey).toBe("structural.beam_lvl");
    expect(line?.unitKey).toBe("linear_foot");
    /* 26 LF at 0.85 h/LF — an assembly count of 26 would be ~10x this. */
    expect(line?.laborHours).toBeLessThan(40);
    expect(line?.quantity).toBeLessThanOrEqual(26);
  });
});

describe("appliance inference requires an action", () => {
  const cases = [
    "We are removing the wall behind the refrigerator.",
    "Patch the drywall above the range hood.",
    "The outlet is next to the dishwasher.",
  ];
  for (const text of cases) {
    it(`does not create appliance work for: ${text}`, () => {
      const result = analyzeDescription(request(text));
      expect(collectFeatures(result).map((f) => f.featureKey)).not.toContain(
        "appliances.install",
      );
    });
  }

  it("still recognizes real appliance work", () => {
    const result = analyzeDescription(request("Install the new appliances and hook up the range."));
    expect(collectFeatures(result).map((f) => f.featureKey)).toContain("appliances.install");
  });
});

describe("assembly mapping coverage", () => {
  it("maps every mapped feature to a real catalog assembly", () => {
    for (const [featureKey, itemKey] of Object.entries(FEATURE_ASSEMBLY_MAP)) {
      expect(SAMPLE_PRICEBOOK.get(itemKey), `${featureKey} -> ${itemKey}`).toBeTruthy();
    }
  });

  it("covers every lexicon work rule with a mapping or an explicit refusal", () => {
    const unmapped = WORK_RULES.filter((rule) => !FEATURE_ASSEMBLY_MAP[rule.featureKey]).map(
      (rule) => rule.featureKey,
    );
    /* Whatever is unmapped must refuse VISIBLY, never resolve to nothing. */
    for (const featureKey of unmapped) {
      const { resolved, refusal } = resolveFeatureAssembly({ featureKey, quantity: 1 });
      expect(resolved).toBeNull();
      expect(refusal).toBe("no_mapping");
    }
  });

  it("prices unmapped recognized work as a reviewable allowance", () => {
    const feature = {
      id: "f1",
      featureKey: "unknown.custom_work",
      label: "Custom steel handrail fabrication",
      confidence: 0.7,
      source: "description",
      evidence: "fabricate a steel handrail",
      mediaIds: [],
      quantity: 12,
      unitKey: "linear_foot",
      actionKey: "install",
      detail: null,
    } as unknown as DetectedFeatureBase;
    const { line, unpriced } = priceFeature(feature, [], "mid_range");
    if (line) {
      expect(line.total).toBeGreaterThan(0);
      expect(line.pricingBasis).toBe("generic_trade_allowance");
      expect(line.needsReview).toBe(true);
    } else {
      expect(unpriced).toBeTruthy();
    }
  });
});

describe("partial matching", () => {
  it("one unresolvable item never erases the priced items", () => {
    const { result, assumptions } = analyzeNarrative();
    const features = collectFeatures(result);
    const withMystery = [
      ...features,
      {
        ...features[0],
        id: "mystery",
        featureKey: "mystery.thing",
        label: "Unclassifiable item",
        quantity: null,
        pricingQuantity: null,
        unitKey: null,
      } as DetectedFeatureBase,
    ];
    const priced = withMystery
      .map((f) => priceFeature(f, assumptions, "mid_range"))
      .filter((r) => r.line);
    expect(priced.length).toBeGreaterThanOrEqual(features.length - 1);
    expect(priced.reduce((sum, r) => sum + (r.line?.total ?? 0), 0)).toBeGreaterThan(0);
  });
});

describe("zero-dollar invariant", () => {
  it("flags a scenario with recognized scope but no priced task", () => {
    const guard = evaluatePricingGuard({
      scenario: {
        level: "economy",
        costLow: 0,
        costHigh: 0,
        laborHours: 0,
        durationDays: 0,
        confidence: 0,
        assumptionIds: [],
        drivers: [],
      },
      priceableScopeCount: 3,
    });
    expect(guard.blocked).toBe(true);
    expect(guard.reasons).toContain("no_priced_tasks");
    expect(guard.reasons).toContain("zero_money");
  });

  it("does not flag a project with no priceable scope", () => {
    expect(
      evaluatePricingGuard({ scenario: null, priceableScopeCount: 0 }).blocked,
    ).toBe(false);
  });

  it("refuses to commit a $0 – $0 estimate for recognized scope", () => {
    const { result } = analyzeNarrative();
    expect(() =>
      buildRemoteVisionCommit({
        projectId: "11111111-1111-1111-1111-111111111111",
        grounded: result.grounded ?? null,
        scenario: {
          level: "economy",
          costLow: 0,
          costHigh: 0,
          laborHours: 0,
          durationDays: 0,
          confidence: 0,
          assumptionIds: [],
          drivers: [],
        },
      }),
    ).toThrow(PricingUnresolvedError);
  });

  it("commits normally once the scope is priced", () => {
    const { result, scenarios } = analyzeNarrative();
    const commit = buildRemoteVisionCommit({
      projectId: "11111111-1111-1111-1111-111111111111",
      grounded: result.grounded ?? null,
      scenario: scenarios[1],
    });
    const items = commit.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    expect(commit.ballpark?.high).toBeGreaterThan(0);
    /* Demolition/structural/carpentry scope commits with a real trade. */
    for (const item of items) {
      if (/wall_removal|closet_removal|structural|trim\./.test(item.key)) {
        expect(item.tradeKey).toBeTruthy();
      }
    }
  });
});

describe("project isolation", () => {
  it("two narratives never share scope or money", () => {
    const a = analyzeNarrative();
    const b = analyzeNarrative(
      "Replace the roof shingles on the detached garage, about 900 square feet.",
    );
    const keysA = new Set(collectFeatures(a.result).map((f) => f.featureKey));
    const keysB = collectFeatures(b.result).map((f) => f.featureKey);
    expect(keysB).toContain("roofing.replace");
    expect(keysB.some((k) => k === "structural.lvl_beam")).toBe(false);
    expect(keysA.has("roofing.replace")).toBe(false);
    expect(a.scenarios[0].costHigh).not.toBe(b.scenarios[0].costHigh);
  });
});
