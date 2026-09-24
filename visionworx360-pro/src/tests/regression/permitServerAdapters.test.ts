import { describe, expect, it } from "vitest";
import { resolvePermitPlan } from "@/domains/permits/resolve";
import {
  permitTypeFromDescription,
  prePermitValuationBase,
  toContractorEntries,
  toJurisdiction,
  toPermitRule,
  toScopeSignals,
  type PermitLineRow,
  type PermitRuleRow,
} from "@/features/estimating/services/permits.server";

const line = (over: Partial<PermitLineRow>): PermitLineRow => ({
  id: crypto.randomUUID(),
  description: "Frame wall",
  trade_key: "framing",
  quantity: 20,
  unit_key: "linear_foot",
  cost_basis: "labor_production",
  other_cost: 0,
  direct_cost: 1000,
  is_price_overridden: false,
  archived_at: null,
  ...over,
});

const ruleRow = (over: Partial<PermitRuleRow> = {}): PermitRuleRow => ({
  id: crypto.randomUUID(),
  jurisdiction_scope: "city",
  city: "Austin",
  county: null,
  state: "TX",
  postal_code: null,
  country_code: "US",
  permit_type: "electrical",
  work_class: "any",
  calc_method: "flat",
  base_amount: "225",
  min_amount: null,
  max_amount: null,
  rate: null,
  low_amount: null,
  high_amount: null,
  effective_date: "2026-01-01",
  library_version: "austin-2026",
  source_type: "municipal",
  source_title: "City of Austin fee schedule",
  source_url: null,
  confidence: "verified",
  bundles: [],
  notes: null,
  ...over,
});

describe("permit server adapters", () => {
  it("maps a stored fee rule onto the domain contract", () => {
    const rule = toPermitRule(ruleRow());
    expect(rule?.permitType).toBe("electrical");
    expect(rule?.base).toBe(225);
    expect(rule?.sourceType).toBe("municipal");
  });

  it("rejects an unknown permit type instead of guessing", () => {
    expect(toPermitRule(ruleRow({ permit_type: "spaceship" }))).toBeNull();
  });

  it("reads the state from the property region column", () => {
    expect(
      toJurisdiction({ city: "Austin", region: "TX", county: "Travis", postal_code: "78704" }),
    ).toMatchObject({ city: "Austin", state: "TX", county: "Travis", postalCode: "78704" });
  });

  it("excludes permit fee lines from scope signals and the valuation base", () => {
    const lines = [
      line({ direct_cost: 5000 }),
      line({ description: "Building permit", cost_basis: "permit_fee", other_cost: 689, direct_cost: 689 }),
    ];
    expect(toScopeSignals(lines)).toHaveLength(1);
    /* No permit dollars in the base a percent rule reads: never recursive. */
    expect(prePermitValuationBase(lines)).toBe(5000);
  });

  it("treats only an explicit override as contractor authority", () => {
    const lines = [
      line({ description: "Building permit", cost_basis: "permit_fee", other_cost: 689, is_price_overridden: false }),
      line({ description: "Electrical permit", cost_basis: "permit_fee", other_cost: 310, is_price_overridden: true }),
    ];
    const entries = toContractorEntries(lines, permitTypeFromDescription);
    expect(entries).toEqual([
      expect.objectContaining({ permitType: "electrical", amount: 310 }),
    ]);
  });

  it("classifies existing permit wording by trade", () => {
    expect(permitTypeFromDescription("Electrical permit and inspection")).toBe("electrical");
    expect(permitTypeFromDescription("Plumbing permit")).toBe("plumbing");
    expect(permitTypeFromDescription("HVAC permit")).toBe("mechanical");
    expect(permitTypeFromDescription("Building permit")).toBe("building");
  });

  it("prefers a saved local rule over the national fallback, and never mixes jurisdictions", () => {
    const local = toPermitRule(ruleRow())!;
    const signals = toScopeSignals([line({ description: "Install 3 new circuits", trade_key: "electrical" })]);

    const inAustin = resolvePermitPlan({
      signals,
      jurisdiction: { city: "Austin", state: "TX" },
      rules: [local],
      valuationBase: 20_000,
    });
    const electricalAustin = inAustin.components.find((c) => c.permitType === "electrical");
    expect(electricalAustin?.sourceType).toBe("municipal");
    expect(electricalAustin?.amount).toBe(225);

    const elsewhere = resolvePermitPlan({
      signals,
      jurisdiction: { city: "Dallas", state: "TX" },
      rules: [local],
      valuationBase: 20_000,
    });
    const electricalDallas = elsewhere.components.find((c) => c.permitType === "electrical");
    expect(electricalDallas?.sourceType).toBe("national_benchmark");
  });

  it("keeps every permit dollar whole and every permit labor hour zero", () => {
    const plan = resolvePermitPlan({
      signals: toScopeSignals([
        line({ description: "Convert garage to master suite", trade_key: "framing" }),
        line({ description: "Rough-in plumbing for new bathroom", trade_key: "plumbing" }),
        line({ description: "Install new circuits and panel", trade_key: "electrical" }),
      ]),
      projectClass: "garage_conversion",
      jurisdiction: { city: "Austin", state: "TX" },
      valuationBase: 24_708,
    });
    expect(plan.total).toBeGreaterThan(0);
    for (const c of plan.components) {
      expect(Number.isInteger(c.amount)).toBe(true);
      expect(c.laborHours).toBe(0);
      expect(c.costBasis).toBe("permit_fee");
    }
  });
});
