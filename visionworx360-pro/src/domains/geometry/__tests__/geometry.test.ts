/**
 * Room Geometry + Quantity Propagation Foundation.
 *
 * One confirmed set of dimensions must drive every dependent quantity, without
 * ever inventing a partition length, overwriting a contractor decision, or
 * asking for the same measurement twice.
 */
import { describe, expect, it } from "vitest";
import {
  deriveRoomGeometry,
  planQuantityPropagation,
  resolveDependency,
  type LineLike,
  type RoomGeometryInput,
} from "../index";

const base = (over: Partial<RoomGeometryInput> = {}): RoomGeometryInput => ({
  roomId: null,
  lengthFt: 18,
  widthFt: 16,
  ceilingHeightFt: 8,
  openings: [],
  interiorPartitionLf: null,
  floorWastePct: 10,
  ...over,
});

const line = (over: Partial<LineLike> & { id: string; description: string }): LineLike => ({
  unitKey: null,
  quantity: 1,
  isQuantityPlaceholder: true,
  isPriceOverridden: false,
  quantityReviewedAt: null,
  archivedAt: null,
  ...over,
});

describe("geometry derivation", () => {
  it("derives 288 SF floor/ceiling and 68 LF perimeter from 16 × 18", () => {
    const g = deriveRoomGeometry(base());
    expect(g.measurements.floor_area.value).toBe(288);
    expect(g.measurements.ceiling_area.value).toBe(288);
    expect(g.measurements.perimeter.value).toBe(68);
  });

  it("derives 544 SF gross wall area from 68 LF × 8 ft", () => {
    expect(deriveRoomGeometry(base()).measurements.wall_gross_area.value).toBe(544);
  });

  it("deducts doors and windows deterministically", () => {
    const g = deriveRoomGeometry(
      base({
        openings: [
          { kind: "door", count: 1, widthFt: 3, heightFt: 7, interruptsTrim: true },
          { kind: "window", count: 2, widthFt: 3, heightFt: 4 },
        ],
      }),
    );
    expect(g.measurements.opening_area.value).toBe(45);
    expect(g.measurements.wall_net_area.value).toBe(499);
    /* Windows do not interrupt baseboard; the single door does. */
    expect(g.measurements.trim_lf.value).toBe(65);
  });

  it("blocks wall quantities when the ceiling height is missing", () => {
    const g = deriveRoomGeometry(base({ ceilingHeightFt: null }));
    expect(g.measurements.wall_gross_area.status).toBe("blocked");
    expect(g.measurements.floor_area.status).toBe("available");
    expect(g.missing).toEqual(["ceilingHeightFt"]);
    expect(g.isComplete).toBe(false);
  });

  it("never invents an interior partition length", () => {
    const g = deriveRoomGeometry(base());
    expect(g.measurements.interior_partition_lf.status).toBe("blocked");
    /* Wall framing falls back to perimeter only, and says so. */
    expect(g.measurements.wall_framing_lf.value).toBe(68);
    expect(g.measurements.wall_framing_lf.formula).toContain("no interior partitions");
    expect(deriveRoomGeometry(base({ interiorPartitionLf: 12 })).measurements.wall_framing_lf.value)
      .toBe(80);
  });

  it("adds flooring waste exactly once", () => {
    expect(deriveRoomGeometry(base()).measurements.flooring_area_with_waste.value).toBe(316.8);
  });
});

describe("dependency mapping", () => {
  it("maps framing walls to wall framing length, not area", () => {
    const rule = resolveDependency(line({ id: "1", description: "Frame walls to code", unitKey: "linear_foot" }));
    expect(rule?.measurementKey).toBe("wall_framing_lf");
  });

  it("treats genuine decisions as custom work", () => {
    for (const description of [
      "Install cabinets",
      "Extend HVAC to new space",
      "New circuits, outlets, lighting",
      "Template and install countertops",
    ]) {
      expect(resolveDependency(line({ id: "x", description }))).toBeNull();
    }
  });
});

describe("quantity propagation", () => {
  const lines: LineLike[] = [
    line({ id: "floor", description: "Frame an approximately 16' x 18' platform floor", unitKey: "square_foot", quantity: 288, isQuantityPlaceholder: false }),
    line({ id: "walls", description: "Frame walls to code", unitKey: "linear_foot" }),
    line({ id: "insul", description: "Insulate walls, ceiling, floor" }),
    line({ id: "drywall", description: "Hang, tape, finish drywall", unitKey: "square_foot" }),
    line({ id: "paint", description: "Prime and paint walls and ceilings", unitKey: "square_foot" }),
    line({ id: "trim", description: "Install/replace baseboards", unitKey: "linear_foot" }),
    line({ id: "flooring", description: "Install finished flooring", unitKey: "square_foot" }),
    line({ id: "cabinets", description: "Install cabinets", unitKey: "each" }),
  ];

  it("populates flooring, drywall, insulation, trim and framing from one record", () => {
    const plan = planQuantityPropagation({ geometry: base(), lines });
    const byId = Object.fromEntries(plan.derived.map((d) => [d.lineId, d]));
    expect(byId.walls.quantity).toBe(68);
    expect(byId.drywall.quantity).toBe(832); // 544 walls + 288 ceiling
    expect(byId.paint.quantity).toBe(832);
    expect(byId.trim.quantity).toBe(68);
    expect(byId.flooring.quantity).toBe(316.8);
    expect(plan.needsDecision.map((n) => n.lineId)).toContain("cabinets");
  });

  it("expands multi-surface insulation into wall, ceiling and floor quantities", () => {
    const plan = planQuantityPropagation({ geometry: base(), lines });
    const insulation = plan.derived.find((d) => d.lineId === "insul")!;
    expect(insulation.surfaces.map((s) => [s.role, s.quantity])).toEqual([
      ["walls", 544],
      ["ceiling", 288],
      ["floor", 288],
    ]);
  });

  it("does not re-propose a line whose quantity already matches", () => {
    const plan = planQuantityPropagation({ geometry: base(), lines });
    expect(plan.derived.some((d) => d.lineId === "floor")).toBe(false);
  });

  it("asks for the missing height once instead of per line", () => {
    const plan = planQuantityPropagation({ geometry: base({ ceilingHeightFt: null }), lines });
    expect(plan.missingInputs).toEqual(["ceilingHeightFt"]);
    expect(plan.blocked.map((b) => b.lineId).sort()).toEqual(["drywall", "insul", "paint"]);
    /* Floor-based quantities still resolve without the height. */
    expect(plan.derived.map((d) => d.lineId)).toContain("flooring");
  });

  it("never touches contractor-overridden or reviewed lines", () => {
    const plan = planQuantityPropagation({
      geometry: base(),
      lines: [
        line({ id: "trim", description: "Install/replace baseboards", unitKey: "linear_foot", isPriceOverridden: true }),
        line({ id: "paint", description: "Prime and paint walls and ceilings", unitKey: "square_foot", quantity: 900, isQuantityPlaceholder: false, quantityReviewedAt: "2026-01-01T00:00:00Z" }),
      ],
    });
    expect(plan.derived).toHaveLength(0);
    expect(plan.needsDecision.every((n) => n.reason === "protected")).toBe(true);
  });

  it("recalculates dependent quantities when the room changes", () => {
    const plan = planQuantityPropagation({
      geometry: base({ lengthFt: 20, widthFt: 20 }),
      lines,
    });
    const byId = Object.fromEntries(plan.derived.map((d) => [d.lineId, d]));
    expect(byId.walls.quantity).toBe(80);
    expect(byId.flooring.quantity).toBe(440);
  });

  it("records durable provenance for every derived quantity", () => {
    const plan = planQuantityPropagation({ geometry: base(), lines });
    const trim = plan.derived.find((d) => d.lineId === "trim")!;
    expect(trim.provenance.source).toBe("room_geometry");
    expect(trim.provenance.measurementKey).toBe("trim_lf");
    expect(trim.provenance.dimensions).toEqual({ lengthFt: 18, widthFt: 16, heightFt: 8 });
  });
});
