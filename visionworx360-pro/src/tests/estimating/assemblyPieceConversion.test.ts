import { describe, expect, it } from "vitest";
import { pieceLengthFt } from "@/features/estimating/services/assemblyExpansion.core";

describe("pieceLengthFt", () => {
  it("reads the stock length of a piece-priced book row", () => {
    expect(pieceLengthFt(`Drip edge, 6" x 10', Beige`)).toBe(10);
    expect(pieceLengthFt("Outside or inside corner, 10' long")).toBe(10);
    expect(pieceLengthFt(`Drip cap, 1-1/2" x 10'`)).toBe(10);
  });

  it("ignores inches and returns null when no stock length is stated", () => {
    expect(pieceLengthFt(`Vinyl "J"-block, 7" x 9"`)).toBeNull();
    expect(pieceLengthFt("Metal flashing and nails")).toBeNull();
    expect(pieceLengthFt(null)).toBeNull();
  });

  it("rejects lengths that are not plausible stock lengths", () => {
    expect(pieceLengthFt("Roll, 100' long")).toBeNull();
    expect(pieceLengthFt("Strip, 2' long")).toBeNull();
  });
});
