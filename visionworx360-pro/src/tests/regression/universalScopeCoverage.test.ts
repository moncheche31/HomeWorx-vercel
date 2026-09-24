/**
 * UNIVERSAL SCOPE COVERAGE — one canonical resolver for every trade.
 *
 * The production failure this locks down: preliminary pricing knew eight
 * assemblies, so structural, demolition, carpentry, plumbing, roofing and
 * everything else recognized by intake collapsed to `$0 - $0` with no tasks.
 * These cases run the real shared pipeline (analyze -> ground -> canonical
 * catalog pricing) for single-trade narratives, spoken quantity semantics, and
 * context-only noun mentions that must never become work.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeDescription,
  buildAssumptions,
  buildScenarios,
  collectFeatures,
  evaluatePricingGuard,
} from "@/domains/remoteVision";
import type { VisionAnalysisRequest } from "@/domains/remoteVision/types";

function priceNarrative(description: string) {
  const result = analyzeDescription({
    locale: "en-US",
    description,
    media: [],
  } as unknown as VisionAnalysisRequest);
  const assumptions = buildAssumptions(result, "en-US");
  const scenarios = buildScenarios(result, assumptions, "en-US");
  const mid = scenarios.find((s) => s.level === "mid_range")!;
  return {
    result,
    features: collectFeatures(result),
    scenario: mid,
    featureKeys: collectFeatures(result).map((f) => f.featureKey),
  };
}

function expectPriced(narrative: string) {
  const priced = priceNarrative(narrative);
  expect(priced.scenario.drivers.length).toBeGreaterThan(0);
  expect(priced.scenario.laborHours).toBeGreaterThan(0);
  expect(priced.scenario.costLow).toBeGreaterThan(0);
  expect(priced.scenario.costHigh).toBeGreaterThan(0);
  expect(priced.scenario.pricingBlocked).toBe(false);
  /* Money is whole dollars and hours sit on the quarter-hour grid. */
  expect(priced.scenario.costLow % 1).toBe(0);
  expect(priced.scenario.costHigh % 1).toBe(0);
  expect((priced.scenario.laborHours * 4) % 1).toBe(0);
  return priced;
}

describe("structural-only narrative", () => {
  const NARRATIVE = "Remove 8 feet of bearing wall and install 14-foot LVL with two posts.";

  it("prices demolition, beam and posts from the same sentence", () => {
    const { featureKeys } = expectPriced(NARRATIVE);
    expect(featureKeys).toContain("structural.wall_removal");
    expect(featureKeys).toContain("structural.lvl_beam");
    expect(featureKeys).toContain("structural.column");
  });

  it("keeps each clause's own quantity and unit", () => {
    const { features } = priceNarrative(NARRATIVE);
    const by = (key: string) => features.find((f) => f.featureKey === key)!;
    expect(by("structural.wall_removal").quantity).toBe(8);
    expect(by("structural.wall_removal").unitKey).toBe("linear_foot");
    /* A 14-foot LVL is a length, never 14 beams and never the wall's 8 ft. */
    expect(by("structural.lvl_beam").quantity).toBe(14);
    expect(by("structural.lvl_beam").unitKey).toBe("linear_foot");
    expect(by("structural.column").quantity).toBe(2);
    expect(by("structural.column").unitKey).toBe("each");
  });
});

describe("single-trade narratives all price non-zero", () => {
  it("finish carpentry: built-in bookcases", () => {
    const { features } = expectPriced("Build 10 LF of built-in bookcases.");
    const casework = features.find((f) => f.featureKey === "trim.builtin_casework")!;
    expect(casework.quantity).toBe(10);
  });

  it("plumbing", () => {
    expectPriced("Replace the kitchen sink and install new supply lines and a shutoff valve.");
  });

  it("electrical", () => {
    const { features } = expectPriced(
      "Install six recessed lights and add two new outlets in the living room.",
    );
    expect(features.find((f) => f.featureKey === "lighting.recessed")?.quantity).toBe(6);
  });

  it("painting", () => {
    const { features } = expectPriced(
      "Paint the interior walls and ceiling, about 900 square feet, mid-grade paint.",
    );
    /* A stated area outranks the whole-house derivation ratio. */
    expect(features.find((f) => f.featureKey === "paint.interior")?.quantity).toBe(900);
  });

  it("flooring", () => {
    const { features } = expectPriced("Install 400 square feet of new hardwood flooring.");
    expect(features.find((f) => f.featureKey === "flooring.replace")?.quantity).toBe(400);
  });

  it("roofing", () => {
    expectPriced("Replace the roof, about 2200 square feet of shingles.");
  });

  it("unmeasured custom work becomes a disclosed allowance, never zero", () => {
    const { features, scenario } = expectPriced("Build custom built-in bookcases in the den.");
    const casework = features.find((f) => f.featureKey === "trim.builtin_casework")!;
    expect(casework.provenance?.source).toBe("ballpark_allowance");
    expect(casework.provenance?.rationale).toMatch(/allowance/i);
    expect(scenario.drivers.some((d) => d.needsReview)).toBe(true);
  });
});

describe("context-only mentions never become work", () => {
  it("a range hood used as a location creates no appliance scope", () => {
    const { featureKeys } = priceNarrative(
      "The closet is behind the range hood.",
    );
    expect(featureKeys).not.toContain("appliances.install");
  });

  it("'mid-grade paint' does not create sitework grading", () => {
    const { featureKeys } = priceNarrative("Use mid-grade paint on the walls, 500 sf.");
    expect(featureKeys.filter((k) => /grad/i.test(k))).toHaveLength(0);
    expect(featureKeys).toContain("paint.interior");
  });

  it("'countertop level' does not create countertop scope", () => {
    const { featureKeys } = priceNarrative("We want a countertop level finish on the trim.");
    expect(featureKeys).not.toContain("countertops.replace");
  });
});

describe("fail-safe: scope present but unpriced", () => {
  it("never presents a $0 band as valid when scope exists", () => {
    const guard = evaluatePricingGuard({
      scenario: {
        level: "mid_range",
        costLow: 0,
        costHigh: 0,
        laborHours: 0,
        durationDays: 0,
        confidence: 0,
        assumptionIds: [],
        drivers: [],
        unpricedFeatures: [
          { featureKey: "structural.lvl_beam", label: "Structural beam", reason: "no_mapping" },
        ],
      } as never,
      priceableScopeCount: 3,
    });
    expect(guard.blocked).toBe(true);
    expect(guard.reasons).toContain("no_priced_tasks");
    expect(guard.reasons).toContain("zero_money");
    expect(guard.unpricedFeatures).toHaveLength(1);
  });

  it("a project with no priceable scope is not blocked", () => {
    const guard = evaluatePricingGuard({ scenario: null, priceableScopeCount: 0 });
    expect(guard.blocked).toBe(false);
  });
});
