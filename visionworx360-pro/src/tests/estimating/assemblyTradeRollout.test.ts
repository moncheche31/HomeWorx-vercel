/**
 * All-trade assembly expansion: enablement, trade-specific consumable ratios
 * and ballpark defaults for length and count parents.
 */
import { describe, expect, it } from "vitest";
import {
  ENABLED_EXPANSION_TRADES,
  expansionTradeForLine,
} from "@/features/estimating/services/assemblyExpansion.shared";
import { consumableQuantity } from "@/features/estimating/services/assemblyExpansion.core";
import { ballparkQuantityForBasis } from "@/features/estimating/services/assemblyQuantities";

describe("trade enablement", () => {
  it("enables the residential remodel trades", () => {
    for (const t of ["electrical", "plumbing", "drywall", "painting", "flooring", "framing", "hvac", "insulation", "doors", "finish_carpentry"]) {
      expect(ENABLED_EXPANSION_TRADES.has(t)).toBe(true);
    }
  });

  it("leaves catch-all buckets as single priced lines", () => {
    for (const t of ["demolition", "general_conditions", "specialty"]) {
      expect(expansionTradeForLine(t, "Remove existing partition wall")).toBeNull();
    }
  });
});

describe("trade-specific consumables", () => {
  it("buys drywall compound by the gallon, not the square foot", () => {
    const r = consumableQuantity("Joint compound", 1000, {
      tradeKey: "drywall",
      parentUnit: "square_foot",
    });
    expect(r).toEqual({ quantity: 4.5, unit: "gallon" });
  });

  it("uses the drywall taping ratio, not the house-wrap seam ratio", () => {
    const drywall = consumableQuantity("Joint tape", 1000, {
      tradeKey: "drywall",
      parentUnit: "square_foot",
    });
    const wrap = consumableQuantity("Seam tape", 1000, {
      tradeKey: "siding",
      parentUnit: "square_foot",
    });
    expect(drywall?.quantity).toBe(400);
    expect(wrap?.quantity).toBe(150);
  });

  it("counts electrical small parts per device", () => {
    const r = consumableQuantity("Wire connectors", 4, {
      tradeKey: "electrical",
      parentUnit: "each",
    });
    expect(r).toEqual({ quantity: 20, unit: "each" });
  });

  it("counts plumbing fittings per fixture", () => {
    const r = consumableQuantity("Fittings and couplings", 3, {
      tradeKey: "plumbing",
      parentUnit: "each",
    });
    expect(r).toEqual({ quantity: 24, unit: "each" });
  });

  it("still leaves a real installed component alone", () => {
    expect(
      consumableQuantity("Vinyl siding panels", 1780, {
        tradeKey: "siding",
        parentUnit: "square_foot",
      }),
    ).toBeNull();
  });
});

describe("ballpark defaults beyond area parents", () => {
  it("turns a wall run into wall area at standard height", () => {
    const r = ballparkQuantityForBasis({
      quantityBasis: "wall_sf",
      parentQuantity: 20,
      parentUnitKey: "linear_foot",
      tradeKey: "framing",
    });
    expect(r?.quantity).toBe(180);
  });

  it("follows a counted parent for counted components", () => {
    const r = ballparkQuantityForBasis({
      quantityBasis: "opening_count",
      parentQuantity: 2,
      parentUnitKey: "each",
      tradeKey: "doors",
    });
    expect(r?.quantity).toBe(2);
  });

  it("gives a 'manual' component no default, so it starts switched off", () => {
    const r = ballparkQuantityForBasis({
      quantityBasis: "manual",
      parentQuantity: 70,
      parentUnitKey: "square_foot",
      tradeKey: "plumbing",
    });
    expect(r).toBeNull();
  });

});
