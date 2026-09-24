import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyGeometryQuantitiesSchema,
  getMeasurementsSchema,
  saveMeasurementsSchema,
} from "./measurementSchemas";
import { mapMeasurement, toSqlAssignment } from "./measurements.server";
import type { ProjectMeasurementDTO } from "../measurementTypes";

type SB = {
  from: (t: string) => any;
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** All measurement records for a project (project-wide record has roomId null). */
export const listProjectMeasurements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => getMeasurementsSchema.parse(d))
  .handler(async ({ data, context }): Promise<ProjectMeasurementDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const { data: org, error: orgError } = await sb.rpc("current_active_organization_id");
    if (orgError || !org) throw new Error("No active organization");
    const { data: rows, error } = await sb.from("project_measurements").select("*")
      .eq("organization_id", org).eq("project_id", data.projectId);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to load measurements");
    return ((rows as Record<string, unknown>[] | null) ?? []).map(mapMeasurement);
  });

/** Create or update the measurement record for a project (or one of its rooms). */
export const saveProjectMeasurements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveMeasurementsSchema.parse(d))
  .handler(async ({ data, context }): Promise<ProjectMeasurementDTO> => {
    const sb = context.supabase as unknown as SB;
    const { data: org, error: orgError } = await sb.rpc("current_active_organization_id");
    if (orgError || !org) throw new Error("No active organization");

    const { data: project, error: projectError } = await sb.from("projects")
      .select("id").eq("id", data.projectId).eq("organization_id", org).maybeSingle();
    if (projectError || !project) throw new Error("Project not in active organization");

    const roomId = data.roomId ?? null;
    const patch = {
      organization_id: org,
      project_id: data.projectId,
      room_id: roomId,
      label: data.label ?? null,
      length_ft: data.lengthFt,
      width_ft: data.widthFt,
      ceiling_height_ft: data.ceilingHeightFt,
      openings: data.openings,
      interior_partition_lf: data.interiorPartitionLf,
      floor_waste_pct: data.floorWastePct ?? 10,
      notes: data.notes ?? null,
      reviewed_at: new Date().toISOString(),
    };

    const existingQuery = sb.from("project_measurements").select("id")
      .eq("organization_id", org).eq("project_id", data.projectId);
    const { data: existing } = await (roomId
      ? existingQuery.eq("room_id", roomId)
      : existingQuery.is("room_id", null)
    ).maybeSingle();

    /*
     * Corrected dimensions must flow forward. Every quantity still marked
     * geometry_derived is recomputed from the new measurement; contractor
     * quantities are left alone by the RPC. Without this, a bad early
     * dimension hardens permanently into the estimate.
     *
     * A failed re-derivation is NEVER silent: the measurement row is stamped
     * stale so downstream quantities are visibly flagged as not matching the
     * saved geometry, and the caller still gets the error.
     */
    const rederive = async (rowId: string) => {
      const { error } = await sb.rpc("rederive_measurement_quantities", {
        _project_id: data.projectId,
      });
      const stalePatch = error
        ? {
            quantities_stale_at: new Date().toISOString(),
            quantities_stale_reason:
              (error as { message?: string }).message ?? "recalculation_failed",
          }
        : { quantities_stale_at: null, quantities_stale_reason: null };
      const { data: row } = await sb.from("project_measurements")
        .update(stalePatch).eq("id", rowId).select("*").maybeSingle();
      if (error) {
        throw new Error(
          `measurement_quantities_stale:${(error as { message?: string }).message ?? "recalculation_failed"}`,
        );
      }
      return row as Record<string, unknown> | null;
    };

    if (existing) {
      const { data: row, error } = await sb.from("project_measurements")
        .update(patch).eq("id", (existing as { id: string }).id).select("*").maybeSingle();
      if (error || !row) throw new Error("Failed to save measurements");
      const fresh = await rederive((row as { id: string }).id);
      return mapMeasurement((fresh ?? row) as Record<string, unknown>);
    }

    const { data: row, error } = await sb.from("project_measurements")
      .insert(patch).select("*").maybeSingle();
    if (error || !row) throw new Error("Failed to save measurements");
    const fresh = await rederive((row as { id: string }).id);
    return mapMeasurement((fresh ?? row) as Record<string, unknown>);
  });


/**
 * Apply measurement-derived quantities to eligible estimate lines in one step.
 * Contractor-overridden lines and locked estimates are skipped by the RPC.
 */
export const applyGeometryQuantities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => applyGeometryQuantitiesSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ updated: number; inserted: number; skipped: number }> => {
    const sb = context.supabase as unknown as SB;
    const { data: result, error } = await sb.rpc("apply_geometry_quantities", {
      _estimate_id: data.estimateId,
      _assignments: data.assignments.map(toSqlAssignment),
    });
    if (error) {
      throw new Error((error as { message?: string }).message ?? "Failed to apply quantities");
    }
    const r = (result ?? {}) as { updated?: number; inserted?: number; skipped?: number };
    return { updated: r.updated ?? 0, inserted: r.inserted ?? 0, skipped: r.skipped ?? 0 };
  });
