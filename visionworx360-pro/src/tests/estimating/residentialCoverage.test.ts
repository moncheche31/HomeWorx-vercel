/**
 * Residential Catalog V2 — accuracy and coverage harness.
 *
 * Two guarantees, checked against realistic remodeling scopes:
 *
 * 1. COVERAGE — a ballpark must never stall. Every line in a representative
 *    residential scope resolves to real money through a measured quantity, a
 *    derived quantity or a disclosed standard allowance.
 * 2. INTEGRITY — the money that comes out is ordered and explainable: tiers
 *    move material only, allowances are disclosed, and a size is never priced
 *    as a count.
 *
 * The bands themselves are sample data, so this asserts SHAPE and ORDERING,
 * not exact dollars.
 */

import { describe, expect, it } from "vitest";
import {
  planForTitle,
  resolveBallparkScope,
  type BallparkGeometryFacts,
} from "@/domains/ballpark/quantityResolution";
import {
  SAMPLE_PRICEBOOK,
  isTierSensitive,
  normalizeFinishTier,
  withFinishTier,
} from "@/domains/ballpark/pricebook";
import { recalculateBallparkFromScope } from "@/domains/ballpark/scopeRecalc";

const geometry = (over: Partial<BallparkGeometryFacts> = {}): BallparkGeometryFacts =>
  ({
    lengthFt: 18,
    widthFt: 14,
    ceilingHeightFt: 9,
    floorAreaSf: 252,
    ceilingAreaSf: 252,
    wallNetAreaSf: 520,
    drywallSurfaceSf: 772,
    flooringWithWasteSf: 277,
    trimLf: 64,
    partitionLf: 64,
    perimeterLf: 64,
    ...over,
  }) as BallparkGeometryFacts;

const scope = (titles: string[]) =>
  titles.map((title, index) => ({
    id: `item-${index}`,
    title,
    quantity: null,
    unitKey: null,
    isIncluded: true,
  }));

/* ------------------------------------------------------------------ *
 * Regression scenarios
 * ------------------------------------------------------------------ */

const SCENARIOS: Array<{ name: string; titles: string[] }> = [
  {
    name: "full bathroom remodel",
    titles: [
      "Pull permits for the bathroom remodel",
      "Protect existing floors and set dust containment",
      "Gut the bathroom down to studs",
      "Remove existing flooring",
      "Rough-in plumbing for the new layout",
      "Install bath exhaust fan vented to exterior",
      "Add GFCI protection at the vanity circuit",
      "Waterproof the shower pan and wet walls",
      "Tile the shower walls",
      "Install porcelain tile flooring",
      "Set the vanity and vanity light",
      "Install toilet",
      "Install frameless shower door",
      "Install bath accessories",
      "Hang and finish drywall",
      "Paint walls and ceiling",
      "Install baseboard trim",
      "Order dumpster and haul debris",
      "Final clean",
    ],
  },
  {
    name: "kitchen remodel",
    titles: [
      "Building permit for the kitchen",
      "Remove existing cabinets",
      "Remove existing flooring",
      "Install new kitchen cabinets",
      "Install quartz countertops",
      "Install tile backsplash",
      "Install kitchen sink and faucet",
      "Install range hood",
      "Install appliances",
      "Add dedicated circuits for the appliances",
      "Install recessed lighting",
      "Install luxury vinyl plank flooring",
      "Paint walls and ceiling",
      "Final clean",
    ],
  },
  {
    name: "basement finish",
    titles: [
      "Building permit and inspections",
      "Frame interior partition walls",
      "Insulate walls and ceiling",
      "Hang and finish drywall",
      "Install recessed lighting",
      "Install outlets and switches",
      "Extend HVAC ductwork to the new space",
      "Install carpet",
      "Install baseboard trim",
      "Paint walls and ceiling",
      "Build stairs to code",
      "Install egress window",
      "Order dumpster and haul debris",
    ],
  },
  {
    name: "garage conversion to master suite",
    titles: [
      "Pull permits",
      "Frame walls to code",
      "Build platform floor over the slab",
      "Insulate walls, ceiling and floor",
      "Hang and finish drywall",
      "Install LVL header at the new opening",
      "Install recessed lighting",
      "Install outlets and switches",
      "Install mini-split system",
      "Install engineered hardwood flooring",
      "Install baseboard trim",
      "Paint walls and ceiling",
      "Install interior doors",
      "Install closet shelving",
      "Install transition strips and thresholds",
    ],
  },
  {
    name: "exterior envelope",
    titles: [
      "Replace roofing shingles",
      "Install new gutters and downspouts",
      "Replace siding",
      "Replace soffit and fascia",
      "Exterior paint",
      "Replace windows",
      "Install new entry door",
      "Replace garage door",
    ],
  },
  {
    name: "outdoor living",
    titles: [
      "Build deck off the rear of the house",
      "Install deck railing",
      "Pour concrete patio",
      "Install fence along the property line",
      "Install hose bib at the deck",
    ],
  },
  {
    name: "aging in place and restoration",
    titles: [
      "Water damage mitigation in the hallway",
      "Patch drywall in the hallway",
      "Texture to match existing",
      "Install grab bars in the shower",
      "Convert to a curbless roll-in shower",
      "Build accessibility ramp at the side entry",
      "Replace water heater",
      "Install smoke detectors",
    ],
  },
];

describe("Residential Catalog V2 — coverage", () => {
  for (const scenario of SCENARIOS) {
    it(`prices every line of a ${scenario.name}`, () => {
      const items = scope(scenario.titles);
      const { unresolved } = resolveBallparkScope(
        items.map(({ id, title, quantity, unitKey }) => ({ id, title, quantity, unitKey })),
        { geometry: geometry() },
      );
      expect(unresolved.map((u) => `${u.title} (${u.reason})`)).toEqual([]);
    });

    it(`produces an ordered band for a ${scenario.name}`, () => {
      const result = recalculateBallparkFromScope(scope(scenario.titles), {
        geometry: geometry(),
      });
      expect(result).not.toBeNull();
      const band = result!.band;
      expect(band.low).toBeGreaterThan(0);
      expect(band.low).toBeLessThanOrEqual(band.expected);
      expect(band.expected).toBeLessThanOrEqual(band.high);
      /* Ballpark mode completes: no line is left as a blocker. */
      expect(result!.unpriceable).toEqual([]);
      /* Everything the engine assumed on the contractor's behalf is disclosed. */
      expect(result!.assumptions.length).toBe(result!.pricedCount);
    });
  }
});

describe("Residential Catalog V2 — finish tiers", () => {
  const titles = SCENARIOS[1]!.titles;

  const bandFor = (tier: string) =>
    recalculateBallparkFromScope(scope(titles), { geometry: geometry(), finishTier: tier })!.band;

  it("orders value below standard below premium", () => {
    const value = bandFor("value");
    const standard = bandFor("standard");
    const premium = bandFor("premium");
    expect(value.expected).toBeLessThan(standard.expected);
    expect(standard.expected).toBeLessThan(premium.expected);
  });

  it("moves material money only, never permits or demolition", () => {
    const premium = withFinishTier(SAMPLE_PRICEBOOK, "premium");
    expect(premium.get("permits.allowance")!.materialCostPerUnit).toBe(
      SAMPLE_PRICEBOOK.get("permits.allowance")!.materialCostPerUnit,
    );
    expect(premium.get("demolition.flooring")!.materialCostPerUnit).toBe(
      SAMPLE_PRICEBOOK.get("demolition.flooring")!.materialCostPerUnit,
    );
    expect(premium.get("kitchen.countertop")!.materialCostPerUnit).toBeGreaterThan(
      SAMPLE_PRICEBOOK.get("kitchen.countertop")!.materialCostPerUnit,
    );
    /* Labor hours never move with the tier. */
    expect(premium.get("kitchen.countertop")!.laborHoursPerUnit).toBe(
      SAMPLE_PRICEBOOK.get("kitchen.countertop")!.laborHoursPerUnit,
    );
  });

  it("normalizes contractor-facing tier wording", () => {
    expect(normalizeFinishTier("builder")).toBe("value");
    expect(normalizeFinishTier("basic")).toBe("value");
    expect(normalizeFinishTier("luxury")).toBe("premium");
    expect(normalizeFinishTier(null)).toBe("standard");
    expect(isTierSensitive("permits.allowance")).toBe(false);
    expect(isTierSensitive("tile.backsplash")).toBe(true);
  });
});

describe("Residential Catalog V2 — mapping integrity", () => {
  it("every planned item key exists in the pricebook", () => {
    const titles = SCENARIOS.flatMap((s) => s.titles);
    const missing: string[] = [];
    for (const title of titles) {
      const plan = planForTitle(title);
      if (!plan) continue;
      for (const part of plan.parts) {
        if (!SAMPLE_PRICEBOOK.get(part.itemKey)) missing.push(`${title} → ${part.itemKey}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("reads a shower tile line as waterproofing plus tile, not a fixture", () => {
    const plan = planForTitle("Waterproof the shower pan and wet walls");
    expect(plan?.family).toBe("tile.shower");
    expect(plan?.parts.map((p) => p.itemKey)).toEqual(["bath.waterproofing", "tile.wall"]);
  });

  it("reads drywall repair as a patch, not a full hang", () => {
    expect(planForTitle("Patch drywall in the hallway")?.parts[0]?.itemKey).toBe("drywall.patch");
  });

  it("still refuses to read a size as a count", () => {
    const { resolved, unresolved } = resolveBallparkScope(
      [{ id: "a", title: 'Vanity 60" double sink', quantity: null, unitKey: null }],
      { geometry: geometry() },
    );
    expect(unresolved).toEqual([]);
    /* 60 is an inch dimension, not sixty vanities. */
    expect(resolved[0]?.parts[0]?.quantity).toBe(1);
  });
});
