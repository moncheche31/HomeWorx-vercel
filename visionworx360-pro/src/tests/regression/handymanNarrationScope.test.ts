/**
 * LIVE REGRESSION — Handyman punch list (project 081453d1).
 *
 * The exact original narration. Interpretation must produce ONLY the three work
 * packages the contractor described, with their stated quantities, and must ask
 * nothing: every price driver is already stated.
 *
 * Historical failure this locks out: "plumbing chase" admitted plumbing
 * rough-in, "fascia" became 2,800 SF of siding through room-count scaling,
 * rigid foam became 1,800 SF of generic insulation, "paint the fascia" became
 * 735 SF of interior painting plus 102 LF of trim, and "three little handyman
 * projects" became 3 handyman hours.
 */
import { describe, expect, it } from "vitest";

import { analyzeDescription, collectFeatures } from "@/domains/remoteVision/analyze";
import { detectPricingModeFromNarrative } from "@/domains/remoteVision/commitPayload";
import { buildCurrentProjectScopeContext } from "@/domains/workScope";
import { GARAGE_CONVERSION_SCHEMA } from "@/domains/ballpark/questions";

const HANDYMAN_NARRATION =
  "Okay, so this project is actually three little handyman projects. The first is the exterior. " +
  "Remove and replace approximately 56 linear feet of 1x6 fascia, which includes a 1x2 shadow board. " +
  "All of these three little handyman projects will be labor-only quotes. The fascia will be painted also. " +
  "The second little handyman project is we're going to put a 2-inch thick rigid foam insulation on the ceiling in the basement there. " +
  "That basement measures approximately 10 feet by 21 feet. We're going to seal all the seams with tape and then spray foam the perimeter gaps. " +
  "We're going to screw the rigid foam up to the ceiling with screws and washers. " +
  "The third little handyman project is that bathroom hole in the wall. That's a plumbing chase. " +
  "We're going to build an access door, which measures approximately 19 inches by 42 inches tall. " +
  "We're going to build it out of 1x4 lumber with a quarter-inch thick plywood back, and we're going to put some hinges on it and paint it white to match the trim.";

function analyze() {
  return analyzeDescription({
    description: HANDYMAN_NARRATION,
    locale: "en-US",
    media: [],
  } as never) as never as {
    grounded: {
      explicit: Array<{ featureKey: string; quantity: number | null; unitKey: string | null }>;
      incidental: Array<{ featureKey: string }>;
    };
  };
}

describe("Handyman narration — grounded scope", () => {
  const result = analyze();
  const keys = collectFeatures(result as never).map((f) => f.featureKey);
  const item = (key: string) => result.grounded.explicit.find((i) => i.featureKey === key);

  it("admits exactly the three described work packages plus their local paint", () => {
    expect(new Set(keys)).toEqual(
      new Set(["fascia.replace", "insulation.install", "carpentry.access_panel", "paint.component"]),
    );
  });

  it("prices fascia and shadow board in linear feet at the stated 56 LF", () => {
    expect(item("fascia.replace")).toMatchObject({ quantity: 56, unitKey: "linear_foot" });
  });

  it("resolves the stated 10 x 21 basement ceiling to 210 SF of insulation", () => {
    expect(item("insulation.install")).toMatchObject({ quantity: 210, unitKey: "square_foot" });
  });

  it("admits one site-built access door, never a stated dimension as a count", () => {
    expect(item("carpentry.access_panel")).toMatchObject({ quantity: 1, unitKey: "each" });
  });

  it("keeps paint local to the named components, on their own run", () => {
    expect(item("paint.component")).toMatchObject({ quantity: 56, unitKey: "linear_foot" });
  });

  it("never invents plumbing, siding, whole-room paint, trim or handyman hours", () => {
    for (const forbidden of [
      "mechanical.plumbing",
      "fixtures.replace",
      "siding.replace",
      "paint.interior",
      "trim.replace",
      "handyman.general",
      "doors.replace",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("preserves the contractor's labor-only instruction as a pricing mode", () => {
    expect(detectPricingModeFromNarrative(HANDYMAN_NARRATION)).toBe("labor_only");
  });
});

describe("Handyman narration — ballpark questions", () => {
  it("asks nothing: every price driver is already stated", () => {
    const result = analyze();
    const ctx = buildCurrentProjectScopeContext(
      {
        projectId: "081453d1-179a-47f7-aa22-a5a4f56a9eda",
        narrativeText: HANDYMAN_NARRATION,
        groundedItems: result.grounded.explicit.map((i) => ({
          key: i.featureKey,
          title: i.featureKey,
          description: null,
        })),
      } as never,
      GARAGE_CONVERSION_SCHEMA,
    );
    expect(ctx.questions.map((q) => q.id)).toEqual([]);
    expect(ctx.unresolved.map((q) => q.id)).toEqual([]);
  });
});
