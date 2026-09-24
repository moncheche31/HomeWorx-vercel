/**
 * LIVE FAILURE FIXTURE — project "Built in bookcases".
 *
 * This is the exact narrative that shipped a `$0 - $0` ballpark: recognition
 * kept only wall removal and a beam, invented an appliance line out of a
 * location phrase, and every other recognized feature was dropped by a
 * hardcoded pricing switch. The assertions below encode the contractor's own
 * evidence (~6 LF wall, ~6 LF closet run, a 26-ft LVL, two columns, built-ins
 * with no stated size) and the invariants that must hold for every project.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeDescription,
  buildAssumptions,
  buildScenarios,
  collectFeatures,
  evaluatePricingGuard,
} from "@/domains/remoteVision";
import { BALLPARK_ALLOWANCES } from "@/domains/ballpark/quantityResolution";
import { WORK_RULES } from "@/domains/remoteVision/lexicon";
import type { VisionAnalysisRequest } from "@/domains/remoteVision/types";

const NARRATIVE = [
  "We are going to remove two closets that's on the backside of that range hood,",
  "about six foot of closet run.",
  "Then remove about six feet of that wall.",
  "We will install a double LVL about 26 foot spanning the opening,",
  "and add two columns to carry it.",
  "Then build built-in bookcases to match the after rendering.",
].join(" ");

function run(description: string) {
  const result = analyzeDescription({
    locale: "en-US",
    description,
    media: [],
  } as unknown as VisionAnalysisRequest);
  const assumptions = buildAssumptions(result, "en-US");
  const scenarios = buildScenarios(result, assumptions, "en-US");
  const features = collectFeatures(result);
  return {
    features,
    keys: features.map((f) => f.featureKey),
    feature: (key: string) => features.find((f) => f.featureKey === key),
    mid: scenarios.find((s) => s.level === "mid_range")!,
    scenarios,
  };
}

describe("Built in bookcases narrative", () => {
  const r = run(NARRATIVE);

  it("recognizes every stated scope item", () => {
    expect(r.keys).toContain("demolition.closet_removal");
    expect(r.keys).toContain("structural.wall_removal");
    expect(r.keys).toContain("structural.lvl_beam");
    expect(r.keys).toContain("structural.column");
    expect(r.keys).toContain("trim.builtin_casework");
  });

  it("never turns the 'range hood' location phrase into appliance work", () => {
    expect(r.keys.filter((k) => k.startsWith("appliances."))).toHaveLength(0);
  });

  it("uses the contractor's stated quantities, not lexicon defaults", () => {
    const wall = r.feature("structural.wall_removal")!;
    const closet = r.feature("demolition.closet_removal")!;
    expect(wall.quantity).toBe(6);
    expect(wall.unitKey).toBe("linear_foot");
    expect(wall.provenance?.source).toBe("spoken_measurement");
    expect(closet.quantity).toBe(6);
    expect(closet.unitKey).toBe("linear_foot");
    expect(closet.provenance?.isDefault).toBe(false);
  });

  it("treats '26 foot LVL' as a 26 LF span, never 26 beams", () => {
    const beam = r.feature("structural.lvl_beam")!;
    expect(beam.quantity).toBe(26);
    expect(beam.unitKey).toBe("linear_foot");
    const driver = r.mid.drivers.find((d) => d.featureKey === "structural.lvl_beam")!;
    expect(driver.laborHours).toBeGreaterThan(0);
    expect(driver.needsReview).toBe(true); // ply/depth are engineering outputs
  });

  it("counts two columns", () => {
    const col = r.feature("structural.column")!;
    expect(col.quantity).toBe(2);
    expect(col.unitKey).toBe("each");
  });

  it("prices unmeasured built-ins as a canonical allowance, never $0 and never invented LF", () => {
    const casework = r.feature("trim.builtin_casework")!;
    expect(casework.provenance?.source).toBe("ballpark_allowance");
    /* The allowance run is the configurable registry value, not a lexicon guess. */
    expect(casework.quantity).toBe(BALLPARK_ALLOWANCES.builtInLf);
    const driver = r.mid.drivers.find((d) => d.featureKey === "trim.builtin_casework")!;
    expect(driver.costHigh).toBeGreaterThan(0);
    expect(driver.needsReview).toBe(true);
  });

  it("produces a valid non-zero band from the shared engine", () => {
    expect(r.mid.drivers.length).toBeGreaterThanOrEqual(5);
    expect(r.mid.laborHours).toBeGreaterThan(0);
    expect(r.mid.costLow).toBeGreaterThan(0);
    expect(r.mid.costHigh).toBeGreaterThan(r.mid.costLow);
    expect(r.mid.pricingBlocked).toBe(false);
    for (const s of r.scenarios) {
      expect(s.costHigh).toBeGreaterThan(0);
      expect(s.costLow % 1).toBe(0);
      expect((s.laborHours * 4) % 1).toBe(0);
    }
  });
});

describe("appliance intent is preserved when the contractor actually asks for it", () => {
  it("'install a new range hood' still infers appliance work", () => {
    const { keys } = run("Install a new range hood over the cooktop.");
    expect(keys.some((k) => k.startsWith("appliances."))).toBe(true);
  });

  it("'replace the range and dishwasher' still infers appliance work", () => {
    const { keys } = run("Replace the range and the dishwasher with new units.");
    expect(keys.some((k) => k.startsWith("appliances."))).toBe(true);
  });
});

describe("mixed resolved / unresolved scope", () => {
  it("keeps the priced contribution of resolved work while disclosing the rest", () => {
    const { mid } = run(
      "Remove six feet of wall and install a 26 foot LVL. Also do something custom with the stair rail we still have to design.",
    );
    expect(mid.costHigh).toBeGreaterThan(0);
    expect(mid.pricingBlocked).toBe(false);
    /* Anything the engine could not price is listed, never silently dropped. */
    for (const u of mid.unpricedFeatures ?? []) {
      expect(u.reason).toBeTruthy();
      expect(u.label).toBeTruthy();
    }
  });

  it("meaningful scope with nothing priced is invalid, not a $0 quote", () => {
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
          { featureKey: "trim.builtin_casework", label: "Built-in casework", reason: "no_mapping" },
        ],
      } as never,
      priceableScopeCount: 5,
    });
    expect(guard.blocked).toBe(true);
    expect(guard.reasons).toContain("no_priced_tasks");
  });
});

describe("no invented pricing truths remain in the lexicon", () => {
  it("carries no hard-coded line costs or labor hours", () => {
    for (const rule of WORK_RULES) {
      expect(rule).not.toHaveProperty("baseCost");
      expect(rule).not.toHaveProperty("laborHours");
    }
  });

  it("structural/casework fallbacks come from the canonical allowance registry", () => {
    const q = (key: string) => WORK_RULES.find((r) => r.featureKey === key)!;
    expect(q("structural.wall_removal").quantity).toBe(BALLPARK_ALLOWANCES.wallDemoLf);
    expect(q("demolition.closet_removal").quantity).toBe(BALLPARK_ALLOWANCES.closetLf);
    expect(q("structural.lvl_beam").quantity).toBe(BALLPARK_ALLOWANCES.beamLf);
    expect(q("structural.column").quantity).toBe(BALLPARK_ALLOWANCES.structuralPosts);
    expect(q("trim.builtin_casework").quantity).toBe(BALLPARK_ALLOWANCES.builtInLf);
    for (const key of [
      "structural.wall_removal",
      "demolition.closet_removal",
      "structural.lvl_beam",
      "structural.column",
      "trim.builtin_casework",
    ]) {
      expect(q(key).quantityBasis).toBe("allowance");
    }
  });
});

describe("project isolation", () => {
  it("two narratives analyzed in the same process share no quantities", () => {
    const a = run("Remove six feet of wall and install a 26 foot LVL with two columns.");
    const b = run("Build built-in bookcases in the den.");
    expect(a.feature("structural.lvl_beam")!.quantity).toBe(26);
    expect(b.feature("structural.lvl_beam")).toBeUndefined();
    expect(b.feature("trim.builtin_casework")!.quantity).toBe(BALLPARK_ALLOWANCES.builtInLf);
    /* Re-running the first narrative is unchanged by the second project. */
    const again = run("Remove six feet of wall and install a 26 foot LVL with two columns.");
    expect(again.feature("structural.wall_removal")!.quantity).toBe(6);
    expect(again.mid.costHigh).toBe(a.mid.costHigh);
  });
});

describe("pricing-incomplete diagnostic", () => {
  it("the production narrative is a valid priced scenario, never $0 - $0", () => {
    const { mid } = run(NARRATIVE);
    expect(mid.costHigh).toBeGreaterThan(0);
    expect(mid.drivers.length).toBeGreaterThan(0);
    expect(mid.pricingBlocked).toBe(false);
    expect(mid.pricingIncompleteReason).toBeNull();
    /* Whole dollars and quarter-hour labor survive the diagnostic path. */
    expect(Number.isInteger(mid.costLow)).toBe(true);
    expect(Number.isInteger(mid.costHigh)).toBe(true);
    expect((mid.laborHours * 4) % 1).toBe(0);
  });

  it("meaningful scope that no matcher can price reports no_priced_tasks, not a valid zero", () => {
    const { mid } = run("Fabricate a bespoke brass zeppelin mooring mast on the roof deck.");
    if (mid.drivers.length === 0 && mid.pricingBlocked) {
      expect(mid.pricingIncompleteReason).toBe("no_priced_tasks");
      expect(mid.costHigh).toBe(0);
    } else {
      /* If a generic trade allowance priced it, money must be real. */
      expect(mid.costHigh).toBeGreaterThan(0);
      expect(mid.pricingIncompleteReason).toBeNull();
    }
  });
});
