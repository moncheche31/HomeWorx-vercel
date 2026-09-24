import { describe, it, expect } from "vitest";
import {
  assemblyExpansionSchema,
  assertNoPricingSignals,
  expansionSignature,
  isExpansionEnabledForTrade,
} from "../assemblyExpansion.shared";

const base = {
  assembly_label: "Standing seam metal roof, existing sheathing",
  components: [
    {
      sequence: 1,
      name: "Ice and water shield at eaves and valleys",
      search_terms: ["ice and water shield"],
      typical_unit: "SF",
      inclusion: "standard" as const,
      quantity_basis: "eave_lf" as const,
      reason: "Code required at eaves in cold climates",
    },
  ],
};

describe("assembly expansion guards", () => {
  /*
   * Expansion now covers every supported trade, not just the roofing/siding
   * pilot. A missing trade must still refuse to expand rather than guess.
   */
  it("expands every supported trade and refuses an unknown one", () => {
    for (const trade of ["roofing", "siding", "drywall", "painting", "electrical", "plumbing", "flooring"]) {
      expect(isExpansionEnabledForTrade(trade), trade).toBe(true);
    }
    expect(isExpansionEnabledForTrade(null)).toBe(false);
    expect(isExpansionEnabledForTrade("underwater_basket_weaving")).toBe(false);
  });


  it("strips any field the schema does not declare", () => {
    const parsed = assemblyExpansionSchema.parse({
      ...base,
      components: [{ ...base.components[0], unit_cost: 4.25, labor_hours: 1.5 }],
    });
    expect(parsed.components[0]).not.toHaveProperty("unit_cost");
    expect(parsed.components[0]).not.toHaveProperty("labor_hours");
  });

  it("rejects the whole expansion when text smuggles a price", () => {
    expect(() =>
      assertNoPricingSignals({
        ...base,
        components: [{ ...base.components[0], reason: "About $4.25 per square foot" }],
      }),
    ).toThrow(/pricing signal/i);
  });

  it("rejects the whole expansion when text smuggles hours", () => {
    expect(() =>
      assertNoPricingSignals({
        ...base,
        components: [{ ...base.components[0], name: "Tear off, 2.5 hours per square" }],
      }),
    ).toThrow(/pricing signal/i);
  });

  it("accepts a clean expansion", () => {
    expect(() => assertNoPricingSignals(base)).not.toThrow();
  });

  it("signature is stable across casing and whitespace", () => {
    expect(expansionSignature({ tradeKey: "Roofing", scopePhrase: "  Roofing " })).toBe(
      expansionSignature({ tradeKey: "roofing", scopePhrase: "roofing" }),
    );
  });
});

describe("pricing guard tolerates ordinary component prose", () => {
  it("accepts descriptive words like rated, cost-effective, laborer", () => {
    expect(() =>
      assertNoPricingSignals({
        assembly_label: "Standing Seam Metal Roof",
        components: [
          {
            sequence: 1,
            name: "High-Temp Rated Underlayment",
            search_terms: ["underlayment", "self-adhered"],
            typical_unit: "SQ",
            inclusion: "standard",
            quantity_basis: "same_as_parent",
            reason: "A cost-effective barrier a laborer installs before panels.",
          },
        ],
      }),
    ).not.toThrow();
  });
});
