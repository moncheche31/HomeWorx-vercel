/**
 * TASK-HOUR REASONING REGRESSION MATRIX.
 *
 * Proves the canonical task-hour path across garage conversion, kitchen,
 * bathroom, handyman and roofing work:
 *
 *   1. every produced hour value lands on the quarter-hour grid;
 *   2. system hours derive from explicit quantity + unit + convention;
 *   3. a measured task never silently prices off a placeholder quantity of 1;
 *   4. fee/permit/direct-cost lines carry zero production labor;
 *   5. contractor overrides survive everything but quarter-hour normalization;
 *   6. real work never collapses to an impossible six or fifteen minutes.
 */

import { describe, expect, it } from "vitest";

import { deriveTaskHours, hasQuantityEvidence, minimumTaskHours } from "@/domains/estimating/taskHourModel";
import type { TaskCostBasis } from "@/domains/estimating/costBasis";

const isQuarter = (h: number) => Number.isInteger(Math.round(h * 4 * 1e6) / 1e6);

interface Row {
  name: string;
  costBasis: TaskCostBasis;
  tradeKey: string;
  description: string;
  unitKey: string;
  quantity: number;
  quantityBasis?: string;
  hoursPerUnit?: number;
  setupHours?: number;
  contractorHours?: number;
  isQuantityPlaceholder?: boolean;
  expectHours?: number;
  expectMinAtLeast?: number;
  expectNeedsReview?: boolean;
}

const MATRIX: Row[] = [
  /* --- garage conversion ------------------------------------------- */
  {
    name: "garage: demo existing wall",
    costBasis: "labor_production",
    tradeKey: "demolition",
    description: "Demo existing garage wall framing and finishes",
    unitKey: "square_foot",
    quantity: 320,
    quantityBasis: "measurement",
    hoursPerUnit: 0.02,
    setupHours: 1,
    expectHours: 7.5,
  },
  {
    name: "garage: LVL header install",
    costBasis: "labor_production",
    tradeKey: "framing",
    description: "Install LVL header at garage door opening",
    unitKey: "linear_foot",
    quantity: 16,
    quantityBasis: "geometry_derived",
    hoursPerUnit: 0.35,
    expectHours: 5.5,
  },
  {
    name: "garage: single GFCI cannot take six minutes",
    costBasis: "labor_production",
    tradeKey: "electrical",
    description: "Install GFCI receptacle at new counter",
    unitKey: "each",
    quantity: 1,
    hoursPerUnit: 0.1,
    expectHours: 0.5,
    expectMinAtLeast: 0.5,
  },
  {
    name: "garage: building permit is not work",
    costBasis: "permit_fee",
    tradeKey: "general_conditions",
    description: "Building permit fee",
    unitKey: "each",
    quantity: 1,
    hoursPerUnit: 2,
    expectHours: 0,
  },
  /* --- kitchen / cabinets ------------------------------------------- */
  {
    name: "kitchen: cabinet install by linear foot",
    costBasis: "labor_production",
    tradeKey: "finish_carpentry",
    description: "Install base and wall cabinets",
    unitKey: "linear_foot",
    quantity: 24,
    quantityBasis: "measurement",
    hoursPerUnit: 0.75,
    setupHours: 1.5,
    expectHours: 19.5,
  },
  {
    name: "kitchen: dishwasher hookup honours appliance minimum",
    costBasis: "labor_production",
    tradeKey: "plumbing",
    description: "Connect dishwasher and disposal",
    unitKey: "each",
    quantity: 1,
    hoursPerUnit: 0.4,
    expectHours: 1,
    expectMinAtLeast: 1,
  },
  /* --- bathroom remodel --------------------------------------------- */
  {
    name: "bathroom: toilet set",
    costBasis: "labor_production",
    tradeKey: "plumbing",
    description: "Set new toilet",
    unitKey: "each",
    quantity: 1,
    hoursPerUnit: 0.6,
    expectHours: 1.5,
  },
  {
    name: "bathroom: shower tile is a tile task",
    costBasis: "labor_production",
    tradeKey: "tile",
    description: "Tile shower walls",
    unitKey: "square_foot",
    quantity: 96,
    quantityBasis: "measurement",
    hoursPerUnit: 0.16,
    setupHours: 2,
    expectHours: 17.25,
  },
  {
    name: "bathroom: measured tile with placeholder quantity is unresolved",
    costBasis: "labor_production",
    tradeKey: "tile",
    description: "Tile floor",
    unitKey: "square_foot",
    quantity: 1,
    isQuantityPlaceholder: true,
    hoursPerUnit: 0.16,
    expectHours: 0,
    expectNeedsReview: true,
  },
  /* --- handyman / small repair -------------------------------------- */
  {
    name: "handyman: drywall patch",
    costBasis: "labor_production",
    tradeKey: "drywall",
    description: "Patch drywall at removed shelving",
    unitKey: "each",
    quantity: 2,
    hoursPerUnit: 0.2,
    expectHours: 0.5,
  },
  {
    name: "handyman: floor transition strip",
    costBasis: "labor_production",
    tradeKey: "flooring",
    description: "Transitions and thresholds",
    unitKey: "each",
    quantity: 1,
    hoursPerUnit: 0.35,
    expectHours: 0.5,
  },
  /* --- roofing / specialty ------------------------------------------ */
  {
    name: "roofing: tear off and reroof by square foot",
    costBasis: "labor_production",
    tradeKey: "roofing",
    description: "Tear off and install architectural shingles",
    unitKey: "square_foot",
    quantity: 1800,
    quantityBasis: "measurement",
    hoursPerUnit: 0.022,
    setupHours: 3,
    expectHours: 42.5,
  },
  {
    name: "hvac: mini split install carries an equipment-day minimum",
    costBasis: "labor_production",
    tradeKey: "hvac",
    description: "Install ductless mini-split head and line set",
    unitKey: "each",
    quantity: 1,
    hoursPerUnit: 1,
    expectHours: 4,
  },
];

describe("task-hour reasoning matrix", () => {
  for (const row of MATRIX) {
    it(row.name, () => {
      const result = deriveTaskHours({
        costBasis: row.costBasis,
        tradeKey: row.tradeKey,
        description: row.description,
        unitKey: row.unitKey,
        quantity: row.quantity,
        quantityBasis: row.quantityBasis ?? null,
        isQuantityPlaceholder: row.isQuantityPlaceholder ?? false,
        setupHours: row.setupHours ?? 0,
        rate:
          row.hoursPerUnit == null
            ? null
            : { convention: "hours_per_unit", value: row.hoursPerUnit },
      });

      expect(isQuarter(result.hours), `${result.hours} is not a quarter hour`).toBe(true);
      if (row.expectHours != null) expect(result.hours).toBe(row.expectHours);
      if (row.expectMinAtLeast != null) expect(result.hours).toBeGreaterThanOrEqual(row.expectMinAtLeast);
      if (row.expectNeedsReview) expect(result.needsReview).toBe(true);
      else expect(result.needsReview).toBe(false);
    });
  }
});

describe("fee and direct-cost lines", () => {
  const bases: TaskCostBasis[] = ["permit_fee", "other_direct_cost", "material_unit", "subcontract"];
  for (const basis of bases) {
    it(`${basis} carries zero production labor`, () => {
      const r = deriveTaskHours({
        costBasis: basis,
        tradeKey: "general_conditions",
        description: "Permit and inspection fees",
        unitKey: "each",
        quantity: 1,
        rate: { convention: "hours_per_unit", value: 3 },
      });
      expect(r.hours).toBe(0);
      expect(minimumTaskHours({ costBasis: basis, tradeKey: "plumbing", unitKey: "each" }).hours).toBe(0);
    });
  }
});

describe("contractor overrides", () => {
  it("survives derivation and is only quarter-hour normalized", () => {
    const r = deriveTaskHours({
      costBasis: "labor_production",
      tradeKey: "electrical",
      description: "Install GFCI receptacle",
      unitKey: "each",
      quantity: 1,
      contractorHours: 0.31,
      rate: { convention: "hours_per_unit", value: 4 },
    });
    expect(r.source).toBe("contractor");
    expect(r.hours).toBe(0.25);
    expect(isQuarter(r.hours)).toBe(true);
  });

  it("a contractor total below the trade minimum is still respected", () => {
    const r = deriveTaskHours({
      costBasis: "labor_production",
      tradeKey: "plumbing",
      description: "Set new toilet",
      unitKey: "each",
      quantity: 1,
      contractorHours: 0.5,
    });
    expect(r.hours).toBe(0.5);
    expect(r.minimumApplied).toBe(false);
  });
});

describe("quantity evidence", () => {
  it("a measured unit at exactly 1 with no basis is not evidence", () => {
    expect(hasQuantityEvidence({ quantity: 1, unitKey: "square_foot" })).toBe(false);
  });

  it("a measured unit backed by a measurement is evidence", () => {
    expect(hasQuantityEvidence({ quantity: 1, unitKey: "square_foot", quantityBasis: "measurement" })).toBe(true);
  });

  it("a counted unit at 1 is legitimate", () => {
    expect(hasQuantityEvidence({ quantity: 1, unitKey: "each" })).toBe(true);
  });

  it("no productivity source yields review, never an invented tiny total", () => {
    const r = deriveTaskHours({
      costBasis: "labor_production",
      tradeKey: "painting",
      description: "Paint walls",
      unitKey: "square_foot",
      quantity: 400,
      quantityBasis: "measurement",
      rate: null,
    });
    expect(r.hours).toBe(0);
    expect(r.needsReview).toBe(true);
    expect(r.source).toBe("insufficient_evidence");
  });
});

describe("no impossible task times anywhere in the matrix", () => {
  it("no derived production task lands between zero and a quarter hour", () => {
    for (const row of MATRIX) {
      const r = deriveTaskHours({
        costBasis: row.costBasis,
        tradeKey: row.tradeKey,
        description: row.description,
        unitKey: row.unitKey,
        quantity: row.quantity,
        quantityBasis: row.quantityBasis ?? null,
        isQuantityPlaceholder: row.isQuantityPlaceholder ?? false,
        setupHours: row.setupHours ?? 0,
        rate:
          row.hoursPerUnit == null
            ? null
            : { convention: "hours_per_unit", value: row.hoursPerUnit },
      });
      expect(r.hours === 0 || r.hours >= 0.25).toBe(true);
    }
  });
});
