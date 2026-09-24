import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MeasurementCapture, MeasurementItem } from "@/domains/measurementCapture";
import {
  deleteMeasurementItemSchema,
  extractPlanMeasurementsSchema,
  listMeasurementCaptureSchema,
  saveMeasurementCaptureSchema,
  saveMeasurementItemsSchema,
  updateMeasurementItemSchema,
} from "./measurementCaptureSchemas";
import { mapCapture, mapItem, readPlanText, toItemRow } from "./measurementCapture.server";

type SB = {
  from: (t: string) => any;
  storage: { from: (b: string) => any };
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

async function orgFor(sb: SB, projectId: string): Promise<string> {
  const { data: org, error } = await sb.rpc("current_active_organization_id");
  if (error || !org) throw new Error("No active organization");
  const { data: project } = await sb
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", org)
    .maybeSingle();
  if (!project) throw new Error("Project not in active organization");
  return org as string;
}

export const listMeasurementCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listMeasurementCaptureSchema.parse(d))
  .handler(
    async ({ data, context }): Promise<{ items: MeasurementItem[]; captures: MeasurementCapture[] }> => {
      const sb = context.supabase as unknown as SB;
      const org = await orgFor(sb, data.projectId);
      const [items, captures] = await Promise.all([
        sb
          .from("project_measurement_items")
          .select("*")
          .eq("organization_id", org)
          .eq("project_id", data.projectId)
          .order("created_at", { ascending: true }),
        sb
          .from("project_measurement_captures")
          .select("*")
          .eq("organization_id", org)
          .eq("project_id", data.projectId)
          .order("created_at", { ascending: false }),
      ]);
      return {
        items: ((items.data as Record<string, unknown>[] | null) ?? []).map(mapItem),
        captures: ((captures.data as Record<string, unknown>[] | null) ?? []).map(mapCapture),
      };
    },
  );

export const saveMeasurementItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveMeasurementItemsSchema.parse(d))
  .handler(async ({ data, context }): Promise<MeasurementItem[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await orgFor(sb, data.projectId);
    const rows = data.items.map((item) =>
      toItemRow(item as unknown as Record<string, unknown>, org, data.projectId, context.userId),
    );
    const { data: inserted, error } = await sb
      .from("project_measurement_items")
      .insert(rows)
      .select("*");
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to save measurements");
    return ((inserted as Record<string, unknown>[] | null) ?? []).map(mapItem);
  });

export const updateMeasurementItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateMeasurementItemSchema.parse(d))
  .handler(async ({ data, context }): Promise<MeasurementItem> => {
    const sb = context.supabase as unknown as SB;
    const org = await orgFor(sb, data.projectId);
    const patch: Record<string, unknown> = {};
    if (data.label !== undefined) patch.label = data.label;
    if (data.inches !== undefined) patch.inches = data.inches;
    if (data.secondaryInches !== undefined) patch.secondary_inches = data.secondaryInches;
    if (data.status !== undefined) patch.status = data.status;
    if (data.flag !== undefined) patch.flag = data.flag;
    if (data.overridden) patch.overridden_at = new Date().toISOString();
    const { data: row, error } = await sb
      .from("project_measurement_items")
      .update(patch)
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org)
      .select("*")
      .maybeSingle();
    if (error || !row) throw new Error("Failed to update measurement");
    return mapItem(row as Record<string, unknown>);
  });

export const deleteMeasurementItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteMeasurementItemSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await orgFor(sb, data.projectId);
    const { error } = await sb
      .from("project_measurement_items")
      .delete()
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org);
    if (error) throw new Error("Failed to delete measurement");
    return { ok: true };
  });

export const saveMeasurementCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveMeasurementCaptureSchema.parse(d))
  .handler(async ({ data, context }): Promise<MeasurementCapture> => {
    const sb = context.supabase as unknown as SB;
    const org = await orgFor(sb, data.projectId);
    const { data: row, error } = await sb
      .from("project_measurement_captures")
      .insert({
        organization_id: org,
        project_id: data.projectId,
        source: data.source,
        transcript: data.transcript ?? null,
        document_id: data.documentId ?? null,
        file_name: data.fileName ?? null,
        created_by: context.userId,
      })
      .select("*")
      .maybeSingle();
    if (error || !row) throw new Error("Failed to save capture");
    return mapCapture(row as Record<string, unknown>);
  });

/** Read printed dimensions off an uploaded plan. Returns text for review. */
export const extractPlanMeasurements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => extractPlanMeasurementsSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ text: string; error: string | null }> => {
    const sb = context.supabase as unknown as SB;
    const org = await orgFor(sb, data.projectId);
    if (!data.storagePath.startsWith(`${org}/${data.projectId}/`)) {
      throw new Error("Invalid storage path");
    }
    const { data: signed, error } = await sb.storage
      .from("project-media")
      .createSignedUrl(data.storagePath, 300);
    if (error || !signed) return { text: "", error: "plan_unreadable" };
    return readPlanText((signed as { signedUrl: string }).signedUrl, data.mimeType);
  });
