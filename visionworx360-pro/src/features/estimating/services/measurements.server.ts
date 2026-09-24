/**
 * Server-only helpers for project measurements. Kept out of the server
 * function module so those files stay thin wrappers.
 */
import type { GeometryOpening } from "@/domains/geometry";
import type { ProjectMeasurementDTO } from "../measurementTypes";

export type { ProjectMeasurementDTO };

type Row = Record<string, unknown>;

const numOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function mapMeasurement(row: Row): ProjectMeasurementDTO {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    roomId: (row.room_id as string | null) ?? null,
    label: (row.label as string | null) ?? null,
    lengthFt: numOrNull(row.length_ft),
    widthFt: numOrNull(row.width_ft),
    ceilingHeightFt: numOrNull(row.ceiling_height_ft),
    openings: Array.isArray(row.openings) ? (row.openings as GeometryOpening[]) : [],
    interiorPartitionLf: numOrNull(row.interior_partition_lf),
    floorWastePct: numOrNull(row.floor_waste_pct),
    notes: (row.notes as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    unconfirmedFields: Array.isArray(row.unconfirmed_fields)
      ? (row.unconfirmed_fields as string[])
      : [],
    quantitiesStaleAt: (row.quantities_stale_at as string | null) ?? null,
    quantitiesStaleReason: (row.quantities_stale_reason as string | null) ?? null,
    updatedAt: row.updated_at as string,
  };
}

/** Shape one propagation assignment for the SQL contract. */
export function toSqlAssignment(a: {
  lineId: string;
  quantity: number;
  unitKey?: string | null;
  description?: string | null;
  provenance?: Record<string, unknown>;
  expansions?: {
    role: string;
    description: string;
    quantity: number;
    unitKey?: string | null;
    provenance?: Record<string, unknown>;
  }[];
}) {
  return {
    line_id: a.lineId,
    quantity: a.quantity,
    unit_key: a.unitKey ?? null,
    description: a.description ?? null,
    provenance: a.provenance ?? {},
    expansions: (a.expansions ?? []).map((e) => ({
      role: e.role,
      description: e.description,
      quantity: e.quantity,
      unit_key: e.unitKey ?? null,
      provenance: e.provenance ?? {},
    })),
  };
}
