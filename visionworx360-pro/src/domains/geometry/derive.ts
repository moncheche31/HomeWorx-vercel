/**
 * Deterministic geometry derivation for rectangular residential rooms.
 *
 * Every number is computed from confirmed dimensions and explicit openings.
 * Nothing is invented: a missing height blocks wall quantities instead of
 * assuming 8 ft, and interior partitions are only ever what the contractor
 * entered.
 */

import type {
  GeometryOpening,
  Measurement,
  MeasurementKey,
  MeasurementMap,
  RoomGeometry,
  RoomGeometryInput,
} from "./types";

export const DEFAULT_FLOOR_WASTE_PCT = 10;

/** Common defaults offered by the UI. Never applied silently. */
export const OPENING_PRESETS = {
  door: { widthFt: 3, heightFt: 6.83, interruptsTrim: true },
  window: { widthFt: 3, heightFt: 4, interruptsTrim: false },
} as const;

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const pos = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

export const openingArea = (o: GeometryOpening): number =>
  round2(Math.max(0, o.count) * Math.max(0, o.widthFt) * Math.max(0, o.heightFt));

/** Only door-height openings interrupt baseboard; windows sit above it. */
export const openingTrimWidth = (o: GeometryOpening): number => {
  const interrupts = o.interruptsTrim ?? o.kind === "door";
  return interrupts ? round2(Math.max(0, o.count) * Math.max(0, o.widthFt)) : 0;
};

const blocked = (
  key: MeasurementKey,
  unitKey: Measurement["unitKey"],
  missing: Measurement["missing"],
): Measurement => ({
  key,
  value: 0,
  unitKey,
  formula: "",
  deductions: null,
  missing,
  status: "blocked",
});

const ok = (
  key: MeasurementKey,
  value: number,
  unitKey: Measurement["unitKey"],
  formula: string,
  deductions: string | null = null,
): Measurement => ({
  key,
  value: round2(value),
  unitKey,
  formula,
  deductions,
  missing: [],
  status: "available",
});

/** Build the full measurement map for one geometry record. */
export function deriveRoomGeometry(input: RoomGeometryInput): RoomGeometry {
  const length = pos(input.lengthFt);
  const width = pos(input.widthFt);
  const height = pos(input.ceilingHeightFt);
  const openings = input.openings ?? [];

  const missingPlan: Measurement["missing"] = [];
  if (!length) missingPlan.push("lengthFt");
  if (!width) missingPlan.push("widthFt");

  const planMissing = [...missingPlan];
  const wallMissing: Measurement["missing"] = [...planMissing];
  if (!height) wallMissing.push("ceilingHeightFt");

  const area = length && width ? length * width : 0;
  const perimeter = length && width ? 2 * (length + width) : 0;
  const grossWall = perimeter && height ? perimeter * height : 0;

  const deductArea = round2(openings.reduce((sum, o) => sum + openingArea(o), 0));
  const deductTrim = round2(openings.reduce((sum, o) => sum + openingTrimWidth(o), 0));
  const openingCount = openings.reduce((sum, o) => sum + Math.max(0, o.count), 0);

  const wastePct =
    typeof input.floorWastePct === "number" && Number.isFinite(input.floorWastePct)
      ? Math.max(0, input.floorWastePct)
      : DEFAULT_FLOOR_WASTE_PCT;

  const dims = `${length ?? "?"} ft × ${width ?? "?"} ft`;
  const deductionText = deductArea > 0
    ? `− ${deductArea} SF of openings (${openingCount})`
    : null;

  const measurements: MeasurementMap = {
    floor_area: planMissing.length
      ? blocked("floor_area", "square_foot", planMissing)
      : ok("floor_area", area, "square_foot", dims),

    ceiling_area: planMissing.length
      ? blocked("ceiling_area", "square_foot", planMissing)
      : ok("ceiling_area", area, "square_foot", dims),

    perimeter: planMissing.length
      ? blocked("perimeter", "linear_foot", planMissing)
      : ok("perimeter", perimeter, "linear_foot", `2 × (${length} ft + ${width} ft)`),

    wall_gross_area: wallMissing.length
      ? blocked("wall_gross_area", "square_foot", wallMissing)
      : ok(
          "wall_gross_area",
          grossWall,
          "square_foot",
          `${round2(perimeter)} LF × ${height} ft`,
        ),

    wall_net_area: wallMissing.length
      ? blocked("wall_net_area", "square_foot", wallMissing)
      : ok(
          "wall_net_area",
          Math.max(0, grossWall - deductArea),
          "square_foot",
          `${round2(perimeter)} LF × ${height} ft${deductArea > 0 ? ` − ${deductArea} SF` : ""}`,
          deductionText,
        ),

    wall_and_ceiling_area: wallMissing.length
      ? blocked("wall_and_ceiling_area", "square_foot", wallMissing)
      : ok(
          "wall_and_ceiling_area",
          Math.max(0, grossWall - deductArea) + area,
          "square_foot",
          `walls ${round2(Math.max(0, grossWall - deductArea))} SF + ceiling ${round2(area)} SF`,
          deductionText,
        ),

    opening_area: ok("opening_area", deductArea, "square_foot", `${openingCount} openings`),
    opening_count: ok("opening_count", openingCount, "each", `${openingCount} openings`),

    interior_partition_lf:
      pos(input.interiorPartitionLf) == null
        ? blocked("interior_partition_lf", "linear_foot", ["interiorPartitionLf"])
        : ok(
            "interior_partition_lf",
            input.interiorPartitionLf as number,
            "linear_foot",
            "contractor-entered partition length",
          ),

    /**
     * Perimeter walls plus any partitions the contractor explicitly entered.
     * Partitions are never assumed — with none entered this equals perimeter.
     */
    wall_framing_lf: planMissing.length
      ? blocked("wall_framing_lf", "linear_foot", planMissing)
      : ok(
          "wall_framing_lf",
          perimeter + (pos(input.interiorPartitionLf) ?? 0),
          "linear_foot",
          pos(input.interiorPartitionLf)
            ? `perimeter ${round2(perimeter)} LF + partitions ${input.interiorPartitionLf} LF`
            : `perimeter ${round2(perimeter)} LF (no interior partitions entered)`,
        ),

    trim_lf: planMissing.length
      ? blocked("trim_lf", "linear_foot", planMissing)
      : ok(
          "trim_lf",
          Math.max(0, perimeter - deductTrim),
          "linear_foot",
          `perimeter ${round2(perimeter)} LF${deductTrim > 0 ? ` − ${deductTrim} LF of door openings` : ""}`,
          deductTrim > 0 ? `− ${deductTrim} LF at door openings` : null,
        ),

    flooring_area_with_waste: planMissing.length
      ? blocked("flooring_area_with_waste", "square_foot", planMissing)
      : ok(
          "flooring_area_with_waste",
          area * (1 + wastePct / 100),
          "square_foot",
          `${round2(area)} SF + ${wastePct}% waste`,
        ),
  };

  const missing = [
    ...new Set(
      Object.values(measurements).flatMap((m) =>
        m.key === "interior_partition_lf" ? [] : m.missing,
      ),
    ),
  ];

  return {
    input,
    measurements,
    isComplete: Boolean(length && width && height),
    missing,
  };
}
