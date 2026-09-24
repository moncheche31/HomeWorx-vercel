/**
 * Quantity propagation: one geometry record → every dependent line.
 *
 * Rules that protect the contractor:
 *  - a line the contractor already reviewed or overrode is never touched;
 *  - a line whose quantity is already correct is not re-proposed;
 *  - a blocked measurement (missing height) reports what is needed instead of
 *    guessing;
 *  - multi-surface scope expands into explicit per-surface quantities.
 */

import { deriveRoomGeometry } from "./derive";
import { isDefectiveMeasuredQuantity, resolveDependency, unitForMeasurement, type LineLike } from "./dependencies";
import type {
  MeasurementKey,
  QuantityProvenance,
  RoomGeometry,
  RoomGeometryInput,
} from "./types";

export interface DerivedSurface {
  role: "walls" | "ceiling" | "floor" | "primary";
  measurementKey: MeasurementKey;
  quantity: number;
  unitKey: "square_foot" | "linear_foot" | "each";
  formula: string;
  deductions?: string | null;
}

export interface DerivedLineQuantity {
  lineId: string;
  description: string;
  /** Quantity for the original line (first surface for multi-surface scope). */
  quantity: number;
  unitKey: "square_foot" | "linear_foot" | "each";
  measurementKey: MeasurementKey;
  formula: string;
  deductions?: string | null;
  ruleId: string;
  /** Present when the line expands into several surfaces. */
  surfaces: DerivedSurface[];
  provenance: QuantityProvenance;
}

export interface BlockedLineQuantity {
  lineId: string;
  description: string;
  ruleId: string;
  measurementKeys: MeasurementKey[];
  missing: (keyof RoomGeometryInput)[];
}

export interface PropagationPlan {
  geometry: RoomGeometry;
  /** Lines that can be filled in right now. */
  derived: DerivedLineQuantity[];
  /** Lines whose geometry source exists but needs a missing input first. */
  blocked: BlockedLineQuantity[];
  /** Lines that are genuine contractor decisions or custom work. */
  needsDecision: { lineId: string; description: string; reason: "custom" | "protected" }[];
  /** Distinct inputs the contractor must supply to unblock everything. */
  missingInputs: (keyof RoomGeometryInput)[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

function provenanceFor(
  geometry: RoomGeometry,
  measurementKey: MeasurementKey,
  formula: string,
  deductions: string | null | undefined,
): QuantityProvenance {
  return {
    source: "room_geometry",
    measurementKey,
    formula,
    deductions: deductions ?? null,
    wastePct:
      measurementKey === "flooring_area_with_waste"
        ? geometry.input.floorWastePct ?? 10
        : null,
    dimensions: {
      lengthFt: geometry.input.lengthFt,
      widthFt: geometry.input.widthFt,
      heightFt: geometry.input.ceilingHeightFt,
    },
    confidence: "derived",
    geometryLabel: geometry.input.label ?? null,
  };
}

/**
 * Plan quantity propagation across an estimate.
 *
 * `lines` should already be the active (non-archived) lines of one estimate.
 */
export function planQuantityPropagation(args: {
  geometry: RoomGeometryInput | RoomGeometry;
  lines: LineLike[];
}): PropagationPlan {
  const geometry =
    "measurements" in args.geometry
      ? (args.geometry as RoomGeometry)
      : deriveRoomGeometry(args.geometry as RoomGeometryInput);

  const derived: DerivedLineQuantity[] = [];
  const blocked: BlockedLineQuantity[] = [];
  const needsDecision: PropagationPlan["needsDecision"] = [];

  for (const line of args.lines) {
    if (line.archivedAt) continue;

    const rule = resolveDependency(line);
    if (!rule) {
      needsDecision.push({
        lineId: line.id,
        description: line.description ?? "",
        reason: "custom",
      });
      continue;
    }

    /*
     * Contractor authority always wins over propagation — except for a
     * measured-unit line still carrying a literal `1`, which is a defect
     * (nobody installs 1 sq ft of floor) rather than a decision.
     */
    const protectedLine =
      Boolean(line.isPriceOverridden) ||
      (Boolean(line.quantityReviewedAt) &&
        !line.isQuantityPlaceholder &&
        !isDefectiveMeasuredQuantity(line));
    if (protectedLine) {
      needsDecision.push({
        lineId: line.id,
        description: line.description ?? "",
        reason: "protected",
      });
      continue;
    }

    const specs = rule.surfaces
      ? rule.surfaces.map((s) => ({ role: s.role, key: s.measurementKey }))
      : [{ role: "primary" as const, key: rule.measurementKey as MeasurementKey }];

    const unavailable = specs.filter(
      (s) => geometry.measurements[s.key].status !== "available",
    );
    if (unavailable.length > 0) {
      blocked.push({
        lineId: line.id,
        description: line.description ?? "",
        ruleId: rule.id,
        measurementKeys: unavailable.map((s) => s.key),
        missing: [
          ...new Set(unavailable.flatMap((s) => geometry.measurements[s.key].missing)),
        ],
      });
      continue;
    }

    const surfaces: DerivedSurface[] = specs.map((s) => {
      const m = geometry.measurements[s.key];
      return {
        role: s.role,
        measurementKey: s.key,
        quantity: round2(m.value),
        unitKey: unitForMeasurement(s.key),
        formula: m.formula,
        deductions: m.deductions ?? null,
      };
    });

    const head = surfaces[0];
    /* Already correct and already reviewed: nothing to propose. */
    if (
      surfaces.length === 1 &&
      !line.isQuantityPlaceholder &&
      typeof line.quantity === "number" &&
      near(line.quantity, head.quantity) &&
      line.unitKey === head.unitKey
    ) {
      continue;
    }

    derived.push({
      lineId: line.id,
      description: line.description ?? "",
      quantity: head.quantity,
      unitKey: head.unitKey,
      measurementKey: head.measurementKey,
      formula: head.formula,
      deductions: head.deductions,
      ruleId: rule.id,
      surfaces,
      provenance: provenanceFor(geometry, head.measurementKey, head.formula, head.deductions),
    });
  }

  const missingInputs = [...new Set(blocked.flatMap((b) => b.missing))];
  return { geometry, derived, blocked, needsDecision, missingInputs };
}
