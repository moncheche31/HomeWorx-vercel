/**
 * Dependency map: scope line → geometry measurement.
 *
 * Deterministic keyword rules. A line only auto-derives when its intent is
 * unambiguous AND the derived unit matches the line's unit. Everything else is
 * a genuine contractor decision and keeps the manual path.
 */

import type { MeasurementKey } from "./types";

export interface LineLike {
  id: string;
  description: string | null | undefined;
  unitKey: string | null | undefined;
  categoryKey?: string | null;
  tradeKey?: string | null;
  quantity?: number | null;
  isQuantityPlaceholder?: boolean | null;
  isPriceOverridden?: boolean | null;
  quantityReviewedAt?: string | null;
  archivedAt?: string | null;
}

/** Units that describe an AREA or a LENGTH of work — never a count of one. */
const MEASURED_UNITS = new Set([
  "square_foot",
  "square_feet",
  "sf",
  "square_yard",
  "linear_foot",
  "linear_feet",
  "lf",
  "square_meter",
  "linear_meter",
]);

/**
 * A measured-unit line still carrying a literal quantity of 1 is a defect, not
 * a contractor decision: nobody installs 1 sq ft of floor. Such a line is
 * treated as a placeholder even when it was marked reviewed, so long as the
 * contractor never overrode or hand-priced it.
 */
const nearOne = (v: number) => Math.abs(v - 1) < 0.01;

export function isDefectiveMeasuredQuantity(line: LineLike): boolean {
  const unit = (line.unitKey ?? "").toLowerCase();
  return MEASURED_UNITS.has(unit) && typeof line.quantity === "number" && nearOne(line.quantity);
}

/** One surface of a multi-surface scope line (e.g. insulate walls/ceiling/floor). */
export interface SurfaceSpec {
  /** Stable role key used for i18n and provenance. */
  role: "walls" | "ceiling" | "floor";
  measurementKey: MeasurementKey;
}

export interface DependencyRule {
  id: string;
  /** Any of these must appear in the normalized description. */
  any: RegExp[];
  /** None of these may appear. */
  not?: RegExp[];
  measurementKey?: MeasurementKey;
  /** Multi-surface scope: expands into one line per surface. */
  surfaces?: SurfaceSpec[];
}

const norm = (v: string | null | undefined) =>
  String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Ordered rules — first match wins, so specific rules come before general ones.
 */
export const DEPENDENCY_RULES: DependencyRule[] = [
  {
    id: "insulation.multi",
    any: [/insulat/],
    not: [/only|attic|rim joist|pipe|duct/],
    surfaces: [
      { role: "walls", measurementKey: "wall_net_area" },
      { role: "ceiling", measurementKey: "ceiling_area" },
      { role: "floor", measurementKey: "floor_area" },
    ],
  },
  {
    id: "drywall.walls_and_ceiling",
    any: [/drywall|sheetrock|gypsum|hang, tape/],
    measurementKey: "wall_and_ceiling_area",
  },
  {
    id: "paint.walls_and_ceiling",
    any: [/paint.*(wall|ceiling)|(wall|ceiling).*paint/],
    not: [/trim|baseboard|door|cabinet/],
    measurementKey: "wall_and_ceiling_area",
  },
  {
    id: "trim.baseboard",
    any: [/baseboard|base trim|shoe mould|shoe molding/],
    measurementKey: "trim_lf",
  },
  {
    id: "framing.walls",
    any: [/frame (the )?walls|wall framing|frame walls to code/],
    not: [/platform floor/],
    measurementKey: "wall_framing_lf",
  },
  {
    id: "flooring.install",
    any: [/install.*floor|finished flooring|hardwood flooring|new .*flooring|lay .*floor/],
    not: [/remove|demo|tear/],
    measurementKey: "flooring_area_with_waste",
  },
  {
    id: "flooring.remove",
    any: [/remove .*floor|demo .*floor|tear out .*floor/],
    measurementKey: "floor_area",
  },
  {
    id: "floor.platform",
    any: [/platform floor|subfloor|floor (joist|sheathing)|underlayment/],
    measurementKey: "floor_area",
  },
  {
    id: "ceiling.generic",
    any: [/ceiling/],
    not: [/wall|fan|light/],
    measurementKey: "ceiling_area",
  },
];

const UNIT_FOR: Record<string, "square_foot" | "linear_foot" | "each"> = {
  floor_area: "square_foot",
  ceiling_area: "square_foot",
  wall_gross_area: "square_foot",
  wall_net_area: "square_foot",
  wall_and_ceiling_area: "square_foot",
  flooring_area_with_waste: "square_foot",
  opening_area: "square_foot",
  perimeter: "linear_foot",
  trim_lf: "linear_foot",
  wall_framing_lf: "linear_foot",
  interior_partition_lf: "linear_foot",
  opening_count: "each",
};

export const unitForMeasurement = (key: MeasurementKey) => UNIT_FOR[key];

/** A line's unit accepts a derived measurement when it matches or is unset. */
export function unitAccepts(
  lineUnit: string | null | undefined,
  measurementKey: MeasurementKey,
): boolean {
  const derived = UNIT_FOR[measurementKey];
  if (!derived) return false;
  return lineUnit == null || lineUnit === derived;
}

/** Resolve the geometry dependency for one line, or null for custom work. */
export function resolveDependency(line: LineLike): DependencyRule | null {
  const text = norm(line.description);
  if (!text) return null;
  for (const rule of DEPENDENCY_RULES) {
    if (rule.not?.some((re) => re.test(text))) continue;
    if (!rule.any.some((re) => re.test(text))) continue;
    if (rule.measurementKey && !unitAccepts(line.unitKey, rule.measurementKey)) continue;
    if (rule.surfaces && line.unitKey != null && line.unitKey !== "square_foot") continue;
    return rule;
  }
  return null;
}
