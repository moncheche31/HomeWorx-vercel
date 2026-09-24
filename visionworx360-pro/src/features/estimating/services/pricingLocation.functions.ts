/**
 * JOB-SITE LOCATION PRICING (NCE 2026 area modification factors).
 *
 * The factors come from the JOB SITE, resolved once in the database
 * (`nce_resolve_location`): manual override -> ZIP prefix range -> state
 * average -> national baseline (flagged, never a silent state guess).
 *
 * Material, labor and equipment percentages are applied SEPARATELY; the
 * weighted average is display-only. Boston (+60% labor / +3% material) is the
 * reason a blended figure is not acceptable.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { mapEstimate } from "./mappers";
import type { EstimateDTO } from "../types";
import {
  NATIONAL_BASELINE_LOCATION,
  type BookPricingLocation,
} from "@/domains/estimating/pricing/bookLaborRates";

type SB = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const msg = (e: unknown, fallback: string) =>
  (e as { message?: string } | null)?.message ?? fallback;

export interface PricingLocationOption {
  location: string;
  materialPct: number;
  laborPct: number;
  equipmentPct: number;
  totalPct: number;
  isStateAverage: boolean;
}

const searchSchema = z.object({ search: z.string().trim().max(80).optional() });

/** Book locations the contractor can pick from when overriding the job site. */
export const listPricingLocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<PricingLocationOption[]> => {
    const sb = context.supabase as unknown as SB;
    let q = sb
      .from("area_modification_factors_nce2026")
      .select("location, material_pct, labor_pct, equipment_pct, total_weighted_avg_pct, is_state_average")
      .order("location", { ascending: true })
      .limit(40);
    if (data.search) q = q.ilike("location", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(msg(error, "Failed to load pricing locations"));
    return (rows ?? []).map((r: Record<string, unknown>) => ({
      location: String(r.location),
      materialPct: Number(r.material_pct ?? 0),
      laborPct: Number(r.labor_pct ?? 0),
      equipmentPct: Number(r.equipment_pct ?? 0),
      totalPct: Number(r.total_weighted_avg_pct ?? 0),
      isStateAverage: r.is_state_average === true,
    }));
  });

const overrideSchema = z.object({
  estimateId: z.string().uuid(),
  /** null clears the override and returns to job-site resolution. */
  location: z.string().trim().min(1).max(120).nullable(),
});

/**
 * Contractor pins (or releases) the book location this estimate prices for.
 * The three regional passes re-run immediately so labor, material and
 * equipment all move together and the estimate never shows a location it was
 * not actually priced at.
 */
export const setEstimateLocationOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => overrideSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateDTO> => {
    const sb = context.supabase as unknown as SB;
    const { error: upErr } = await sb
      .from("estimates")
      .update({ pricing_location_override: data.location })
      .eq("id", data.estimateId);
    if (upErr) throw new Error(msg(upErr, "Failed to set pricing location"));

    for (const fn of ["apply_book_line_pricing", "apply_book_labor_rates", "apply_location_equipment_factor"]) {
      const { error } = await sb.rpc(fn, { _estimate_id: data.estimateId });
      if (error) throw new Error(msg(error, `Failed to reprice (${fn})`));
    }

    const { data: row, error } = await sb
      .from("estimates")
      .select("*")
      .eq("id", data.estimateId)
      .single();
    if (error) throw new Error(msg(error, "Failed to reload estimate"));
    return mapEstimate(row as Record<string, unknown>);
  });

const projectLocationSchema = z.object({ projectId: z.string().uuid() });

/**
 * Resolve the BOOK pricing location for a project, before any estimate exists.
 *
 * This is what lets the very first ballpark (Remote Vision / narrative intake)
 * price from the same book engine as the Estimate tab. When the job site is
 * not confirmed yet the database returns the explicitly flagged national
 * baseline — never a silent state guess, never a flat company rate.
 */
export const resolveProjectPricingLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => projectLocationSchema.parse(d))
  .handler(async ({ data, context }): Promise<BookPricingLocation> => {
    const sb = context.supabase as unknown as SB;

    let postal: string | null = null;
    let region: string | null = null;
    const { data: project } = await sb
      .from("projects")
      .select("property_id")
      .eq("id", data.projectId)
      .maybeSingle();
    const propertyId = (project as { property_id?: string | null } | null)?.property_id ?? null;
    if (propertyId) {
      const { data: property } = await sb
        .from("properties")
        .select("postal_code, region")
        .eq("id", propertyId)
        .maybeSingle();
      const p = property as { postal_code?: string | null; region?: string | null } | null;
      postal = p?.postal_code ?? null;
      region = p?.region ?? null;
    }

    const { data: rows, error } = await sb.rpc("nce_resolve_location", {
      _postal: postal,
      _state: region,
      _override: null,
    });
    if (error) return NATIONAL_BASELINE_LOCATION;
    const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | undefined;
    if (!row) return NATIONAL_BASELINE_LOCATION;
    return {
      location: String(row.location ?? NATIONAL_BASELINE_LOCATION.location),
      source: (String(row.match_source ?? "national_baseline") as BookPricingLocation["source"]),
      materialPct: Number(row.material_pct ?? 0),
      laborPct: Number(row.labor_pct ?? 0),
      equipmentPct: Number(row.equipment_pct ?? 0),
    };
  });
