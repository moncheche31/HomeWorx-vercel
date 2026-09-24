/**
 * Permanent regression cover for the Master Suite Garage Conversion failures:
 *  1. an explicitly saved pricing method survives every automatic reprice;
 *  2. target gross margin and overhead+profit never stack;
 *  3. a generic finish-floor line is superseded by the specific material line;
 *  4. an area line stuck at quantity 1 is repaired from project geometry.
 */

import { describe, it, expect } from "vitest";
import { recalculateBallparkFromScope } from "@/domains/ballpark/scopeRecalc";
import {
  findSupersededLines,
  quantityToInherit,
} from "@/domains/estimating/supersession";
import {
  autoApplicableDerivations,
  isDefectiveMeasuredQuantity,
} from "@/domains/geometry/autoApply";
import { findOrphanedLineIds } from "@/domains/estimating/scopeSync";
import { resolvePricingProvenance } from "@/domains/estimating/pricingProvenance";
import { normalizePricingStrategy } from "@/domains/estimating/pricingStrategy";

const scope = [
  { id: "s1", title: "Install oak hardwood flooring", quantity: 288, unitKey: "square_foot", isIncluded: true, archivedAt: null },
  { id: "s2", title: "Frame interior partition walls", quantity: 64, unitKey: "linear_foot", isIncluded: true, archivedAt: null },
];

describe("pricing method survives recalculation", () => {
  const target = normalizePricingStrategy({
    method: "target_gross_margin",
    targetGrossMarginPct: 40,
    overheadPct: 10,
    profitPct: 10,
  });

  it("prices the band on the estimate's own target margin, not legacy 10/10", () => {
    const margin = recalculateBallparkFromScope(scope, { pricingStrategy: target });
    const legacy = recalculateBallparkFromScope(scope, {});
    expect(margin).not.toBeNull();
    expect(legacy).not.toBeNull();
    /* 40% gross margin grosses cost up by 1/0.6 — strictly more than 10+10%. */
    expect(margin!.band.expected).toBeGreaterThan(legacy!.band.expected);
  });

  it("never stacks overhead+profit on top of a target margin", () => {
    const a = recalculateBallparkFromScope(scope, { pricingStrategy: target });
    const b = recalculateBallparkFromScope(scope, {
      pricingStrategy: target,
      overheadPct: 25,
      profitPct: 25,
    });
    expect(b!.band.expected).toBe(a!.band.expected);
  });

  it("leaves legacy overhead+profit estimates exactly as they were", () => {
    const legacy = normalizePricingStrategy({
      method: "overhead_profit",
      overheadPct: 10,
      profitPct: 10,
    });
    const withStrategy = recalculateBallparkFromScope(scope, { pricingStrategy: legacy });
    const withoutStrategy = recalculateBallparkFromScope(scope, {});
    expect(withStrategy!.band.expected).toBe(withoutStrategy!.band.expected);
  });

  it("reports an estimate on 40% margin as an override of a 30% company default", () => {
    const provenance = resolvePricingProvenance(target, {
      method: "target_gross_margin",
      targetGrossMarginPct: 30,
    });
    expect(provenance.source).toBe("estimate_override");
    expect(provenance.methodDiffers).toBe(false);
  });
});

describe("finish-floor supersession", () => {
  const lines = [
    {
      id: "generic",
      description: "Install finished flooring",
      quantity: 316.8,
      unitKey: "square_foot",
      pricingSource: "unmatched",
    },
    {
      id: "specific",
      description: "Hardwood flooring",
      quantity: 1,
      unitKey: "square_foot",
      pricingSource: "system",
    },
    {
      id: "prep",
      description: "Patch and level subfloor",
      quantity: 288,
      unitKey: "square_foot",
      pricingSource: "system",
    },
  ];

  it("keeps the specific material line and archives the generic one", () => {
    const { supersededIds, supersededBy } = findSupersededLines(lines);
    expect(supersededIds).toEqual(["generic"]);
    expect(supersededBy.generic).toBe("specific");
  });

  it("leaves genuinely separate prep work priced", () => {
    const { supersededIds } = findSupersededLines(lines);
    expect(supersededIds).not.toContain("prep");
  });

  it("moves the resolved area onto the surviving line", () => {
    expect(quantityToInherit(lines[1]!, lines[0]!)).toBe(316.8);
  });

  it("never supersedes a contractor-priced line", () => {
    const { supersededIds } = findSupersededLines([
      { ...lines[0]!, pricingSource: "manual", isPriceOverridden: true },
      lines[1]!,
    ]);
    expect(supersededIds).toEqual([]);
  });
});

describe("area lines stuck at quantity 1", () => {
  const line = {
    id: "floor",
    description: "Hardwood flooring",
    unitKey: "square_foot",
    quantity: 1,
    isQuantityPlaceholder: false,
    quantityReviewedAt: "2026-08-20T11:46:00Z",
    isPriceOverridden: false,
    archivedAt: null,
  };

  it("treats 1 sq ft of floor as a defect, not a decision", () => {
    expect(isDefectiveMeasuredQuantity(line)).toBe(true);
    expect(isDefectiveMeasuredQuantity({ ...line, quantity: 288 })).toBe(false);
    expect(isDefectiveMeasuredQuantity({ ...line, unitKey: "each" })).toBe(false);
  });

  it("repairs it from project geometry", () => {
    const plan = {
      derived: [
        {
          lineId: "floor",
          quantity: 316.8,
          unitKey: "square_foot",
          formula: "16 × 18 = 288 sq ft",
          surfaces: ["floor"],
          provenance: { wastePct: 10 },
        } as never,
      ],
    };
    expect(autoApplicableDerivations(plan, [line] as never).map((d) => d.lineId)).toEqual([
      "floor",
    ]);
  });

  it("still respects an explicit contractor override", () => {
    const plan = {
      derived: [
        {
          lineId: "floor",
          quantity: 316.8,
          unitKey: "square_foot",
          formula: "16 × 18 = 288 sq ft",
          surfaces: ["floor"],
          provenance: { wastePct: 10 },
        } as never,
      ],
    };
    const overridden = { ...line, isPriceOverridden: true };
    expect(autoApplicableDerivations(plan, [overridden] as never)).toEqual([]);
  });
});

/* -------------------------------------------------------------------- *
 * Explicit scope exclusion outranks older review / catalog confirmation.
 * -------------------------------------------------------------------- */
describe("excluded scope wins over historical line review", () => {
  const items = [
    { id: "keep", isIncluded: true },
    { id: "excluded", isIncluded: false },
    { id: "archived", isIncluded: true, archivedAt: "2026-08-09T16:42:20Z" },
  ];

  it("orphans a reviewed AND catalog-confirmed line whose scope is excluded", () => {
    const lines = [
      { id: "cabinets", scopeItemId: "excluded" },
      { id: "kitchenFloor", scopeItemId: "archived" },
      { id: "framing", scopeItemId: "keep" },
    ];
    expect(findOrphanedLineIds(lines, items as never).sort()).toEqual([
      "cabinets",
      "kitchenFloor",
    ]);
  });

  it("never orphans an independent manual line with no scope link", () => {
    const lines = [{ id: "manual", scopeItemId: null }];
    expect(findOrphanedLineIds(lines, items as never)).toEqual([]);
  });
});

/* -------------------------------------------------------------------- *
 * Specific finish material supersedes the generic install line.
 * -------------------------------------------------------------------- */
describe("generic finish-floor supersession is material agnostic", () => {
  for (const material of ["Hardwood Flooring", "LVP flooring", "Porcelain tile floor", "Carpet flooring"]) {
    it(`selects "${material}" over the generic install line`, () => {
      const generic = { id: "generic", description: "Install finished flooring", quantity: 316.8, unitKey: "square_foot" };
      const specific = { id: "specific", description: material, quantity: 1, unitKey: "square_foot" };
      const result = findSupersededLines([generic, specific]);
      expect(result.supersededIds).toEqual(["generic"]);
      expect(result.supersededBy["generic"]).toBe("specific");
      expect(quantityToInherit(specific, generic)).toBe(316.8);
    });
  }

  it("leaves prep, patching and demo lines alone", () => {
    const lines = [
      { id: "generic", description: "Install finished flooring", quantity: 316.8, unitKey: "square_foot" },
      { id: "specific", description: "Hardwood Flooring", quantity: 1, unitKey: "square_foot" },
      { id: "prep", description: "Subfloor prep and leveling", quantity: 288, unitKey: "square_foot" },
      { id: "patch", description: "Floor patching", quantity: 1, unitKey: "each" },
      { id: "demo", description: "Remove flooring", quantity: 288, unitKey: "square_foot" },
    ];
    expect(findSupersededLines(lines).supersededIds).toEqual(["generic"]);
  });

  it("does nothing when two specific materials compete", () => {
    const lines = [
      { id: "generic", description: "Install finished flooring", quantity: 316.8, unitKey: "square_foot" },
      { id: "a", description: "Hardwood Flooring", quantity: 100, unitKey: "square_foot" },
      { id: "b", description: "Tile flooring", quantity: 100, unitKey: "square_foot" },
    ];
    expect(findSupersededLines(lines).supersededIds).toEqual([]);
  });
});
