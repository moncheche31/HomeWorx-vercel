import { describe, expect, it } from "vitest";
import { BALLPARK_ALLOWANCES } from "@/domains/ballpark/quantityResolution";
import { ballparkAllowanceFor } from "@/domains/remoteVision/ballparkAllowance";

/**
 * Trade rule of thumb, not an arbitrary placeholder: kitchen cabinets finish
 * 84" to the floor, and a single pantry-style cabinet is 36" wide.
 */
describe("standard cabinet assumption defaults", () => {
  it("publishes the 84\" height and 36\" width in the canonical registry", () => {
    expect(BALLPARK_ALLOWANCES.cabinetRunHeightIn).toBe(84);
    expect(BALLPARK_ALLOWANCES.cabinetRunHeightFt).toBe(7);
    expect(BALLPARK_ALLOWANCES.singleCabinetWidthIn).toBe(36);
    expect(BALLPARK_ALLOWANCES.singleCabinetLf).toBe(3);
    expect(BALLPARK_ALLOWANCES.singleCabinetFaceSf).toBe(21);
  });

  it("prices an unmeasured pantry cabinet at 3 LF (36\")", () => {
    const allowance = ballparkAllowanceFor("cabinets.replace", "linear_foot", {
      label: "Pantry cabinet",
      evidence: "replace the pantry cabinet",
    });
    expect(allowance).toEqual({ quantity: 3, basisKey: "standard_cabinet" });
  });

  it("uses the 84\" face height when cabinetry is sold by area", () => {
    const allowance = ballparkAllowanceFor("cabinets.replace", "square_foot", {
      label: "Pantry cabinet",
    });
    expect(allowance?.quantity).toBe(BALLPARK_ALLOWANCES.singleCabinetFaceSf);
  });

  it("keeps the casework run allowance for a whole cabinet run", () => {
    const allowance = ballparkAllowanceFor("cabinets.replace", "linear_foot", {
      label: "Base cabinetry",
      evidence: "replace the base cabinets along the wall",
    });
    expect(allowance).toEqual({
      quantity: BALLPARK_ALLOWANCES.builtInLf,
      basisKey: "cabinet_run",
    });
  });

  it("never invents a quantity for counted units", () => {
    expect(ballparkAllowanceFor("cabinets.replace", "each", { label: "Pantry cabinet" })).toBeNull();
  });
});
