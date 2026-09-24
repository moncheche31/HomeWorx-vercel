/**
 * Composite assembly pricing — the recognized platform floor must price itself
 * from its component library keys, with no free-text search involved.
 */
import { describe, expect, it } from "vitest";
import {
  planCompositeLine,
  previewCompositeAssembly,
  compositeApplyPayload,
  calculateLine,
  round2,
  PLATFORM_FLOOR,
  type CompositeAssemblyRecord,
} from "../index";

/* Effective library records, exactly as seeded in the Knowledge Base. */
const JOIST: CompositeAssemblyRecord = {
  assemblyKey: "framing.floor.joist",
  workItem: "Frame floor joist system",
  unitKey: "square_foot",
  origin: "library",
  defaultLaborHours: 0.035,
  productionRate: 28.57,
  crewSize: 2,
  materialAllowance: 6.5,
  wasteFactor: 0.1,
  defaultOverheadPct: 10,
  suggestedProfitPct: 10,
};
const SUBFLOOR: CompositeAssemblyRecord = {
  assemblyKey: "framing.subfloor.sheathing",
  workItem: "Install subfloor sheathing",
  unitKey: "square_foot",
  origin: "library",
  defaultLaborHours: 0.02,
  productionRate: 50,
  crewSize: 2,
  materialAllowance: 2.4,
  wasteFactor: 0.1,
  defaultOverheadPct: 10,
  suggestedProfitPct: 10,
};

const LIBRARY = new Map([
  [JOIST.assemblyKey, JOIST],
  [SUBFLOOR.assemblyKey, SUBFLOOR],
]);

const CONTEXT = {
  laborRate: 65,
  overheadPct: 10,
  profitPct: 10,
  contingencyPct: 0,
  isTaxable: false,
  taxRatePct: 0,
};

const DESCRIPTION =
  `Frame an approximately 16' x 18' platform floor using 2 x 8 lumber and 3/4" Advantech`;

const build = (lookup: (k: string) => CompositeAssemblyRecord | null, quantity = 288) => {
  const plan = planCompositeLine({ description: DESCRIPTION, quantityOverride: quantity });
  expect(plan).not.toBeNull();
  return previewCompositeAssembly({ plan: plan!, quantity, lookup, context: CONTEXT });
};

describe("recognized platform floor", () => {
  it("recognizes the composite from the contractor's own words", () => {
    const plan = planCompositeLine({ description: DESCRIPTION });
    expect(plan?.composite.key).toBe("composite.floor.platform");
    expect(plan?.quantity).toBe(288);
  });

  it("resolves both component keys directly, without a text search", () => {
    const seen: string[] = [];
    const preview = build((k) => {
      seen.push(k);
      return LIBRARY.get(k) ?? null;
    });
    expect(seen).toEqual(["framing.floor.joist", "framing.subfloor.sheathing"]);
    expect(preview.missingKeys).toEqual([]);
    expect(preview.components.map((c) => c.assemblyKey)).toEqual([
      "framing.floor.joist",
      "framing.subfloor.sheathing",
    ]);
  });

  it("shows a joist row and a subfloor row", () => {
    const preview = build((k) => LIBRARY.get(k) ?? null);
    expect(preview.components.map((c) => c.role)).toEqual(["joists", "subfloor"]);
    expect(preview.components.map((c) => c.workItem)).toEqual([
      "Frame floor joist system",
      "Install subfloor sheathing",
    ]);
  });

  it("applies the 288 SF base quantity exactly once per per-SF component", () => {
    const preview = build((k) => LIBRARY.get(k) ?? null);
    for (const component of preview.components) {
      expect(component.quantity).toBe(288);
      expect(component.unitKey).toBe("square_foot");
    }
    /* Labor hours = quantity × hours per unit. Crew size (2) is NOT a factor. */
    expect(preview.components[0]!.laborHours).toBe(round2(288 * 0.035));
    expect(preview.components[0]!.laborHoursPerUnit).toBe(0.035);
  });

  it("combined total equals the sum of the component canonical totals", () => {
    const preview = build((k) => LIBRARY.get(k) ?? null);
    const expected = [JOIST, SUBFLOOR].map((a) =>
      calculateLine(
        {
          quantity: 288,
          laborHours: round2(288 * a.defaultLaborHours!),
          laborRate: 65,
          materialCost: round2(a.materialAllowance! * (1 + a.wasteFactor!)),
          equipmentCost: 0,
          subcontractorCost: 0,
          otherCost: 0,
          overheadPct: 10,
          profitPct: 10,
          contingencyPct: 0,
          isTaxable: false,
        },
        0,
      ).total,
    );
    expect(preview.totals.total).toBe(round2(expected[0]! + expected[1]!));
    expect(preview.totals.total).toBe(
      round2(preview.components.reduce((s, c) => s + c.totals.total, 0)),
    );
  });

  it("enables apply when both components and the quantity are valid", () => {
    expect(build((k) => LIBRARY.get(k) ?? null).canApply).toBe(true);
  });

  it("disables apply with a specific component when one is missing", () => {
    const preview = build((k) => (k === SUBFLOOR.assemblyKey ? null : LIBRARY.get(k) ?? null));
    expect(preview.canApply).toBe(false);
    expect(preview.missingKeys).toEqual(["framing.subfloor.sheathing"]);
  });

  it("disables apply when there is no usable quantity", () => {
    const preview = build((k) => LIBRARY.get(k) ?? null, 0);
    expect(preview.canApply).toBe(false);
  });

  it("produces a durable apply payload with per-component provenance", () => {
    const payload = compositeApplyPayload(build((k) => LIBRARY.get(k) ?? null));
    expect(payload).toEqual({
      compositeKey: "composite.floor.platform",
      quantity: 288,
      unitKey: "square_foot",
      components: [
        { assemblyKey: "framing.floor.joist", role: "joists", quantityFactor: 1 },
        { assemblyKey: "framing.subfloor.sheathing", role: "subfloor", quantityFactor: 1 },
      ],
    });
    expect(payload.components).toHaveLength(PLATFORM_FLOOR.components.length);
  });

  it("leaves genuinely custom work on the normal search / manual path", () => {
    expect(planCompositeLine({ description: "Install finished flooring" })).toBeNull();
    expect(planCompositeLine({ description: "Insulate walls, ceiling, floor" })).toBeNull();
  });
});
