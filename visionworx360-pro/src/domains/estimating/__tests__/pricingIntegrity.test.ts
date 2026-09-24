/**
 * Pricing integrity + automatic quantity/assembly foundation (Phase 1).
 *
 * Guards the rules that real contractor testing broke: quantities must be
 * measured (not defaulted to 1), waste and markup are applied exactly once,
 * and a composite work item expands only into assemblies that exist.
 */
import { describe, expect, it } from "vitest";
import {
  CANONICAL_FORMULAS,
  detectPricingCollapse,
  parseDimensions,
  deriveAreaSquareFeet,
  derivePerimeterLinearFeet,
  suggestQuantityForLine,
  matchCompositeAssembly,
  planCompositeLine,
  PLATFORM_FLOOR,
  calculateCanonicalLine,
} from "../index";
import {
  parseDimensions as parseDims,
} from "../pricing/quantities";

/* re-exported through the barrel in app code; imported directly here */
import {
  deriveAreaSquareFeet as area,
  derivePerimeterLinearFeet as perimeter,
  suggestQuantityForLine as suggest,
} from "../pricing/quantities";
import {
  matchCompositeAssembly as matchComposite,
  planCompositeLine as plan,
  PLATFORM_FLOOR as platformFloor,
} from "../pricing/assemblies";

describe("quantity engine", () => {
  it("derives 288 sq ft from a 16' x 18' platform floor", () => {
    const derived = area("Frame an approximately 16' x 18' platform floor using 2 x 8 lumber");
    expect(derived).toMatchObject({ quantity: 288, unitKey: "square_foot" });
  });

  it("reads feet-and-inches dimensions", () => {
    expect(parseDims("room is 12' 6\" x 10'")).toMatchObject({ lengthFt: 12.5, widthFt: 10 });
  });

  it("never reads nominal lumber as a room size", () => {
    expect(parseDims("using 2 x 8 lumber")).toBeNull();
    expect(parseDims("install 2x4 studs")).toBeNull();
  });

  it("accepts unmarked but plausible room dimensions", () => {
    expect(area("kitchen 12 by 14")).toMatchObject({ quantity: 168 });
  });

  it("returns null when there are no dimensions at all", () => {
    expect(area("Install finished flooring")).toBeNull();
  });

  it("derives perimeter for linear-foot lines", () => {
    expect(perimeter("16' x 18' room")).toMatchObject({ quantity: 68, unitKey: "linear_foot" });
  });

  it("only suggests a quantity the line's unit can use", () => {
    expect(suggest({ description: "16' x 18' floor", unitKey: "square_foot" })?.quantity).toBe(288);
    expect(suggest({ description: "16' x 18' floor", unitKey: "each" })).toBeNull();
  });
});

describe("composite assemblies", () => {
  it("recognises a platform floor", () => {
    expect(matchComposite("Frame a 16' x 18' platform floor")?.key).toBe(platformFloor.key);
  });

  it("does not fire on unrelated framing", () => {
    expect(matchComposite("Frame interior partition walls")).toBeNull();
  });

  it("expands into the joist and subfloor assemblies at the derived area", () => {
    const result = plan({ description: "Frame an approximately 16' x 18' platform floor" });
    expect(result?.quantity).toBe(288);
    expect(result?.components.map((c) => [c.assemblyKey, c.quantity])).toEqual([
      ["framing.floor.joist", 288],
      ["framing.subfloor.sheathing", 288],
    ]);
  });

  it("prefers a measured quantity over the derived one", () => {
    const result = plan({ description: "Frame a 16' x 18' platform floor", quantityOverride: 300 });
    expect(result?.quantity).toBe(300);
  });

  it("only references assemblies with an explicit unit and factor", () => {
    for (const component of PLATFORM_FLOOR.components) {
      expect(component.quantityFactor).toBeGreaterThan(0);
      expect(component.unitKey).toBe("square_foot");
    }
  });
});

describe("pricing collapse detection", () => {
  const base = {
    quantity: 288,
    unitKey: "square_foot",
    isQuantityPlaceholder: false,
    laborHours: 15.84,
    laborRate: 65,
    materialCost: 7.15,
    equipmentCost: 0,
    subcontractorCost: 0,
    otherCost: 0,
  };

  it("passes a fully measured, fully priced line", () => {
    expect(detectPricingCollapse(base)).toBeNull();
  });

  it("flags a square-foot line still sitting at a quantity of 1", () => {
    expect(detectPricingCollapse({ ...base, quantity: 1 })).toBe("placeholder-quantity");
  });

  it("still trusts a quantity of 1 on a counted unit", () => {
    expect(detectPricingCollapse({ ...base, quantity: 1, unitKey: "each" })).toBeNull();
  });

  it("flags a zero-cost line as unpriced", () => {
    expect(
      detectPricingCollapse({ ...base, laborHours: 0, materialCost: 0 }),
    ).toBe("no-pricing");
  });

  it("flags a missing quantity", () => {
    expect(detectPricingCollapse({ ...base, quantity: 0 })).toBe("no-quantity");
  });
});

describe("canonical formulas", () => {
  it("documents that crew size and markup are never applied", () => {
    expect(CANONICAL_FORMULAS.laborHours).toContain("NEVER");
    expect(CANONICAL_FORMULAS.markup).toContain("NEVER");
  });

  it("applies waste-inclusive material cost exactly once per unit", () => {
    const totals = calculateCanonicalLine(
      {
        quantity: 288,
        laborHours: 0,
        laborRate: 0,
        materialCost: 7.15, // 6.50 allowance × 1.10 waste, already folded in
        equipmentCost: 0,
        subcontractorCost: 0,
        otherCost: 0,
        overheadPct: 0,
        profitPct: 0,
        contingencyPct: 0,
        isTaxable: false,
      },
      0,
    );
    expect(totals.materialTotal).toBe(2059);
  });

  it("keeps the barrel re-exports pointing at the same helpers", () => {
    expect(parseDimensions).toBe(parseDims);
    expect(deriveAreaSquareFeet).toBe(area);
    expect(derivePerimeterLinearFeet).toBe(perimeter);
    expect(suggestQuantityForLine).toBe(suggest);
    expect(matchCompositeAssembly).toBe(matchComposite);
    expect(planCompositeLine).toBe(plan);
    expect(PLATFORM_FLOOR).toBe(platformFloor);
  });
});
