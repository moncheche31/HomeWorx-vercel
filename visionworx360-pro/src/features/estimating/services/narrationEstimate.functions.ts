/**
 * RECOVERY: build the estimate from the project's spoken scope narration.
 *
 * A project can reach the Estimate tab with narration but no structured scope
 * (intake draft never approved, or approval interrupted). The ballpark
 * interview then has nothing to price and the contractor sees $0 for a job he
 * described in full. This server function replays the SAME deterministic
 * recognition + NCE 2026 book pricing pipeline the intake screen runs and
 * commits it through the one canonical commit path.
 *
 * Guardrails:
 *  - never runs when the project already has included scope items;
 *  - never invents work: no recognized priceable scope => no changes;
 *  - prices at the resolved job-site book location (flagged national baseline
 *    until the job site is confirmed) — never a flat rate.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { estimateFromNarration } from "@/domains/remoteVision/narrationEstimate";
import {
  NATIONAL_BASELINE_LOCATION,
  bookLaborRateTable,
  type BookPricingLocation,
} from "@/domains/estimating/pricing/bookLaborRates";

type SB = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export interface NarrationEstimateOutcome {
  /** True when scope + estimate were (re)built from the narration. */
  recovered: boolean;
  reason: "ok" | "scope_exists" | "no_narration" | "no_priceable_scope" | "pricing_unresolved";
  estimateId?: string | null;
  itemCount?: number;
}

const schema = z.object({
  projectId: z.string().uuid(),
  /** Contractor-selected preliminary level; defaults to the conservative one. */
  level: z.string().trim().max(40).nullable().optional(),
});

async function resolveBookLocation(sb: SB, projectId: string): Promise<BookPricingLocation> {
  try {
    const { data: project } = await sb
      .from("projects").select("property_id").eq("id", projectId).maybeSingle();
    const propertyId = (project as { property_id?: string | null } | null)?.property_id ?? null;
    let postal: string | null = null;
    let region: string | null = null;
    if (propertyId) {
      const { data: property } = await sb
        .from("properties").select("postal_code, region").eq("id", propertyId).maybeSingle();
      const p = property as { postal_code?: string | null; region?: string | null } | null;
      postal = p?.postal_code ?? null;
      region = p?.region ?? null;
    }
    const { data: rows } = await sb.rpc("nce_resolve_location", {
      _postal: postal, _state: region, _override: null,
    });
    const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | undefined;
    if (!row) return NATIONAL_BASELINE_LOCATION;
    return {
      location: String(row.location ?? NATIONAL_BASELINE_LOCATION.location),
      source: String(row.match_source ?? "national_baseline") as BookPricingLocation["source"],
      materialPct: Number(row.material_pct ?? 0),
      laborPct: Number(row.labor_pct ?? 0),
      equipmentPct: Number(row.equipment_pct ?? 0),
    };
  } catch {
    return NATIONAL_BASELINE_LOCATION;
  }
}

/** The contractor's own words for this project, newest first. */
async function loadNarration(sb: SB, projectId: string): Promise<string | null> {
  const { data: notes } = await sb
    .from("project_notes")
    .select("body, note_type, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (notes ?? []) as Array<Record<string, unknown>>;
  const description = rows.find((r) => r.note_type === "project_description");
  const fromNote = String(description?.body ?? "").trim();
  if (fromNote) return fromNote;

  const { data: narrative } = await sb
    .from("project_narrative_scopes")
    .select("approved_text, edited_text")
    .eq("project_id", projectId)
    .maybeSingle();
  const n = narrative as { approved_text?: string | null; edited_text?: string | null } | null;
  const text = (n?.approved_text ?? n?.edited_text ?? "").trim();
  return text || null;
}

export const estimateFromProjectNarration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }): Promise<NarrationEstimateOutcome> => {
    const sb = context.supabase as unknown as SB;

    /* Structured scope is authoritative; narration recovery never overrides it. */
    const { data: existing } = await sb
      .from("scope_items")
      .select("id")
      .eq("project_id", data.projectId)
      .is("archived_at", null)
      .limit(1);
    if (Array.isArray(existing) && existing.length > 0) {
      return { recovered: false, reason: "scope_exists" };
    }

    const text = await loadNarration(sb, data.projectId);
    if (!text) return { recovered: false, reason: "no_narration" };

    const location = await resolveBookLocation(sb, data.projectId);

    let built: ReturnType<typeof estimateFromNarration>;
    try {
      built = estimateFromNarration({
        projectId: data.projectId,
        text,
        bookLocation: location,
        laborRates: bookLaborRateTable(location),
        level: data.level ?? null,
      });
    } catch {
      /* Recognized scope that cannot be priced must be resolved by the
         contractor, never persisted as a zero-dollar estimate. */
      return { recovered: false, reason: "pricing_unresolved" };
    }
    if (!built || (built.commit.items ?? []).length === 0) {
      return { recovered: false, reason: "no_priceable_scope" };
    }

    const { commitApprovedEstimateImpl } = await import("./estimateCommit.server");
    const result = await commitApprovedEstimateImpl(
      sb as never,
      context.userId,
      built.commit,
    );

    return {
      recovered: true,
      reason: "ok",
      estimateId: (result as { estimateId?: string | null }).estimateId ?? null,
      itemCount: (built.commit.items ?? []).length,
    };
  });
