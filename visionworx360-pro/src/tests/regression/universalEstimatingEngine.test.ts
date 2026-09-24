/**
 * UNIVERSAL ESTIMATING ENGINE — regression matrix.
 *
 * Two invariants, proven across nine trade archetypes:
 *  1. For identical lines, quality level and pricing snapshot, the preliminary
 *     RECOMMENDED price equals the final selling price to the cent.
 *  2. A per-unit production rate is never a total, and a contractor's own
 *     number is never rewritten.
 */

import { describe, expect, it } from "vitest";
import {
  assessLaborHours,
  auditLaborHours,
  computeTotalLaborHours,
  type LaborHoursLine,
} from "@/domains/estimating/laborHoursIntegrity";
import {
  buildPreliminaryLevels,
  buildReconciliationSnapshot,
  canonicalSellingPrice,
  customerFacingPrice,
} from "@/domains/estimating/preliminaryLevels";
import type { EngineLineInput, EstimateEngineConfig } from "@/domains/estimating/engine/types";

const line = (over: Partial<EngineLineInput> & { id: string }): EngineLineInput => ({
  quantity: 1,
  laborRate: 65,
  materialCost: 0,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  overheadPct: 10,
  profitPct: 10,
  contingencyPct: 0,
  isTaxable: false,
  ...over,
});

/** One archetype per trade the pilot actually sells. */
const ARCHETYPES: { name: string; lines: EngineLineInput[] }[] = [
  {
    name: "kitchen cabinets",
    lines: [
      line({ id: "k1", quantity: 22, unitKey: "each", materialCost: 310, laborHoursPerUnit: 0.9 }),
      line({ id: "k2", quantity: 34, unitKey: "linear_foot", materialCost: 62, laborHoursPerUnit: 0.35 }),
    ],
  },
  {
    name: "garage conversion",
    lines: [
      line({ id: "g1", quantity: 1039, unitKey: "square_foot", materialCost: 1.15, laborHoursPerUnit: 0.018 }),
      line({ id: "g2", quantity: 306.9, unitKey: "square_foot", materialCost: 6.4, laborHoursPerUnit: 0.05 }),
    ],
  },
  {
    name: "bath",
    lines: [
      line({ id: "b1", quantity: 64, unitKey: "square_foot", materialCost: 9.2, laborHoursPerUnit: 0.14 }),
      line({ id: "b2", quantity: 1, unitKey: "each", materialCost: 480, laborHours: 4 }),
    ],
  },
  {
    name: "roofing",
    lines: [line({ id: "r1", quantity: 2400, unitKey: "square_foot", materialCost: 2.1, laborHoursPerUnit: 0.02 })],
  },
  {
    name: "painting",
    lines: [line({ id: "p1", quantity: 1800, unitKey: "square_foot", materialCost: 0.42, laborHoursPerUnit: 0.011 })],
  },
  {
    name: "flooring",
    lines: [line({ id: "f1", quantity: 306.9, unitKey: "square_foot", materialCost: 5.5, laborHoursPerUnit: 0.055 })],
  },
  {
    name: "handyman small repair",
    lines: [line({ id: "h1", quantity: 1, unitKey: "each", materialCost: 35, laborHours: 1.5 })],
  },
  {
    name: "electrical / plumbing",
    lines: [
      line({ id: "e1", quantity: 12, unitKey: "each", materialCost: 28, laborHoursPerUnit: 0.75 }),
      line({ id: "e2", quantity: 3, unitKey: "each", materialCost: 190, laborHoursPerUnit: 2.5 }),
    ],
  },
  {
    name: "exterior site concrete",
    lines: [
      line({ id: "c1", quantity: 14, unitKey: "cubic_yard", materialCost: 205, laborHoursPerUnit: 1.4, subcontractorCost: 0 }),
    ],
  },
];

const OP_CONFIG: EstimateEngineConfig = { currency: "USD", taxRatePct: 0 };
const OP_STRATEGY = {
  method: "overhead_profit" as const,
  overheadPct: 10,
  profitPct: 10,
  targetGrossMarginPct: 0,
};
const TGM_STRATEGY = {
  method: "target_gross_margin" as const,
  overheadPct: 0,
  profitPct: 0,
  targetGrossMarginPct: 30,
};

describe("preliminary recommended reconciles with final selling price", () => {
  for (const { name, lines } of ARCHETYPES) {
    for (const strategy of [OP_STRATEGY, TGM_STRATEGY]) {
      it(`${name} — ${strategy.method}`, () => {
        const prelim = buildPreliminaryLevels(lines, OP_CONFIG, strategy);
        const final = canonicalSellingPrice(lines, OP_CONFIG, strategy);

        expect(prelim.levels.recommended.sellingPrice).toBe(final.sellingPrice);
        expect(prelim.levels.recommended.directCost).toBe(final.directCost);

        /* The band expresses uncertainty around that one number, not a rival formula. */
        expect(prelim.levels.recommended.low).toBeLessThan(final.sellingPrice);
        expect(prelim.levels.recommended.high).toBeGreaterThan(final.sellingPrice);

        /* Quality levels move the price monotonically off the same basis. */
        expect(prelim.levels.economy.sellingPrice).toBeLessThan(final.sellingPrice);
        expect(prelim.levels.premium.sellingPrice).toBeGreaterThan(final.sellingPrice);
      });
    }
  }
});

describe("pricing method mutual exclusivity", () => {
  const lines = ARCHETYPES[0]!.lines;

  it("target gross margin suppresses overhead and profit in the snapshot", () => {
    const { pricingSnapshot } = buildPreliminaryLevels(lines, OP_CONFIG, {
      ...TGM_STRATEGY,
      overheadPct: 10,
      profitPct: 10,
    });
    expect(pricingSnapshot.method).toBe("target_gross_margin");
    expect(pricingSnapshot.overheadPct).toBe(0);
    expect(pricingSnapshot.profitPct).toBe(0);
  });

  it("the two methods produce different prices from the same cost basis", () => {
    const op = canonicalSellingPrice(lines, OP_CONFIG, OP_STRATEGY);
    const tgm = canonicalSellingPrice(lines, OP_CONFIG, TGM_STRATEGY);
    expect(op.directCost).toBe(tgm.directCost);
    expect(op.sellingPrice).not.toBe(tgm.sellingPrice);
  });
});

describe("scope change produces an explained delta, never silent drift", () => {
  it("names the driver and reconciles when nothing changed", () => {
    const base = ARCHETYPES[2]!.lines;
    const prelim = canonicalSellingPrice(base, OP_CONFIG, OP_STRATEGY);

    const unchanged = buildReconciliationSnapshot({
      selectedLevel: "recommended",
      preliminary: prelim,
      final: prelim,
      pricingSnapshot: buildPreliminaryLevels(base, OP_CONFIG, OP_STRATEGY).pricingSnapshot,
    });
    expect(unchanged.reconciles).toBe(true);
    expect(unchanged.deltaDrivers).toHaveLength(0);

    const grown = [...base, line({ id: "b3", quantity: 1, materialCost: 900, laborHours: 6 })];
    const finalPriced = canonicalSellingPrice(grown, OP_CONFIG, OP_STRATEGY);
    const changed = buildReconciliationSnapshot({
      selectedLevel: "recommended",
      preliminary: prelim,
      final: finalPriced,
      pricingSnapshot: buildPreliminaryLevels(base, OP_CONFIG, OP_STRATEGY).pricingSnapshot,
      deltaDrivers: [{ code: "scope_added", detail: "b3", amount: 900 }],
    });
    expect(changed.reconciles).toBe(false);
    expect(changed.deltaDrivers[0]!.code).toBe("scope_added");
  });

  it("an unexplained gap is reported rather than hidden", () => {
    const snap = buildReconciliationSnapshot({
      selectedLevel: "recommended",
      preliminary: { sellingPrice: 10000, directCost: 7000, laborHours: 80 },
      final: { sellingPrice: 14000, directCost: 9800, laborHours: 80 },
      pricingSnapshot: buildPreliminaryLevels([], OP_CONFIG, OP_STRATEGY).pricingSnapshot,
    });
    expect(snap.reconciles).toBe(false);
    expect(snap.deltaDrivers[0]!.code).toBe("unexplained");
  });
});

describe("customer-facing output hides internal financials", () => {
  it("exposes only the price and the level", () => {
    const priced = canonicalSellingPrice(ARCHETYPES[3]!.lines, OP_CONFIG, OP_STRATEGY);
    const snap = buildReconciliationSnapshot({
      selectedLevel: "recommended",
      preliminary: priced,
      final: priced,
      pricingSnapshot: buildPreliminaryLevels([], OP_CONFIG, OP_STRATEGY).pricingSnapshot,
    });
    const customer = customerFacingPrice(snap);
    expect(Object.keys(customer).sort()).toEqual(["level", "sellingPrice"]);
    expect(JSON.stringify(customer)).not.toContain("directCost");
    expect(JSON.stringify(customer)).not.toContain("laborHours");
  });
});

describe("labor hours: per-unit rate vs total", () => {
  it("scales hours with quantity", () => {
    expect(computeTotalLaborHours({ quantity: 306.9, hoursPerUnit: 0.055 })).toBe(17);
    expect(computeTotalLaborHours({ quantity: 100, hoursPerUnit: 0.02, setupHours: 2 })).toBeCloseTo(4, 2);
  });

  it("300+ SF of flooring cannot stay at 0.055 total hours", () => {
    const assessment = assessLaborHours({
      id: "f1",
      description: "Hardwood flooring",
      quantity: 306.9,
      unitKey: "square_foot",
      laborHours: 0.055,
      computedLaborHours: 16.8795,
      pricingSource: "knowledge_base",
    });
    expect(assessment.verdict).toBe("per_unit_stored_as_total");
    expect(assessment.isRepairable).toBe(true);
    expect(assessment.expectedHours).toBe(17);
  });

  it("a contractor's explicit 0.1 hr is never inflated", () => {
    const assessment = assessLaborHours({
      id: "h1",
      description: "Tighten hinge",
      quantity: 1,
      unitKey: "each",
      laborHours: 0.1,
      pricingSource: "contractor",
      isContractorOwned: true,
    });
    expect(assessment.isRepairable).toBe(false);
    expect(assessment.storedHours).toBe(0.1);
  });

  it("audits a mixed batch into repairable, preserved and healthy", () => {
    const lines: LaborHoursLine[] = [
      {
        id: "paint",
        quantity: 1039,
        unitKey: "square_foot",
        laborHours: 0.011,
        computedLaborHours: 11.4292,
        pricingSource: "knowledge_base",
      },
      {
        id: "drywall",
        quantity: 1039,
        unitKey: "square_foot",
        laborHours: 0.018,
        computedLaborHours: 18.7024,
        pricingSource: "knowledge_base",
      },
      { id: "override", quantity: 1, unitKey: "each", laborHours: 0.1, isContractorOwned: true },
      {
        id: "healthy",
        quantity: 22,
        unitKey: "each",
        laborHours: 19.8,
        computedLaborHours: 19.8,
        pricingSource: "knowledge_base",
      },
    ];
    const audit = auditLaborHours(lines);
    const repairable = audit.assessments.filter((a) => a.isRepairable).map((a) => a.id);
    expect(repairable.sort()).toEqual(["drywall", "paint"]);
    expect(audit.assessments.find((a) => a.id === "override")!.isRepairable).toBe(false);
    expect(audit.assessments.find((a) => a.id === "healthy")!.isRepairable).toBe(false);
  });
});
