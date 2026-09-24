import { describe, expect, it } from "vitest";
import {
  analyzeDescription,
  buildAssumptions,
  buildRemoteNarrative,
  buildScenarios,
} from "@/domains/remoteVision";
import { runScopeSanityGate } from "@/domains/scopeGrounding";
import { parseLengthToFeet, formatFeet } from "@/domains/measurement";
import { reconcileCabinetRun } from "@/domains/scopeGrounding/cabinetry";
import { resolveBallparkScope } from "@/domains/ballpark/quantityResolution";

/**
 * Gold regression: the real contractor transcript that produced a $60k–$80k
 * hallucinated estimate for a single bank of kitchen cabinets (ADR-057).
 */
const TRANSCRIPT = `On the back wall behind the kitchen table, add a bank of cabinets to match the existing kitchen cabinets.
Wall measures 94 inches wide. Three 30-inch base cabinets and two-inch filler strips on either end.
Upper cabinets: 30-inch tall; leftmost is a 15-inch wide full 24-inch-deep cabinet with bread box underneath;
next is another 15-inch wide cabinet with glass doors; center is a 30-inch wide wine cabinet;
then a 30-inch wide upper cabinet with one glass door and one solid raised-panel door.
Existing cabinets are butterscotch oak. Add laminate countertop to match existing laminate countertop.
Move one electrical outlet from floor level to counter height. No demolition except a couple pieces of baseboard.
No permits. Just cabinet install.`;

const analyze = (text: string) =>
  analyzeDescription({ locale: "en-US", description: text, media: [] });

const featureKeys = (text: string) => {
  const r = analyze(text);
  const g = r.grounded!;
  return [...g.explicit, ...g.incidental].map((i) => i.featureKey);
};

describe("A. cabinet transcript stays inside the stated scope", () => {
  const keys = featureKeys(TRANSCRIPT);

  it("prices the cabinet bank, the matching countertop and the outlet move", () => {
    expect(keys).toContain("cabinets.replace");
    expect(keys).toContain("countertops.replace");
    expect(keys.some((k) => k.startsWith("mechanical."))).toBe(true);
  });

  it("never adds architectural doors, flooring, painting or permits", () => {
    for (const forbidden of ["doors.replace", "flooring.replace", "paint.interior", "permits"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("keeps baseboard removal as incidental work, not a room demolition", () => {
    const g = analyze(TRANSCRIPT).grounded!;
    expect(g.incidental.some((i) => /baseboard|trim/i.test(i.featureKey + i.label))).toBe(true);
    expect(g.explicit.some((i) => i.featureKey === "demo.interior")).toBe(false);
  });

  it("records the stated exclusions instead of silently pricing them", () => {
    const g = analyze(TRANSCRIPT).grounded!;
    const text = g.exclusions.map((e) => e.label.toLowerCase()).join(" ");
    expect(text).toMatch(/permit/);
    expect(text).toMatch(/demo/);
  });

  it("produces a plausible cabinet-bank ballpark, not a whole-kitchen remodel", () => {
    const result = analyze(TRANSCRIPT);
    const scenarios = buildScenarios(result, buildAssumptions(result, TRANSCRIPT, {}), "en-US");
    const mid = scenarios.find((s) => s.level === "mid_range")!;
    expect(mid.costHigh).toBeLessThan(20000);
    expect(mid.costLow).toBeGreaterThan(1500);
  });

  it("prices the one outlet against the canonical relocation assembly", () => {
    const result = analyze(TRANSCRIPT);
    const economy = buildScenarios(
      result,
      buildAssumptions(result, TRANSCRIPT, {}),
      "en-US",
    )[0]!;
    const electrical = economy.drivers.find((d) => d.featureKey === "mechanical.outlet_relocate");
    expect(electrical?.assemblyKey).toBe("electrical.device.relocate");
    expect(electrical?.costHigh).toBeLessThan(300);
    expect(electrical?.laborHours).toBe(1.5);
  });

  it("never inserts a sink cutout without explicit sink or cutout intent", () => {
    const result = analyze(TRANSCRIPT);
    const doc = buildRemoteNarrative({
      projectName: "Kitchen Cabinets",
      locale: "en-US",
      result,
      assumptions: buildAssumptions(result, TRANSCRIPT, {}),
    });
    expect(doc.text).not.toMatch(/sink|cutout/i);
  });

  it("does not interpret countertop height as countertop installation", () => {
    const result = analyze("There is one outlet that needs to be relocated up to countertop height.");
    expect(result.materials.some((f) => f.featureKey === "countertops.replace")).toBe(false);
    expect(result.mechanicalChanges[0]?.featureKey).toBe("mechanical.outlet_relocate");
  });

  it("derives duration from canonical crew hours instead of legacy feature hours", () => {
    const result = analyze(TRANSCRIPT);
    const mid = buildScenarios(result, buildAssumptions(result, TRANSCRIPT, {}), "en-US")[1]!;
    expect(mid.durationDays).toBeLessThanOrEqual(2);
    expect(mid.laborHours).toBeLessThan(30);
  });
});

describe("B. inches never become linear feet", () => {
  it("normalizes 94 inches to 7' 10\"", () => {
    const feet = parseLengthToFeet('94"')!;
    expect(feet).toBeCloseTo(7.833, 2);
    expect(formatFeet(feet)).toBe(`7' 10"`);
  });

  it("grounds the cabinet run to the wall, not to the 24 LF catalog default", () => {
    const item = analyze(TRANSCRIPT).grounded!.explicit.find(
      (i) => i.featureKey === "cabinets.replace",
    )!;
    expect(item.unitKey).toBe("linear_foot");
    expect(item.quantity!).toBeCloseTo(7.833, 2);
    expect(item.quantity!).toBeLessThan(10);
  });
});

describe("C/D. cabinet component arithmetic", () => {
  it("reconciles three 30-inch bases plus 2-inch fillers to the 94-inch wall", () => {
    const run = reconcileCabinetRun(TRANSCRIPT);
    expect(run.baseTotalInches).toBe(94);
    expect(run.baseUnresolvedInches).toBe(0);
  });

  it("flags the 4 inches unaccounted for in the upper run instead of inventing length", () => {
    const run = reconcileCabinetRun(TRANSCRIPT);
    expect(run.upperTotalInches).toBe(90);
    expect(run.upperUnresolvedInches).toBe(4);
    const clar = analyze(TRANSCRIPT).grounded!.clarifications;
    expect(clar.some((c) => /4"|4 in/i.test(c.message))).toBe(true);
  });
});

describe("E/F/G. entity and evidence rules", () => {
  it("treats a cabinet with glass doors as cabinetry, never as door scope", () => {
    const keys = featureKeys("Install a 30 inch upper cabinet with glass doors.");
    expect(keys).toContain("cabinets.replace");
    expect(keys).not.toContain("doors.replace");
  });

  it("does not add flooring because an outlet is at floor level", () => {
    expect(featureKeys("Move one outlet from floor level to counter height.")).not.toContain(
      "flooring.replace",
    );
  });

  it("adds flooring when the contractor explicitly asks for it", () => {
    expect(featureKeys("Replace the flooring in the kitchen with 200 sq ft of LVP.")).toContain(
      "flooring.replace",
    );
  });
});

describe("H. every priced quantity carries provenance", () => {
  it("attaches a source and rationale to each included item", () => {
    const g = analyze(TRANSCRIPT).grounded!;
    for (const item of [...g.explicit, ...g.incidental]) {
      expect(item.provenance.source).toBeTruthy();
      expect(item.provenance.rationale.length).toBeGreaterThan(0);
    }
  });
});

describe("I. the sanity gate blocks impossible quantities", () => {
  it("catches 24 LF of cabinets against a known 94-inch wall", () => {
    const g = analyze(TRANSCRIPT).grounded!;
    const injected = {
      ...g,
      explicit: g.explicit.map((i) =>
        i.featureKey === "cabinets.replace" ? { ...i, quantity: 24 } : i,
      ),
    };
    const report = runScopeSanityGate(injected);
    expect(report.blocked).toBe(true);
    expect(report.findings.some((f) => f.kind === "exceeds_known_dimension")).toBe(true);
  });

  it("stops a measured-unit explosion in the ballpark resolver", () => {
    const { unresolved } = resolveBallparkScope([
      { id: "x", title: "Install kitchen cabinets", quantity: 940, unitKey: "linear_foot" },
    ]);
    expect(unresolved[0]?.reason).toBe("implausibleQuantity");
  });

  it("passes a stated cabinet run through instead of falling back to 24 LF", () => {
    const { resolved } = resolveBallparkScope([
      { id: "y", title: "Install kitchen cabinets", quantity: 7.83, unitKey: "linear_foot" },
    ]);
    const total = resolved[0]!.parts.reduce((sum, p) => sum + p.quantity, 0);
    expect(total).toBeCloseTo(7.83, 1);
  });
});

describe("J. the contractor's own verb and cabinet detail survive", () => {
  it("says install, never replace, when the contractor asked to add cabinets", () => {
    const item = analyze(TRANSCRIPT).grounded!.explicit.find(
      (i) => i.featureKey === "cabinets.replace",
    )!;
    const feature = analyze(TRANSCRIPT).cabinets[0]!;
    expect(feature.actionKey).toBe("install");
    expect(item.detail).toBeTruthy();
  });

  it("keeps the base and upper component makeup on the scope line", () => {
    const detail = analyze(TRANSCRIPT).grounded!.explicit.find(
      (i) => i.featureKey === "cabinets.replace",
    )!.detail!;
    expect(detail).toMatch(/base cabinet/i);
    expect(detail).toMatch(/upper cabinet/i);
    expect(detail).toMatch(/filler/i);
  });

  it("writes the scope of work with the install verb and the detail clause", () => {
    const result = analyze(TRANSCRIPT);
    const doc = buildRemoteNarrative({
      projectName: "Kitchen Cabinets",
      locale: "en-US",
      result,
      assumptions: buildAssumptions(result, TRANSCRIPT, {}),
    });
    expect(doc.text).toMatch(/Install kitchen base cabinetry/i);
    expect(doc.text).not.toMatch(/Replace kitchen base cabinetry/i);
    expect(doc.text).toMatch(/base cabinet/i);
  });
});
