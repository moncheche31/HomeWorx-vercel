/**
 * UNIVERSAL PERMIT ESTIMATING regression matrix.
 *
 * Invariants proven here:
 *  - permit/fee lines carry ZERO labor hours and whole-dollar money;
 *  - cosmetic-only jobs get no permit allowance;
 *  - trade scope yields the right trade permit;
 *  - local jurisdiction rules beat the national fallback;
 *  - contractor overrides beat everything;
 *  - a master permit suppresses the trade permits it bundles;
 *  - valuation-based fees never recurse;
 *  - two projects at the same address stay isolated.
 */

import { describe, expect, it } from "vitest";
import {
  applyPermitToEconomics,
  classifyPermitRequirements,
  isWholeDollarPlan,
  NATIONAL_PERMIT_RULES,
  PERMIT_LIBRARY_VERSION,
  resolvePermitPlan,
  type PermitFeeRule,
  type PermitScopeSignal,
} from "@/domains/permits";

const sig = (description: string, extra: Partial<PermitScopeSignal> = {}): PermitScopeSignal => ({
  description,
  ...extra,
});

const plan = (signals: PermitScopeSignal[], over: Partial<Parameters<typeof resolvePermitPlan>[0]> = {}) =>
  resolvePermitPlan({ signals, ...over });

const typesOf = (p: ReturnType<typeof resolvePermitPlan>) =>
  p.components.map((c) => c.permitType).sort();

describe("permit invariants", () => {
  it("every national benchmark row is versioned and source-labelled", () => {
    expect(NATIONAL_PERMIT_RULES.length).toBeGreaterThan(15);
    for (const rule of NATIONAL_PERMIT_RULES) {
      expect(rule.version).toBe(PERMIT_LIBRARY_VERSION);
      expect(rule.sourceType).toBe("national_benchmark");
      expect(rule.sourceTitle).toMatch(/2026/);
      expect(rule.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("permit components are zero labor and whole dollars", () => {
    const p = plan([
      sig("Install new circuits and receptacles", { quantity: 6, unitKey: "each" }),
      sig("Plumbing rough-in for new bathroom"),
      sig("Frame load-bearing wall with LVL header"),
    ]);
    expect(p.components.length).toBeGreaterThan(0);
    for (const c of p.components) {
      expect(c.laborHours).toBe(0);
      expect(c.costBasis).toBe("permit_fee");
      expect(Number.isInteger(c.amount)).toBe(true);
      expect(Number.isInteger(c.low)).toBe(true);
      expect(Number.isInteger(c.high)).toBe(true);
    }
    expect(isWholeDollarPlan(p)).toBe(true);
  });
});

describe("permit requirement classification", () => {
  it("paint-only job needs no permit", () => {
    const p = plan([sig("Paint walls and ceilings"), sig("Prime and repaint trim")]);
    expect(classifyPermitRequirements({ signals: [sig("Paint walls and ceilings")] }).none).toBe(true);
    expect(p.components).toHaveLength(0);
    expect(p.total).toBe(0);
  });

  it("simple flooring install needs no permit", () => {
    const p = plan([sig("Install vinyl plank flooring"), sig("Install baseboard trim")]);
    expect(p.components).toHaveLength(0);
  });

  it("electrical circuit work yields an electrical permit allowance", () => {
    const p = plan([sig("Run 4 new circuits to subpanel", { quantity: 4, unitKey: "each" })]);
    expect(typesOf(p)).toContain("electrical");
    const el = p.components.find((c) => c.permitType === "electrical")!;
    expect(el.laborHours).toBe(0);
    expect(el.amount).toBeGreaterThan(0);
    expect(el.needsLocalVerification).toBe(true);
  });

  it("plumbing rough-in yields a plumbing permit allowance", () => {
    const p = plan([sig("Plumbing rough-in for tub, toilet and lavatory")]);
    const pl = p.components.find((c) => c.permitType === "plumbing")!;
    expect(pl).toBeTruthy();
    expect(pl.laborHours).toBe(0);
    expect(pl.amount).toBeGreaterThanOrEqual(50);
  });

  it("structural wall / LVL makes a building permit likely", () => {
    const req = classifyPermitRequirements({ signals: [sig("Install LVL beam at load-bearing wall")] });
    const building = req.candidates.find((c) => c.permitType === "building")!;
    expect(building.likelihood).toBe("likely");
    expect(req.needsJurisdictionConfirmation).toBe(true);
  });

  it("roofing scope prices near the $250–$500 benchmark", () => {
    const p = plan([sig("Tear off and reroof with architectural shingles")]);
    const roof = p.components.find((c) => c.permitType === "roofing")!;
    expect(roof.low).toBe(250);
    expect(roof.high).toBe(500);
    expect(roof.amount).toBe(375);
  });
});

describe("project-class fallbacks", () => {
  it("garage conversion combines general plus trades without duplication", () => {
    const p = plan([
      sig("Garage conversion to master suite"),
      sig("Frame walls and install LVL header"),
      sig("New circuits and outlets", { quantity: 8, unitKey: "each" }),
      sig("Plumbing rough-in for bathroom"),
    ]);
    const building = p.components.find((c) => c.permitType === "building")!;
    expect(building.workClass).toBe("conversion");
    expect(building.amount).toBeGreaterThanOrEqual(1200);
    expect(building.amount).toBeLessThanOrEqual(2000);
    /* Trade permits are bundled into the master permit — never double counted. */
    expect(typesOf(p)).not.toContain("electrical");
    expect(p.suppressed.map((s) => s.permitType)).toContain("electrical");
    expect(p.suppressed.every((s) => s.coveredBy === "building")).toBe(true);
    expect(p.total).toBe(building.amount);
  });

  it("substantial kitchen and bath remodels use their own fallbacks", () => {
    const kitchen = plan([sig("Kitchen remodel with new plumbing rough-in and circuits")]);
    const k = kitchen.components.find((c) => c.permitType === "building")!;
    expect(k.workClass).toBe("kitchen_remodel");
    expect(k.amount).toBe(1050);

    const bath = plan([sig("Bathroom remodel with fixture relocation")]);
    const b = bath.components.find((c) => c.permitType === "building")!;
    expect(b.workClass).toBe("bathroom_remodel");
    expect(b.amount).toBe(600);
  });

  it("basement finish falls back near $500", () => {
    const p = plan([sig("Finish basement with drywall and framing")]);
    const b = p.components.find((c) => c.permitType === "building")!;
    expect(b.workClass).toBe("basement_finish");
    expect(b.amount).toBe(500);
  });

  it("large whole-house remodel uses a valuation-based fallback", () => {
    const p = plan([sig("Whole home renovation including structural framing")], {
      valuationBase: 400_000,
    });
    const b = p.components.find((c) => c.permitType === "building")!;
    expect(b.method).toBe("percent_of_valuation");
    expect(b.amount).toBe(5000); // 1.25% of 400k
    expect(b.low).toBe(2000); // 0.5%
    expect(b.high).toBe(8000); // 2.0%
  });

  it("does not apply a valuation percentage to a small job", () => {
    const p = plan([sig("Replace one window", { quantity: 1, unitKey: "each" })], {
      valuationBase: 4_000,
    });
    for (const c of p.components) expect(c.method).not.toBe("percent_of_valuation");
  });
});

describe("pricing hierarchy", () => {
  const localRule: PermitFeeRule = {
    id: "seattle-building",
    scope: "city",
    jurisdiction: { city: "Seattle", state: "WA" },
    permitType: "building",
    workClass: "conversion",
    method: "flat",
    base: 2450,
    effectiveDate: "2026-02-01",
    version: "seattle-2026",
    sourceType: "municipal",
    sourceTitle: "Seattle SDCI fee schedule 2026",
    sourceUrl: "https://www.seattle.gov/sdci/permits/permit-fees",
    confidence: "verified",
    bundles: ["electrical", "plumbing", "mechanical"],
    notes: null,
  };

  const conversion = [
    sig("Garage conversion to master suite"),
    sig("New circuits", { quantity: 6, unitKey: "each" }),
  ];

  it("verified local jurisdiction rule overrides the national fallback", () => {
    const p = plan(conversion, {
      rules: [localRule],
      jurisdiction: { city: "Seattle", state: "WA" },
    });
    const b = p.components.find((c) => c.permitType === "building")!;
    expect(b.amount).toBe(2450);
    expect(b.sourceType).toBe("municipal");
    expect(b.jurisdictionScope).toBe("city");
    expect(b.needsLocalVerification).toBe(false);
    expect(p.usesNationalFallback).toBe(false);
  });

  it("a local rule for another city never contaminates this project", () => {
    const p = plan(conversion, {
      rules: [localRule],
      jurisdiction: { city: "Portland", state: "OR" },
    });
    const b = p.components.find((c) => c.permitType === "building")!;
    expect(b.sourceType).toBe("national_benchmark");
  });

  it("state rule is used when no city rule exists", () => {
    const stateRule: PermitFeeRule = {
      ...localRule,
      id: "wa-state",
      scope: "state",
      jurisdiction: { state: "WA" },
      base: 1750,
      sourceTitle: "Washington state fee rule",
      sourceType: "state",
    };
    const p = plan(conversion, { rules: [stateRule], jurisdiction: { city: "Tacoma", state: "WA" } });
    const b = p.components.find((c) => c.permitType === "building")!;
    expect(b.amount).toBe(1750);
    expect(b.jurisdictionScope).toBe("state");
  });

  it("contractor override beats local and national rules", () => {
    const p = plan(conversion, {
      rules: [localRule],
      jurisdiction: { city: "Seattle", state: "WA" },
      contractorEntries: [{ permitType: "building", amount: 3110, label: "City permit receipt" }],
    });
    const b = p.components.find((c) => c.permitType === "building")!;
    expect(b.amount).toBe(3110);
    expect(b.sourceType).toBe("contractor");
    expect(b.confidence).toBe("verified");
    expect(p.contractorOverride).toBe(true);
    expect(p.needsJurisdictionConfirmation).toBe(false);
  });

  it("a contractor exclusion suppresses the permit entirely", () => {
    const p = plan(conversion, {
      contractorEntries: [{ permitType: "building", amount: 0, excluded: true }],
    });
    expect(typesOf(p)).not.toContain("building");
  });
});

describe("circularity and economics", () => {
  it("permit fee is computed from the pre-permit base and applied once", () => {
    let calls = 0;
    const p = plan([sig("Whole home renovation with structural work")], { valuationBase: 200_000 });
    const result = applyPermitToEconomics({
      prePermitCost: 200_000,
      plan: p,
      sellingPriceOf: (jobCost) => {
        calls += 1;
        return jobCost / 0.6; // 40% target gross margin
      },
    });
    expect(calls).toBe(1);
    expect(p.valuationBase).toBe(200_000);
    expect(result.jobCost).toBe(200_000 + p.total);
    expect(Number.isInteger(result.sellingPrice)).toBe(true);
    /* The permit fee is NOT part of its own valuation base. */
    expect(p.total).toBe(Math.round((200_000 * 1.25) / 100));
  });
});

describe("project isolation", () => {
  it("two projects at the same address resolve independently", () => {
    const jurisdiction = { city: "Boston", state: "MA", postalCode: "02118" };
    const cosmetic = plan([sig("Repaint living room walls")], { jurisdiction });
    const structural = plan([sig("Remove load-bearing wall and install LVL beam")], { jurisdiction });
    expect(cosmetic.components).toHaveLength(0);
    expect(cosmetic.total).toBe(0);
    expect(structural.total).toBeGreaterThan(0);
    expect(structural.components.some((c) => c.permitType === "building")).toBe(true);
  });
});
