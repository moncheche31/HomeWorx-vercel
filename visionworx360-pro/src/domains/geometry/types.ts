/**
 * Room Geometry + Quantity Propagation Foundation — contracts.
 *
 * The contractor enters core dimensions ONCE per project (or per room). Every
 * dependent scope line then derives its own quantity from that single record
 * plus explicit assumptions, with a durable formula trail.
 *
 * Pure types only — no React, no Supabase, no i18n, no IO.
 */

/** A door / window / pass-through that removes wall area (and sometimes trim). */
export interface GeometryOpening {
  kind: "door" | "window" | "other";
  /** How many identical openings. */
  count: number;
  widthFt: number;
  heightFt: number;
  /** Door openings interrupt baseboard; windows do not. */
  interruptsTrim?: boolean;
}

/** Everything the contractor confirms once. Nothing here is guessed. */
export interface RoomGeometryInput {
  /** null when the geometry is project-wide rather than a single room. */
  roomId?: string | null;
  label?: string | null;
  lengthFt: number | null;
  widthFt: number | null;
  /** Wall / ceiling height. Missing height blocks every wall-based quantity. */
  ceilingHeightFt: number | null;
  openings: GeometryOpening[];
  /**
   * Added interior partitions, in linear feet. NEVER inferred: perimeter walls
   * and new partitions are different work and are kept separate.
   */
  interiorPartitionLf: number | null;
  /** Flooring waste allowance, percent. Applied only to flooring installs. */
  floorWastePct?: number | null;
  notes?: string | null;
}

/** Canonical measurement keys every dependency rule points at. */
export type MeasurementKey =
  | "floor_area"
  | "ceiling_area"
  | "perimeter"
  | "wall_gross_area"
  | "wall_net_area"
  | "opening_area"
  | "opening_count"
  | "interior_partition_lf"
  | "wall_framing_lf"
  | "trim_lf"
  | "flooring_area_with_waste"
  | "wall_and_ceiling_area";

export type MeasurementUnit = "square_foot" | "linear_foot" | "each";

export interface Measurement {
  key: MeasurementKey;
  value: number;
  unitKey: MeasurementUnit;
  /** Human-readable derivation, e.g. "68 LF × 8 ft = 544 SF". */
  formula: string;
  /** What was subtracted, if anything. */
  deductions?: string | null;
  /** Inputs the contractor still has to supply for this to be usable. */
  missing: (keyof RoomGeometryInput)[];
  /** available = usable now; blocked = a required input is missing. */
  status: "available" | "blocked";
}

export type MeasurementMap = Record<MeasurementKey, Measurement>;

export interface RoomGeometry {
  input: RoomGeometryInput;
  measurements: MeasurementMap;
  /** True when length, width and height are all confirmed. */
  isComplete: boolean;
  /** Inputs still needed anywhere, de-duplicated. */
  missing: (keyof RoomGeometryInput)[];
}

/** Durable provenance written onto a line whose quantity was propagated. */
export interface QuantityProvenance {
  source: "room_geometry";
  measurementKey: MeasurementKey;
  formula: string;
  deductions?: string | null;
  wastePct?: number | null;
  dimensions: { lengthFt: number | null; widthFt: number | null; heightFt: number | null };
  confidence: "confirmed" | "derived";
  geometryLabel?: string | null;
}
