/**
 * Evidence-first quantity engine — cross-trade regression matrix.
 *
 * Proves the universal rules the estimator now depends on:
 *   1. A quantity is only ever produced from semantically valid evidence.
 *   2. Localized work (repairs, patches, blending) and confined areas
 *      (shower, backsplash, niche) NEVER inherit project-wide geometry.
 *   3. Contractor-confirmed and task-specific measurements always win.
 *   4. Broad composite wording decomposes into independently measured tasks.
 *   5. The plausibility gate catches a project-surface number on a task that
 *      could not physically cover it.
 */

import { describe, expect, it } from "vitest";

import {
  checkQuantityPlausibility,
  classifyQuantityScope,
  decomposeCompositeTask,
  resolveQuantity,
} from "@/domains/estimating/quantityEvidence";

/** One measured room: 15.5' x 18', 8' ceilings. */
const GEOMETRY = {
  floorArea: 279,
  floorAreaWithWaste: 306.9,
  ceilingArea: 279,
  wallArea: 1039.02,
  partitionLf: 62,
  trimLf: 62,
  structuralSpanLf: 15.5,
} as const;


interface Row {
  trade: string;
  description: string;
  unitKey: string;
  expect: "resolved" | "unresolved";
  quantity?: number;
}

/* 14 trades / task types across the residential remodeling catalog. */
const MATRIX: Row[] = [
  { trade: "flooring", description: "Hardwood flooring", unitKey: "square_foot", expect: "resolved", quantity: 306.9 },
  { trade: "flooring", description: "Floor patching", unitKey: "square_foot", expect: "unresolved" },
  { trade: "drywall", description: "Hang, tape, finish drywall", unitKey: "square_foot", expect: "resolved", quantity: 1039.02 },
  { trade: "drywall", description: "Drywall repair", unitKey: "square_foot", expect: "unresolved" },
  { trade: "painting", description: "Prime and paint walls and ceilings", unitKey: "square_foot", expect: "resolved", quantity: 1039.02 },
  { trade: "painting", description: "Paint blending at patched areas", unitKey: "square_foot", expect: "unresolved" },
  { trade: "tile", description: "Shower tile", unitKey: "square_foot", expect: "unresolved" },
  { trade: "tile", description: "Kitchen backsplash tile", unitKey: "square_foot", expect: "unresolved" },
  { trade: "insulation", description: "Insulate walls", unitKey: "square_foot", expect: "resolved", quantity: 1039.02 },
  { trade: "trim", description: "Install/replace baseboards", unitKey: "linear_foot", expect: "resolved", quantity: 62 },
  { trade: "framing", description: "Frame walls to code", unitKey: "linear_foot", expect: "resolved", quantity: 62 },
  { trade: "structural", description: "LVL beam and posts", unitKey: "linear_foot", expect: "resolved", quantity: 15.5 },
  { trade: "electrical", description: "New circuits, outlets, lighting", unitKey: "each", expect: "unresolved" },
  { trade: "plumbing", description: "Comfort-height toilet", unitKey: "each", expect: "unresolved" },
];

describe("evidence-first quantity matrix", () => {
  for (const row of MATRIX) {
    it(`${row.trade}: ${row.description} → ${row.expect}`, () => {
      const result = resolveQuantity({
        description: row.description,
        unitKey: row.unitKey,
        projectGeometry: GEOMETRY,
      });
      expect(result.status).toBe(row.expect);
      if (result.status === "resolved" && row.quantity != null) {
        expect(result.quantity).toBe(row.quantity);
      }
    });
  }

  it("never returns a project-wide surface for localized or confined work", () => {
    const projectValues = Object.values(GEOMETRY) as number[];
    for (const row of MATRIX) {
      const scope = classifyQuantityScope(row.description);
      if (scope === "whole_surface") continue;
      const result = resolveQuantity({
        description: row.description,
        unitKey: row.unitKey,
        projectGeometry: GEOMETRY,
      });
      expect(result.status).toBe("unresolved");
      if (result.status === "resolved") {
        expect(projectValues).not.toContain((result as { quantity: number }).quantity);
      }
    }
  });
});

describe("evidence precedence", () => {
  it("contractor confirmation outranks every derivation", () => {
    const result = resolveQuantity({
      description: "Drywall repair",
      unitKey: "square_foot",
      contractorQuantity: 48,
      projectGeometry: GEOMETRY,
    });
    expect(result).toMatchObject({ status: "resolved", quantity: 48, basis: "contractor_confirmed" });
  });

  it("a measurement captured for THIS task resolves confined work", () => {
    const result = resolveQuantity({
      description: "Shower tile",
      unitKey: "square_foot",
      specificMeasurement: { value: 92, label: "Shower walls" },
      projectGeometry: GEOMETRY,
    });
    expect(result).toMatchObject({ status: "resolved", quantity: 92, basis: "specific_measurement" });
  });

  it("stays unresolved when no geometry has been captured at all", () => {
    const result = resolveQuantity({
      description: "Prime and paint walls and ceilings",
      unitKey: "square_foot",
      projectGeometry: null,
    });
    expect(result.status).toBe("unresolved");
  });

  it("marks an engineered span as assumed, not measured", () => {
    const result = resolveQuantity({
      description: "LVL beam and posts",
      unitKey: "linear_foot",
      projectGeometry: GEOMETRY,
    });
    expect(result).toMatchObject({ status: "resolved", basis: "assumed" });
  });
});

describe("composite decomposition", () => {
  it("splits shutoffs and supply lines into independently measured tasks", () => {
    const parts = decomposeCompositeTask("Install new shutoffs and supply lines");
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.every((p) => p.needsQuantity)).toBe(true);
  });

  it("leaves a single-task description alone", () => {
    expect(decomposeCompositeTask("Hardwood flooring")).toEqual([]);
  });
});

describe("plausibility gate", () => {
  it("flags a repair priced against the whole wall area", () => {
    const finding = checkQuantityPlausibility({
      description: "Drywall repair",
      unitKey: "square_foot",
      quantity: 1039.02,
      quantityBasis: "assumed",
      projectGeometry: GEOMETRY,
    });
    expect(finding?.code).toBe("localized_uses_project_surface");
  });

  it("flags shower tile priced against the room floor", () => {
    const finding = checkQuantityPlausibility({
      description: "Shower tile",
      unitKey: "square_foot",
      quantity: 279,
      quantityBasis: "geometry_derived",
      projectGeometry: GEOMETRY,
    });
    expect(finding?.code).toBe("confined_uses_project_surface");
  });

  it("does not flag a whole-surface task on the matching surface", () => {
    expect(
      checkQuantityPlausibility({
        description: "Prime and paint walls and ceilings",
        unitKey: "square_foot",
        quantity: 1039.02,
        quantityBasis: "geometry_derived",
        projectGeometry: GEOMETRY,
      }),
    ).toBeNull();
  });

  it("does not flag a contractor-measured confined area", () => {
    expect(
      checkQuantityPlausibility({
        description: "Shower tile",
        unitKey: "square_foot",
        quantity: 92,
        quantityBasis: "specific_measurement",
        projectGeometry: GEOMETRY,
      }),
    ).toBeNull();
  });
});
