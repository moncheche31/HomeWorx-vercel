/**
 * GENERAL MATERIALS DERIVATION + CROSS-JOB ISOLATION.
 *
 * Five unrelated jobs are decomposed one after another in the SAME session.
 * Each assertion proves the material components come only from that estimate's
 * own lines, and that nothing from the previous job survived.
 */

import { describe, expect, it } from "vitest";
import {
  ALL_COMPOSITIONS,
  buildLineMaterials,
  buildMaterialsBreakdown,
  type MaterialSourceLine,
} from "@/domains/estimating/materials";

const line = (over: Partial<MaterialSourceLine> & { id: string }): MaterialSourceLine => ({
  description: "work",
  tradeKey: null,
  catalogItemKey: null,
  quantity: 1,
  unitKey: "each",
  materialCost: 0,
  pricingSource: "knowledge_base",
  ...over,
});

const keysOf = (lines: readonly MaterialSourceLine[]) =>
  buildMaterialsBreakdown(lines).lines.flatMap((l) => l.components.map((c) => c.key));

const JOBS: Array<{
  name: string;
  lines: MaterialSourceLine[];
  expect: string[];
  forbid: string[];
}> = [
  {
    name: "Paint a room",
    lines: [
      line({
        id: "paint-walls",
        description: "Paint walls and ceiling",
        tradeKey: "painting",
        quantity: 700,
        unitKey: "square_foot",
        materialCost: 0.85,
      }),
    ],
    expect: ["paint", "primer", "maskingCovering", "applicators", "patchingCaulk"],
    forbid: ["shingles", "cabinetBoxes", "pipeFittings", "lumber"],
  },
  {
    name: "Framing repair",
    lines: [
      line({
        id: "frame-wall",
        description: "Repair rotted wall framing and sheathing",
        tradeKey: "framing",
        quantity: 120,
        unitKey: "square_foot",
        materialCost: 4.2,
      }),
    ],
    expect: ["lumber", "sheathing", "connectors", "fasteners"],
    forbid: ["paint", "shingles", "cabinetBoxes", "fixturesValves"],
  },
  {
    name: "Roof repair",
    lines: [
      line({
        id: "roof",
        description: "Replace shingles on rear slope",
        tradeKey: "roofing",
        quantity: 900,
        unitKey: "square_foot",
        materialCost: 3.1,
      }),
    ],
    expect: ["shingles", "underlayment", "dripEdge", "ridgeVentCap", "roofingNails", "flashing"],
    forbid: ["paint", "lumber", "cabinetBoxes", "pipeFittings"],
  },
  {
    name: "Plumbing fixture",
    lines: [
      line({
        id: "plb",
        description: "Set new toilet",
        tradeKey: "plumbing",
        quantity: 1,
        materialCost: 260,
      }),
    ],
    expect: ["fixturesValves", "pipeFittings", "solderGlueTape", "hangersStraps"],
    forbid: ["paint", "shingles", "lumber", "cabinetBoxes"],
  },
  {
    name: "Cabinet install",
    lines: [
      line({
        id: "cab-base",
        description: "Install base cabinets",
        tradeKey: "cabinetry",
        catalogItemKey: "cabinets.base.install",
        quantity: 7.8,
        unitKey: "linear_foot",
        materialCost: 285,
      }),
    ],
    expect: ["cabinetBoxes", "fillerTrim", "fastenersAdhesive", "shimsCaulk"],
    forbid: ["paint", "shingles", "lumber", "fixturesValves"],
  },
];

describe("general material derivation", () => {
  it("every composition's shares total 1", () => {
    for (const composition of ALL_COMPOSITIONS) {
      const total = composition.components.reduce((a, c) => a + c.share, 0);
      expect(Math.abs(total - 1), composition.id).toBeLessThan(1e-9);
    }
  });

  const seen: string[][] = [];

  for (const job of JOBS) {
    it(`${job.name}: materials come from its own scope only`, () => {
      const keys = keysOf(job.lines);
      seen.push(keys);
      for (const key of job.expect) expect(keys, `${job.name} expects ${key}`).toContain(key);
      for (const key of job.forbid) expect(keys, `${job.name} must not have ${key}`).not.toContain(key);
    });
  }

  it("carries nothing between jobs run in the same session", () => {
    const [paint, framing, roof, plumbing, cabinets] = seen;
    expect(paint).not.toContain("sheathing");
    expect(framing).not.toContain("underlayment");
    expect(roof).not.toContain("cabinetBoxes");
    expect(plumbing).not.toContain("roofingNails");
    expect(cabinets).not.toContain("paint");
  });

  it("component money always reconciles to the line's material total", () => {
    for (const job of JOBS) {
      const breakdown = buildMaterialsBreakdown(job.lines);
      for (const row of breakdown.lines) {
        const sum = row.components.reduce((a, c) => a + c.extendedCost, 0);
        expect(Math.abs(sum - row.materialTotal), row.description).toBeLessThan(0.011);
      }
      expect(breakdown.majorTotal + breakdown.consumableTotal).toBeCloseTo(
        breakdown.materialTotal,
        1,
      );
    }
  });

  it("derives quantities only from standard coverage rates on compatible units", () => {
    const paint = buildLineMaterials(JOBS[0].lines[0]);
    const gallons = paint.components.find((c) => c.key === "paint");
    expect(gallons?.quantity).toBeCloseTo(2, 1);
    expect(gallons?.unitKey).toBe("gallon");
    expect(gallons?.source).toBe("derived");

    /* Same trade, non-area unit: no fabricated gallon count. */
    const touchup = buildLineMaterials(
      line({ id: "t", description: "Paint trim", tradeKey: "painting", quantity: 40, unitKey: "linear_foot", materialCost: 1.2 }),
    );
    expect(touchup.components.find((c) => c.key === "paint")?.quantity).toBeNull();
  });

  it("labor-only work says $0 with a reason instead of omitting materials", () => {
    const laborOnly = buildLineMaterials(
      line({ id: "l", description: "Demo existing cabinets", tradeKey: "demolition", materialCost: 0 }),
    );
    expect(laborOnly.status).toBe("no_material");
    expect(laborOnly.reason).toBe("labor_only");
    expect(laborOnly.materialTotal).toBe(0);
  });

  it("owner-supplied materials are disclosed in labor-only pricing mode", () => {
    const breakdown = buildMaterialsBreakdown(
      [line({ id: "o", description: "Install owner flooring", tradeKey: "flooring", materialCost: 0 })],
      { pricingMode: "labor_only" },
    );
    expect(breakdown.lines[0].reason).toBe("owner_supplied");
  });

  it("unmatched lines are flagged for pricing, never silently $0", () => {
    const unmatched = buildLineMaterials(
      line({ id: "u", description: "Custom stone feature", pricingSource: "unmatched", materialCost: 0 }),
    );
    expect(unmatched.status).toBe("pricing_needed");
    expect(unmatched.components[0].source).toBe("pricing_needed");
  });

  it("contractor overrides are never decomposed or re-derived", () => {
    const override = buildLineMaterials(
      line({
        id: "ov",
        description: "Install base cabinets",
        tradeKey: "cabinetry",
        catalogItemKey: "cabinets.base.install",
        quantity: 10,
        unitKey: "linear_foot",
        materialCost: 400,
        isPriceOverridden: true,
      }),
    );
    expect(override.status).toBe("override");
    expect(override.components).toHaveLength(1);
    expect(override.components[0].source).toBe("override");
    expect(override.components[0].extendedCost).toBe(4000);
  });

  it("major materials are separated from consumables", () => {
    const breakdown = buildMaterialsBreakdown(JOBS[2].lines);
    expect(breakdown.majorComponents.map((c) => c.key)).toContain("shingles");
    expect(breakdown.consumableComponents.map((c) => c.key)).toContain("roofingNails");
    expect(breakdown.majorComponents.map((c) => c.key)).not.toContain("roofingNails");
  });
});
