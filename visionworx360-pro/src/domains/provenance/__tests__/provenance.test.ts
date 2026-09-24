import { describe, it, expect } from "vitest";
import {
  deriveQuantity,
  isContractorAuthored,
  isRederivable,
  normalizeOrigin,
  originStamp,
} from "../index";

describe("origin provenance", () => {
  it("stamps every write with a type, ref and timestamp", () => {
    const stamp = originStamp("template", "tpl-1");
    expect(stamp.origin_type).toBe("template");
    expect(stamp.origin_ref).toBe("tpl-1");
    expect(Number.isNaN(Date.parse(stamp.origin_at))).toBe(false);
  });

  it("falls back to contractor rather than leaving origin unknown", () => {
    expect(normalizeOrigin("nonsense")).toBe("contractor");
    expect(normalizeOrigin(undefined)).toBe("contractor");
  });
});

describe("quantity basis authority", () => {
  it("treats only contractor_entered as contractor authority", () => {
    expect(isContractorAuthored("contractor_entered")).toBe(true);
    for (const basis of ["geometry_derived", "measurement", "assumed", "catalog_default"]) {
      expect(isContractorAuthored(basis)).toBe(false);
    }
  });

  it("keeps geometry-derived quantities re-derivable", () => {
    expect(isRederivable("geometry_derived")).toBe(true);
    expect(isRederivable("contractor_entered")).toBe(false);
  });
});

describe("deriveQuantity", () => {
  it("re-derives floor area with waste and explains the basis", () => {
    const result = deriveQuantity({ kind: "floor_area", wastePct: 10 }, {
      lengthFt: 18, widthFt: 16,
    });
    expect(result?.quantity).toBe(316.8);
    expect(result?.basisNote).toContain("288");
    expect(result?.basisNote).toContain("10% waste");
  });

  it("corrects itself when the measurement is corrected", () => {
    const corrected = deriveQuantity({ kind: "floor_area", wastePct: 10 }, {
      lengthFt: 18, widthFt: 15.5,
    });
    expect(corrected?.quantity).toBe(306.9);
  });

  it("derives wall area and perimeter from the same geometry", () => {
    expect(deriveQuantity({ kind: "perimeter_lf" }, { lengthFt: 18, widthFt: 15.5 })?.quantity)
      .toBe(67);
    expect(deriveQuantity({ kind: "wall_area" }, {
      lengthFt: 18, widthFt: 15.5, ceilingHeightFt: 9,
    })?.quantity).toBe(603);
  });

  it("returns null instead of a zero quantity when geometry is missing", () => {
    expect(deriveQuantity({ kind: "floor_area" }, { lengthFt: 0, widthFt: 12 })).toBeNull();
    expect(deriveQuantity({ kind: "floor_area" }, {})).toBeNull();
  });
});
