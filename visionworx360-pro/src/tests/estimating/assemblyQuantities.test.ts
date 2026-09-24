import { describe, expect, it } from "vitest";
import {
  geometryFieldsForTrade,
  parseAssemblyGeometry,
  parseComponentQuantities,
  resolveComponentQuantity,
} from "@/features/estimating/services/assemblyQuantities";

const parent = { parentQuantity: 2250, parentUnitKey: "square_foot" };

describe("assembly component quantity derivation", () => {
  it("derives area components from the parent's own measured quantity", () => {
    const r = resolveComponentQuantity({ quantityBasis: "same_as_parent", ...parent });
    expect(r.quantity).toBe(2250);
    expect(r.source).toBe("derived");
  });

  it("derives factor components (fasteners, disposal) from the parent quantity", () => {
    expect(resolveComponentQuantity({ quantityBasis: "factor", ...parent }).source).toBe("derived");
  });

  it("never invents ridge or eave length from area in a DETAILED estimate", () => {
    for (const basis of ["ridge_lf", "eave_lf", "per_penetration"]) {
      const r = resolveComponentQuantity({
        quantityBasis: basis,
        ...parent,
        mode: "detailed",
        tradeKey: "roofing",
      });
      expect(r.quantity).toBeNull();
      expect(r.source).toBe("needs_input");
      expect(r.needs.length).toBeGreaterThan(0);
    }
  });

  it("never blocks a BALLPARK component: every roof basis gets a standard ratio", () => {
    for (const basis of ["ridge_lf", "eave_lf", "per_penetration", "perimeter_lf"]) {
      const r = resolveComponentQuantity({ quantityBasis: basis, ...parent, tradeKey: "roofing" });
      expect(r.source).toBe("ballpark_default");
      expect(r.quantity).toBeGreaterThan(0);
      expect(r.derivation).toContain("ballpark assumption");
    }
  });

  it("gives siding wall components ballpark perimeter, corner and opening defaults", () => {
    const wall = { parentQuantity: 1780, parentUnitKey: "square_foot", tradeKey: "siding" } as const;
    expect(resolveComponentQuantity({ quantityBasis: "perimeter_lf", ...wall }).quantity).toBe(197.78);
    expect(resolveComponentQuantity({ quantityBasis: "corner_lf", ...wall }).quantity).toBe(54);
    expect(
      resolveComponentQuantity({ quantityBasis: "opening_count", ...wall }).quantity,
    ).toBeGreaterThan(0);
  });

  it("lets an entered measurement beat the ballpark assumption", () => {
    const r = resolveComponentQuantity({
      quantityBasis: "ridge_lf",
      ...parent,
      tradeKey: "roofing",
      geometry: { ridgeLf: 46 },
    });
    expect(r.quantity).toBe(46);
    expect(r.source).toBe("derived");
  });

  it("fills ridge, eave and penetrations once the takeoff numbers exist", () => {
    const geometry = { ridgeLf: 46, eaveLf: 120, rakeLf: 60, penetrations: 4 };
    expect(resolveComponentQuantity({ quantityBasis: "ridge_lf", ...parent, geometry }).quantity).toBe(46);
    expect(resolveComponentQuantity({ quantityBasis: "eave_lf", ...parent, geometry }).quantity).toBe(120);
    expect(
      resolveComponentQuantity({ quantityBasis: "per_penetration", ...parent, geometry }).quantity,
    ).toBe(4);
    /* perimeter is eave + rake when not entered directly */
    const perim = resolveComponentQuantity({ quantityBasis: "perimeter_lf", ...parent, geometry });
    expect(perim.quantity).toBe(180);
    expect(perim.derivation).toContain("eave");
  });

  it("lets a contractor entry win over the calculated value", () => {
    const r = resolveComponentQuantity({
      quantityBasis: "ridge_lf",
      entered: 52,
      geometry: { ridgeLf: 46 },
      ...parent,
    });
    expect(r.quantity).toBe(52);
    expect(r.source).toBe("contractor");
  });

  it("offers roof takeoff fields for roofing and wall fields for siding", () => {
    expect(geometryFieldsForTrade("roofing").map((f) => f.key)).toContain("ridgeLf");
    expect(geometryFieldsForTrade("siding").map((f) => f.key)).toContain("cornerLf");
  });

  it("parses stored geometry and per-line quantities defensively", () => {
    expect(parseAssemblyGeometry({ ridgeLf: "46", junk: 3 }).ridgeLf).toBe(46);
    expect(parseComponentQuantities({ a: 12, b: 0, c: "x" })).toEqual({ a: 12 });
  });
});
