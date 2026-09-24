/**
 * SEMANTIC regression matrix for the canonical estimate calculation model.
 *
 * These tests assert REASONING, not remembered numbers: that productivity and
 * total hours stay semantically distinct, that quantity changes propagate,
 * that markup is applied exactly once, and that contractor authority survives
 * every automatic correction — across nine trade archetypes.
 */

import { describe, expect, it } from "vitest";

import {
  auditEstimateReasoning,
  canonicalMaterialCost,
  canonicalTotalHours,
  diffScopeSets,
  normalizeLine,
  recomputeForQuantity,
  type RawLine,
} from "@/domains/estimating/canonicalLine";
import { planLineRepair } from "@/domains/estimating/reasoningRepair";
import { roundQuarterHour } from "@/domains/estimating/laborTime";
import { minimumTaskHours } from "@/domains/estimating/taskHourModel";

/**
 * Expected authoritative hours for an archetype: the canonical derivation,
 * lifted to the practical minimum for that kind of work, on the quarter grid.
 */
const expectedHours = (a: { quantity: number; hoursPerUnit: number; setupHours: number; unitKey: string; name: string }) => {
  const raw = canonicalTotalHours({ quantity: a.quantity, hoursPerUnit: a.hoursPerUnit, setupHours: a.setupHours });
  const floor = minimumTaskHours({ costBasis: "labor_production", unitKey: a.unitKey, description: a.name });
  return roundQuarterHour(Math.max(raw, floor.hours));
};

const line = (over: Partial<RawLine> & { id: string }): RawLine => ({
  quantity: 1,
  unitKey: "each",
  laborRate: 85,
  ...over,
});

const codes = (raw: RawLine, ctx = {}) => normalizeLine(raw, ctx).findings.map((f) => f.code);

/* ------------------------------------------------------------------ */
/* Trade archetypes                                                    */
/* ------------------------------------------------------------------ */

interface Archetype {
  name: string;
  quantity: number;
  unitKey: string;
  hoursPerUnit: number;
  setupHours: number;
  materialUnitCost: number;
  wasteFactorPct: number;
}

const ARCHETYPES: Archetype[] = [
  { name: "kitchen cabinets", quantity: 22, unitKey: "each", hoursPerUnit: 0.9, setupHours: 2, materialUnitCost: 310, wasteFactorPct: 0 },
  { name: "garage conversion drywall", quantity: 1039.02, unitKey: "square_foot", hoursPerUnit: 0.018, setupHours: 1.5, materialUnitCost: 0.62, wasteFactorPct: 10 },
  { name: "bath tile", quantity: 148, unitKey: "square_foot", hoursPerUnit: 0.14, setupHours: 1, materialUnitCost: 6.4, wasteFactorPct: 15 },
  { name: "roofing", quantity: 3200, unitKey: "square_foot", hoursPerUnit: 0.021, setupHours: 4, materialUnitCost: 1.85, wasteFactorPct: 12 },
  { name: "painting", quantity: 1039.02, unitKey: "square_foot", hoursPerUnit: 0.011, setupHours: 0.5, materialUnitCost: 0.28, wasteFactorPct: 5 },
  { name: "flooring", quantity: 620, unitKey: "square_foot", hoursPerUnit: 0.045, setupHours: 2, materialUnitCost: 4.1, wasteFactorPct: 8 },
  { name: "handyman small repair", quantity: 1, unitKey: "each", hoursPerUnit: 0.1, setupHours: 0, materialUnitCost: 12, wasteFactorPct: 0 },
  { name: "electrical / plumbing rough-in", quantity: 14, unitKey: "each", hoursPerUnit: 1.2, setupHours: 2, materialUnitCost: 46, wasteFactorPct: 0 },
  { name: "exterior concrete flatwork", quantity: 18, unitKey: "cubic_yard", hoursPerUnit: 2.4, setupHours: 6, materialUnitCost: 172, wasteFactorPct: 6 },
];

describe("canonical model across trade archetypes", () => {
  for (const a of ARCHETYPES) {
    describe(a.name, () => {
      const raw = line({
        id: a.name,
        quantity: a.quantity,
        unitKey: a.unitKey,
        laborHoursPerUnit: a.hoursPerUnit,
        laborHoursSetup: a.setupHours,
        materialCost: a.materialUnitCost,
        provenance: { wasteFactorPct: a.wasteFactorPct },
      });

      it("derives total hours as setup + quantity × productivity", () => {
        const c = normalizeLine(raw);
        expect(c.totalLaborHours).toBeCloseTo(expectedHours(a), 4);
        expect(c.laborHoursBasis).toBe("derived_per_unit");
      });

      it("keeps productivity and total hours semantically distinct", () => {
        const c = normalizeLine(raw);
        expect(c.hoursPerUnit).toBeCloseTo(a.hoursPerUnit, 6);
        if (a.quantity > 1) expect(c.totalLaborHours).toBeGreaterThan(a.hoursPerUnit);
        expect(c.laborHoursFormula).toContain(String(a.hoursPerUnit));
      });

      it("applies waste to material exactly once", () => {
        const c = normalizeLine(raw);
        expect(c.materialCost).toBeCloseTo(
          canonicalMaterialCost({ quantity: a.quantity, materialUnitCost: a.materialUnitCost, wasteFactorPct: a.wasteFactorPct }),
          2,
        );
      });

      it("recomputes labor and material when the quantity changes", () => {
        const base = normalizeLine(raw);
        const doubled = recomputeForQuantity(raw, a.quantity * 2);
        expect(doubled.materialCost).toBeCloseTo(base.materialCost * 2, 1);
        /*
         * Quarter-hour invariant: doubling scales within one 15-minute step.
         * Skipped when the practical minimum is doing the work instead of the
         * unit math — a floored task does not scale with quantity.
         */
        const floored =
          base.totalLaborHours >
          canonicalTotalHours({ quantity: a.quantity, hoursPerUnit: a.hoursPerUnit, setupHours: a.setupHours }) + 0.13;
        if (!floored) {
          expect(
            Math.abs(
              doubled.totalLaborHours - a.setupHours - (base.totalLaborHours - a.setupHours) * 2,
            ),
          ).toBeLessThanOrEqual(0.25);
        }
      });

      it("direct cost equals its parts, with no markup baked in", () => {
        const c = normalizeLine(raw);
        expect(c.directCost).toBeCloseTo(
          c.laborCost + c.materialCost + c.equipmentCost + c.subcontractorCost + c.otherCost,
          2,
        );
      });

      it("detects the per-unit-rate-stored-as-total defect and repairs it", () => {
        if (a.quantity <= 1) return;
        const broken = { ...raw, laborHours: a.hoursPerUnit };
        const c = normalizeLine(broken);
        expect(c.findings.map((f) => f.code)).toContain("per_unit_hours_stored_as_total");
        const plan = planLineRepair(c, broken);
        expect(plan.action).toBe("repaired");
        expect(plan.patch.labor_hours).toBeCloseTo(c.totalLaborHours, 4);
      });
    });
  }
});

/* ------------------------------------------------------------------ */
/* Reasoning-error classes                                             */
/* ------------------------------------------------------------------ */

describe("reasoning-error classes", () => {
  it("flags hours multiplied twice", () => {
    const raw = line({ id: "x", quantity: 100, unitKey: "square_foot", laborHoursPerUnit: 0.05, laborHours: 500 });
    expect(codes(raw)).toContain("hours_scaled_twice");
  });

  it("flags a unit mismatch between quantity and productivity", () => {
    const raw = line({
      id: "x", quantity: 100, unitKey: "square_foot",
      laborHoursPerUnit: 0.05, productivityUnitKey: "linear_foot",
    });
    expect(codes(raw)).toContain("unit_mismatch_with_productivity");
  });

  it("flags a missing unit", () => {
    expect(codes(line({ id: "x", unitKey: null }))).toContain("unit_missing");
  });

  it("flags a flat task that will not follow the quantity", () => {
    const raw = line({ id: "x", quantity: 400, unitKey: "square_foot", laborHours: 6 });
    expect(codes(raw)).toContain("setup_hours_missing");
  });

  it("flags setup time counted twice", () => {
    const raw = line({
      id: "x", quantity: 10, unitKey: "each",
      laborHoursPerUnit: 1, laborHoursSetup: 2, laborHours: 14,
    });
    expect(codes(raw)).toContain("setup_hours_double_counted");
  });

  it("flags a material extension that ignored the quantity", () => {
    const raw = line({ id: "x", quantity: 50, unitKey: "square_foot", materialCost: 3, materialTotal: 3 });
    expect(codes(raw)).toContain("material_cost_disagrees_with_quantity");
  });

  it("flags labor cost that disagrees with hours × rate", () => {
    const raw = line({ id: "x", quantity: 1, laborHours: 4, laborRate: 85, laborTotal: 200 });
    expect(codes(raw)).toContain("labor_cost_disagrees_with_hours");
  });

  it("flags a direct cost that does not equal its components", () => {
    const raw = line({ id: "x", quantity: 1, laborHours: 2, laborRate: 100, directCost: 999 });
    expect(codes(raw)).toContain("direct_cost_disagrees_with_components");
  });

  it("flags overhead/profit on a line while the estimate prices on target gross margin", () => {
    const raw = line({ id: "x", overheadPct: 10, profitPct: 10 });
    expect(codes(raw, { pricingMethod: "target_gross_margin" })).toContain("markup_embedded_in_line_cost");
  });

  it("flags contingency applied at both layers", () => {
    const raw = line({ id: "x", contingencyPct: 5 });
    expect(codes(raw, { contingencyPct: 5 })).toContain("contingency_or_tax_applied_at_line");
  });

  it("flags a placeholder quantity being priced as authority", () => {
    const raw = line({ id: "x", quantity: 1, isQuantityPlaceholder: true });
    expect(codes(raw)).toContain("quantity_placeholder_treated_as_authority");
  });

  it("flags an assumed value promoted to confirmed with no measurement", () => {
    const raw = line({ id: "x", quantityBasis: "assumed", quantityReviewedAt: "2026-01-01T00:00:00Z" });
    expect(codes(raw)).toContain("assumed_value_promoted_to_confirmed");
  });

  it("flags pricing that predates a scope or measurement change", () => {
    const raw = line({ id: "x", pricedAt: "2026-01-01T00:00:00Z" });
    expect(codes(raw, { inputsChangedAt: "2026-02-01T00:00:00Z" })).toContain("stale_pricing_after_input_change");
  });

  it("accepts a trade-specific labor rate that differs from the estimate default", () => {
    const raw = line({ id: "x", tradeKey: "electrical", laborRate: 120 });
    expect(codes(raw, { laborRate: 85 })).not.toContain("labor_rate_differs_from_estimate");
  });

  it("flags two tasks of the same trade priced at different labor rates", () => {
    const audit = auditEstimateReasoning(
      [
        line({ id: "a", tradeKey: "painting", laborRate: 65, laborHours: 4 }),
        line({ id: "b", tradeKey: "painting", laborRate: 65, laborHours: 4 }),
        line({ id: "c", tradeKey: "painting", laborRate: 40, laborHours: 4 }),
      ],
      { laborRate: 65 },
    );
    const offender = audit.findings.filter((f) => f.code === "labor_rate_differs_from_estimate");
    expect(offender.map((f) => f.lineId)).toEqual(["c"]);
  });

  it("recovers the correct total from pricing provenance when only a rate was stored", () => {
    const raw = line({
      id: "paint", quantity: 1039.02, unitKey: "square_foot",
      laborHours: 0.011, provenance: { computedLaborHours: 11.4292 },
    });
    const c = normalizeLine(raw);
    expect(c.findings.map((f) => f.code)).toContain("per_unit_hours_stored_as_total");
    expect(c.totalLaborHours).toBeCloseTo(11.4292, 3);
  });
});

/* ------------------------------------------------------------------ */
/* Contractor authority                                                */
/* ------------------------------------------------------------------ */

describe("contractor authority", () => {
  it("keeps a deliberate contractor entry, normalized to the quarter hour", () => {
    const raw = line({
      id: "x", quantity: 400, unitKey: "square_foot",
      laborHours: 0.1, laborHoursPerUnit: 0.02, laborHoursBasis: "contractor",
      laborHoursConfirmedAt: "2026-03-01T00:00:00Z",
    });
    const c = normalizeLine(raw);
    /* 0.1 hr is the contractor's intent; the billable value is the 15-minute minimum. */
    expect(c.totalLaborHours).toBe(0.25);
    expect(c.isLaborContractorOwned).toBe(true);
    expect(planLineRepair(c, raw).action).toBe("preserved");
    expect(planLineRepair(c, raw).patch.labor_hours).toBeUndefined();
  });

  it("never rewrites labor on a contractor-overridden price", () => {
    const raw = line({
      id: "x", quantity: 300, unitKey: "square_foot",
      laborHoursPerUnit: 0.02, laborHours: 0.02, isPriceOverridden: true,
    });
    const plan = planLineRepair(normalizeLine(raw), raw);
    expect(plan.patch.labor_hours).toBeUndefined();
  });

  it("flags rather than repairs an ambiguous disagreement", () => {
    const raw = line({
      id: "x", quantity: 10, unitKey: "each",
      laborHoursPerUnit: 1, laborHours: 4,
    });
    const plan = planLineRepair(normalizeLine(raw), raw);
    expect(plan.action).toBe("flagged");
    expect(plan.patch.labor_hours).toBeUndefined();
  });

  it("leaves a consistent line completely alone", () => {
    const raw = line({
      id: "x", quantity: 10, unitKey: "each",
      laborHoursPerUnit: 1, laborHoursSetup: 0, laborHours: 10, laborRate: 85,
      laborTotal: 850, materialCost: 0, materialTotal: 0, directCost: 850,
    });
    const c = normalizeLine(raw);
    expect(c.findings).toHaveLength(0);
    expect(planLineRepair(c, raw).action).toBe("preserved");
  });
});

/* ------------------------------------------------------------------ */
/* Estimate-level reasoning                                            */
/* ------------------------------------------------------------------ */

describe("estimate-level reasoning", () => {
  it("aggregates canonical totals independent of stored extensions", () => {
    const rows = [
      line({ id: "a", quantity: 10, unitKey: "each", laborHoursPerUnit: 1, laborRate: 85, laborTotal: 1 }),
      line({ id: "b", quantity: 5, unitKey: "each", laborHoursPerUnit: 2, laborRate: 85, materialCost: 10 }),
    ];
    const audit = auditEstimateReasoning(rows, { laborRate: 85 });
    expect(audit.totals.laborHours).toBeCloseTo(20, 4);
    expect(audit.totals.laborCost).toBeCloseTo(1700, 2);
    expect(audit.totals.materialCost).toBeCloseTo(50, 2);
    expect(audit.counts.errors).toBeGreaterThan(0);
  });

  it("detects silent scope drift between preliminary and detailed", () => {
    const diff = diffScopeSets(
      [{ key: "paint", quantity: 1000, unitKey: "square_foot" }, { key: "trim", quantity: 40, unitKey: "linear_foot" }],
      [{ key: "paint", quantity: 1039, unitKey: "square_foot" }, { key: "drywall", quantity: 1039, unitKey: "square_foot" }],
    );
    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "quantity_changed", key: "paint" }),
        expect.objectContaining({ code: "removed", key: "trim" }),
        expect.objectContaining({ code: "added", key: "drywall" }),
      ]),
    );
  });
});
