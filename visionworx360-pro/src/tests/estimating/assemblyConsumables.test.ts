import { describe, expect, it } from "vitest";
import { consumableQuantity } from "@/features/estimating/services/assemblyExpansion.core";

describe("consumableQuantity", () => {
  it("buys cartridge goods whole, never in fractions", () => {
    const disposal = consumableQuantity("Debris Disposal", 2250);
    expect(disposal?.unit).toBe("each");
    expect(Number.isInteger(disposal?.quantity)).toBe(true);
  });

  it("reads 'sealant and butyl tape' as cartridges, not tape by the foot", () => {
    expect(consumableQuantity("Sealant and Butyl Tape", 2250)?.unit).toBe("each");
  });

  it("still measures plain seam tape by the linear foot", () => {
    expect(consumableQuantity("Seam Tape", 1780)?.unit).toBe("linear_foot");
  });

  it("leaves ordinary components alone", () => {
    expect(consumableQuantity("Vinyl Siding Panels", 1780)).toBeNull();
  });
});
