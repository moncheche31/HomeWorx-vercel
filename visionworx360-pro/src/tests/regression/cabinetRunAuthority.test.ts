import { describe, expect, it } from "vitest";

import {
  UPPER_CABINET_FEATURE_KEY,
  groundScope,
  planCabinetRuns,
  toPricingLinearFeet,
  type GroundingCandidate,
} from "@/domains/scopeGrounding";

/**
 * BALLPARK RUN AUTHORITY.
 *
 * Overall contractor-stated geometry prices the job. Component detail refines
 * it and can never override it. Exact geometry and the ballpark pricing
 * quantity are two different numbers and must stay that way.
 */

const GOLD =
  "The kitchen wall is 94 inches wide. Install three 30 inch wide base cabinets with a 2 inch filler at each end. " +
  "The uppers are a 15 inch wide full depth bread box cabinet, a 15 inch wide glass door cabinet, a 30 inch wide wine cabinet, " +
  "and a 30 inch wide upper with one glass door and one raised panel door. Cabinets are 24 inches deep and 30 inches tall.";

const COMMA_HEAVY =
  "wall 94 inches wide, 3 base cabinets 30 inches wide each, 2 inch filler each end, " +
  "15 inch upper bread box full depth, 15 inch glass door upper, 30 inch wine cabinet, " +
  "30 inch upper cabinet 24 inches deep 30 inches tall";

const SPARSE = "Add new cabinets on the 94 inch kitchen wall.";

const L_SHAPED =
  "L shaped kitchen. Install new base cabinets 8 feet along one wall and 6 feet on the return wall, with uppers over both runs.";

const DIFFERENT_UPPER = "The base wall is 94 inches. Uppers only run 60 inches on that wall.";

function cabinetCandidates(): GroundingCandidate[] {
  return [
    {
      featureKey: "cabinets.replace",
      label: "Base cabinetry",
      sentence: "Install base cabinets",
      defaultQuantity: 24,
      unitKey: "linear_foot",
      source: "description",
    },
  ];
}

describe("overall run is authoritative", () => {
  it("prices the gold transcript from the 94 in wall, not from cabinet widths", () => {
    const plan = planCabinetRuns({ text: GOLD });
    expect(plan.base?.exactInches).toBe(94);
    expect(plan.base?.exactFeet).toBe(7.833);
    expect(plan.base?.display).toBe("7' 10\"");
    expect(plan.base?.source).toBe("spoken_measurement");
  });

  it("reads the same run out of comma-heavy dictation", () => {
    const plan = planCabinetRuns({ text: COMMA_HEAVY });
    expect(plan.base?.exactInches).toBe(94);
    expect(plan.base?.exactFeet).toBe(7.833);
  });

  it("prices sparse ballpark input from the run alone, with uppers seen in photos", () => {
    const plan = planCabinetRuns({ text: SPARSE, visual: { uppersVisible: true } });
    expect(plan.base?.exactFeet).toBe(7.833);
    expect(plan.base?.pricingFeet).toBe(8);
    expect(plan.upper?.pricingFeet).toBe(8);
    expect(plan.upper?.assumption).toMatch(/visible in the uploaded media/i);
    // No cabinet schedule was given and none was demanded.
    expect(plan.reconciliation.components).toHaveLength(0);
  });

  it("adds the legs of an L-shaped kitchen: 8 ft + 6 ft = 14 LF, uppers too", () => {
    const plan = planCabinetRuns({ text: L_SHAPED });
    expect(plan.base?.segments).toHaveLength(2);
    expect(plan.base?.exactFeet).toBe(14);
    expect(plan.base?.pricingFeet).toBe(14);
    expect(plan.upper?.exactFeet).toBe(14);
    expect(plan.clarifications.map((c) => c.id)).not.toContain("clarify:base_run_gap");
  });

  it("uses an explicit upper run when it differs from the base run", () => {
    const plan = planCabinetRuns({ text: DIFFERENT_UPPER });
    expect(plan.base?.exactFeet).toBe(7.833);
    expect(plan.upper?.exactInches).toBe(60);
    expect(plan.upper?.exactFeet).toBe(5);
    expect(plan.upper?.assumption).toBeNull();
  });

  it("falls back to component arithmetic only when no run was stated", () => {
    const plan = planCabinetRuns({
      text: "Install three 30 inch wide base cabinets with a 2 inch filler at each end.",
    });
    expect(plan.base?.source).toBe("component_arithmetic");
    expect(plan.base?.exactInches).toBe(94);
  });
});

describe("confirmed measurements outrank the transcript", () => {
  const plan = planCabinetRuns({
    text: "The wall is 30 inches. Install cabinets.",
    confirmedMeasurements: [
      {
        label: "Back kitchen wall",
        subject: "wall",
        inches: 94,
        status: "confirmed",
        rawText: "94 in",
      },
    ],
  });

  it("prices the confirmed 94 in wall, not the bad transcript parse", () => {
    expect(plan.base?.exactInches).toBe(94);
    expect(plan.base?.source).toBe("typed_measurement");
  });

  it("surfaces the disagreement instead of silently choosing", () => {
    expect(plan.clarifications.map((c) => c.id)).toContain("clarify:run_measurement_conflict");
  });

  it("ignores unconfirmed measurement rows", () => {
    const candidateOnly = planCabinetRuns({
      text: "Install cabinets on the 94 inch wall.",
      confirmedMeasurements: [
        { label: "Kitchen wall", subject: "wall", inches: 300, status: "candidate" },
      ],
    });
    expect(candidateOnly.base?.exactInches).toBe(94);
  });
});

describe("exact geometry vs ballpark pricing quantity", () => {
  it("rounds 7.833 up to 8 LF for pricing only", () => {
    expect(toPricingLinearFeet(7.833)).toBe(8);
    expect(toPricingLinearFeet(8)).toBe(8);
    expect(toPricingLinearFeet(14)).toBe(14);
    expect(toPricingLinearFeet(0.4)).toBe(1);
  });

  it("never writes the rounded value back into geometry", () => {
    const plan = planCabinetRuns({ text: GOLD });
    expect(plan.base?.exactInches).toBe(94);
    expect(plan.base?.display).toBe("7' 10\"");
    expect(plan.base?.display).not.toBe("8'");
    expect(plan.base?.exactFeet).not.toBe(8);
  });

  it("never produces the corrupted values from the field report", () => {
    for (const text of [GOLD, COMMA_HEAVY, SPARSE]) {
      const plan = planCabinetRuns({ text });
      expect(plan.base?.display).toBe("7' 10\"");
      expect(plan.base?.display).not.toMatch(/6' 3"|2' 6"|1' 7"/);
      expect(plan.reconciliation.fillerInches).not.toBe(19);
    }
  });

  it("keeps 24 in depth and 30 in height out of the run", () => {
    const plan = planCabinetRuns({
      text: "The wall is 94 inches. Cabinets are 24 inches deep and 30 inches tall.",
    });
    expect(plan.base?.exactInches).toBe(94);
    expect(plan.base?.exactFeet).toBe(7.833);
  });
});

describe("grounded scope keeps base and upper apart", () => {
  const grounded = groundScope({ text: GOLD, candidates: cabinetCandidates() });
  const base = grounded.explicit.find((i) => i.featureKey === "cabinets.replace")!;
  const upper = grounded.explicit.find((i) => i.featureKey === UPPER_CABINET_FEATURE_KEY)!;

  it("prices two separate runs, not one collapsed cabinet line", () => {
    expect(base).toBeTruthy();
    expect(upper).toBeTruthy();
    expect(base.quantity).toBe(7.833);
    expect(base.pricingQuantity).toBe(8);
    expect(upper.quantity).toBe(7.833);
    expect(upper.pricingQuantity).toBe(8);
  });

  it("keeps component widths as supporting detail on the base line", () => {
    expect(base.detail).toContain('30" base cabinet');
    expect(base.detail).toContain("bread box");
  });

  it("explains the 4 in upper shortfall without changing the run", () => {
    const gap = grounded.clarifications.find((c) => c.id === "clarify:upper_run_gap");
    expect(gap?.message).toMatch(/4"/);
    expect(gap?.message).toMatch(/run quantity is unchanged/i);
    expect(upper.quantity).toBe(7.833);
  });

  it("discloses the assumption that uppers follow the base run", () => {
    expect(upper.provenance.rationale).toMatch(/assumed to run the full 7' 10"/);
    expect(upper.provenance.isDefault).toBe(false);
  });

  it("does not invent an upper line when no uppers were mentioned", () => {
    const baseOnly = groundScope({
      text: "The wall is 94 inches. Install base cabinets.",
      candidates: cabinetCandidates(),
    });
    expect(baseOnly.explicit.find((i) => i.featureKey === UPPER_CABINET_FEATURE_KEY)).toBeUndefined();
  });
});
