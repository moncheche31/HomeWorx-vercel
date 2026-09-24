import { describe, expect, it } from "vitest";

import {
  companyDefaultStrategy,
  resolvePricingProvenance,
  strategiesEqual,
} from "@/domains/estimating/pricingProvenance";
import { normalizePricingStrategy } from "@/domains/estimating/pricingStrategy";
import { autoApplicableDerivations, planQuantityPropagation } from "@/domains/geometry";
import type { LineLike } from "@/domains/geometry/dependencies";
import { buildCurrentProjectScopeContext } from "@/domains/workScope";
import { QUICK_BALLPARK_SCHEMA } from "@/domains/ballpark";

const COMPANY = normalizePricingStrategy({
  method: "target_gross_margin",
  targetGrossMarginPct: 40,
});

const LEGACY = normalizePricingStrategy({
  method: "overhead_profit",
  overheadPct: 10,
  profitPct: 10,
});

describe("pricing settings inheritance", () => {
  it("a new estimate created from company defaults reads as the company default", () => {
    const provenance = resolvePricingProvenance(companyDefaultStrategy(COMPANY), COMPANY);
    expect(provenance.source).toBe("company_default");
    expect(provenance.matchesCompanyDefault).toBe(true);
    expect(provenance.estimate.targetGrossMarginPct).toBe(40);
  });

  it("an existing 10/10 estimate keeps its own method and is labelled an override", () => {
    const provenance = resolvePricingProvenance(LEGACY, COMPANY);
    expect(provenance.estimate.method).toBe("overhead_profit");
    expect(provenance.estimate.overheadPct).toBe(10);
    expect(provenance.source).toBe("estimate_override");
    expect(provenance.methodDiffers).toBe(true);
  });

  it("applying company defaults is an explicit, complete switch", () => {
    const applied = companyDefaultStrategy(COMPANY);
    expect(strategiesEqual(applied, COMPANY)).toBe(true);
    expect(resolvePricingProvenance(applied, COMPANY).source).toBe("company_default");
  });

  it("never reports a stacked method: only the active method's inputs compare", () => {
    const a = normalizePricingStrategy({
      method: "target_gross_margin",
      targetGrossMarginPct: 40,
      overheadPct: 99,
      profitPct: 99,
    });
    expect(strategiesEqual(a, COMPANY)).toBe(true);
  });
});

describe("garage conversion — scope isolation", () => {
  const garageScope = (over: Partial<{ narrativeText: string | null }> = {}) =>
    buildCurrentProjectScopeContext(
      {
        projectId: "garage-1",
        scopeItems: [
          {
            id: "s1",
            key: "framing.partition",
            title: "Frame interior partition walls",
            tradeKey: "framing",
            categoryKey: "framing",
            description: "Frame new partition walls in the garage",
            quantity: 20,
            unitKey: "linear_foot",
          },
          {
            id: "s2",
            key: "flooring.install",
            title: "Install flooring",
            tradeKey: "flooring",
            categoryKey: "flooring",
            description: "New finished flooring in converted garage, mid grade",
            quantity: null,
            unitKey: "square_foot",
          },
        ],
        narrativeText:
          over.narrativeText ??
          "Convert the garage to a bedroom. Mid grade finishes, counter height storage bench.",
      },
      QUICK_BALLPARK_SCHEMA,
    );

  it("cannot gain kitchen work that is not in the current scope", () => {
    const ctx = garageScope();
    expect(ctx.domains).not.toContain("cabinets");
    expect(ctx.domains).not.toContain("countertops");
    expect(ctx.domains).not.toContain("appliances");
  });

  it("'mid grade' does not activate sitework and 'counter height' does not activate countertops", () => {
    const ctx = garageScope({
      narrativeText: "Mid grade materials throughout, counter height bench at the wall.",
    });
    expect(ctx.domains).not.toContain("sitework");
    expect(ctx.domains).not.toContain("countertops");
  });

  it("a second project at the same address starts from its own evidence only", () => {
    const kitchen = buildCurrentProjectScopeContext(
      {
        projectId: "kitchen-1",
        scopeItems: [
          {
            id: "k1",
            key: "cabinetry.install",
            title: "Install kitchen cabinets",
            tradeKey: "cabinetry",
            categoryKey: "cabinetry",
            description: "Install base and upper kitchen cabinets",
            quantity: 24,
            unitKey: "linear_foot",
          },
        ],
        narrativeText: null,
      },
      QUICK_BALLPARK_SCHEMA,
    );
    const garage = garageScope();
    expect(kitchen.domains).toContain("cabinets");
    expect(garage.domains).not.toContain("cabinets");
    expect(garage.projectId).toBe("garage-1");
  });
});

describe("garage conversion — flooring quantity", () => {
  const geometry = {
    roomId: null,
    label: "Garage",
    lengthFt: 18,
    widthFt: 16,
    ceilingHeightFt: 12,
    openings: [],
    interiorPartitionLf: 20,
    floorWastePct: 10,
  };

  const flooringLine: LineLike = {
    id: "line-floor",
    description: "Install flooring",
    unitKey: "square_foot",
    categoryKey: "flooring",
    tradeKey: "flooring",
    quantity: 1,
    isQuantityPlaceholder: true,
    isPriceOverridden: false,
    quantityReviewedAt: null,
    archivedAt: null,
  };

  it("derives finished floor area plus the explicit waste rule, not wall area", () => {
    const plan = planQuantityPropagation({ geometry, lines: [flooringLine] });
    const floor = plan.derived.find((d) => d.lineId === "line-floor");
    expect(floor).toBeTruthy();
    /* 18 x 16 = 288 sq ft, +10% waste = 316.8 sq ft. */
    expect(floor?.quantity).toBeCloseTo(316.8, 1);
    expect(floor?.unitKey).toBe("square_foot");
    expect(floor?.formula).toContain("288");
    expect(floor?.provenance.wastePct).toBe(10);
  });

  it("auto-applies only to placeholder lines and never to contractor decisions", () => {
    const overridden: LineLike = {
      ...flooringLine,
      id: "line-override",
      isPriceOverridden: true,
    };
    /* A reviewed line carrying a REAL measured quantity is a decision. */
    const reviewed: LineLike = {
      ...flooringLine,
      id: "line-reviewed",
      quantity: 250,
      isQuantityPlaceholder: false,
      quantityReviewedAt: new Date().toISOString(),
    };
    /* A reviewed line still stuck at 1 sq ft is a defect, and is repaired. */
    const defective: LineLike = {
      ...flooringLine,
      id: "line-defective",
      isQuantityPlaceholder: false,
      quantityReviewedAt: new Date().toISOString(),
    };
    const lines = [flooringLine, overridden, reviewed, defective];
    const plan = planQuantityPropagation({ geometry, lines });
    const auto = autoApplicableDerivations(plan, lines).map((d) => d.lineId);
    expect(auto).toContain("line-floor");
    expect(auto).toContain("line-defective");
    expect(auto).not.toContain("line-override");
    expect(auto).not.toContain("line-reviewed");
  });

});
