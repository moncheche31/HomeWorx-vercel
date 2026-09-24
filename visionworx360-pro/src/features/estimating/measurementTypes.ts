import type { RoomGeometryInput } from "@/domains/geometry";

/** One stored measurement record (project-wide when `roomId` is null). */
export interface ProjectMeasurementDTO extends RoomGeometryInput {
  id: string;
  projectId: string;
  roomId: string | null;
  reviewedAt: string | null;
  /** Fields the contractor has not confirmed; never treated as authoritative. */
  unconfirmedFields: string[];
  /** Set when dependent quantities could not be recalculated after a change. */
  quantitiesStaleAt: string | null;
  quantitiesStaleReason: string | null;
  updatedAt: string;
}
