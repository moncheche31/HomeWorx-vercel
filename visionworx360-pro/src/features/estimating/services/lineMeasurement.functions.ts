import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EstimateLineDTO } from "../types";
import { captureLineMeasurementSchema } from "./lineMeasurement.schemas";
import { bindCaptureToLine, type LineRow } from "./lineMeasurement.server";
import { mapLine } from "./mappers";

type SB = {
  from: (t: string) => any;
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export type CaptureLineMeasurementResult =
  | { status: "needs_review"; heard: string }
  | { status: "bound"; line: EstimateLineDTO; quantity: number; formula: string };

/**
 * Resolve one gated estimate line from a measurement taken on site.
 *
 * Voice and typed entry land in the SAME project measurement tables the rest
 * of the app reads, and the line records which measurement it was resolved
 * from — so a price can always be traced back to the number someone took.
 */
export const captureLineMeasurement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => captureLineMeasurementSchema.parse(d))
  .handler(async ({ data, context }): Promise<CaptureLineMeasurementResult> => {
    const sb = context.supabase as unknown as SB;
    const { data: org, error: orgError } = await sb.rpc("current_active_organization_id");
    if (orgError || !org) throw new Error("No active organization");

    const { data: row } = await sb
      .from("estimate_line_items")
      .select("id, estimate_id, project_id, organization_id, description, unit_key, archived_at")
      .eq("id", data.lineId)
      .eq("estimate_id", data.estimateId)
      .eq("organization_id", org)
      .maybeSingle();
    const line = row as LineRow | null;
    if (!line || line.archived_at) throw new Error("Estimate line not found");

    const result = bindCaptureToLine(line, data);
    if (!result) return { status: "needs_review", heard: data.text ?? "" };

    /* The capture itself is kept verbatim, whatever we could make of it. */
    const { data: capture } = await sb
      .from("project_measurement_captures")
      .insert({
        organization_id: org,
        project_id: line.project_id,
        source: data.source,
        transcript: (data.text ?? `${result.bound.quantity}`).slice(0, 20_000),
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();
    const captureId = (capture as { id: string } | null)?.id ?? null;

    let measurementId: string | null = null;
    if (result.item) {
      const { data: item } = await sb
        .from("project_measurement_items")
        .insert({
          organization_id: org,
          project_id: line.project_id,
          capture_id: captureId,
          source: data.source,
          status: "confirmed",
          label: result.item.label || line.description.slice(0, 120),
          subject: result.item.subject,
          kind: result.item.kind,
          inches: result.item.inches,
          secondary_inches: result.item.secondaryInches,
          raw_text: result.item.rawText,
          flag: result.item.flag,
          created_by: context.userId,
        })
        .select("id")
        .maybeSingle();
      measurementId = (item as { id: string } | null)?.id ?? null;
    }

    const patch: Record<string, unknown> = {
      quantity: result.bound.quantity,
      is_quantity_placeholder: false,
      quantity_basis: measurementId ? "measurement" : "contractor_entered",
      quantity_basis_note: result.bound.formula,
      quantity_reviewed_by: context.userId,
      quantity_reviewed_at: new Date().toISOString(),
    };
    if (measurementId) patch.quantity_source_measurement_id = measurementId;

    const { data: updated, error } = await sb
      .from("estimate_line_items")
      .update(patch)
      .eq("id", line.id)
      .eq("organization_id", org)
      .select("*")
      .maybeSingle();
    if (error || !updated) throw new Error("Failed to apply the measurement");

    return {
      status: "bound",
      line: mapLine(updated as Record<string, unknown>),
      quantity: result.bound.quantity,
      formula: result.bound.formula,
    };
  });
