import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CORRECTION_CAPTURE_METHODS,
  CORRECTION_CONTEXTS,
  validateProposedCorrection,
  type TerminologyCorrection,
} from "@/domains/terminologyMemory";

/**
 * Terminology memory persistence. The matching itself is pure and lives in
 * `@/domains/terminologyMemory`; this module only reads and writes rows.
 */

type SB = {
  from: (t: string) => any;
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const TABLE = "contractor_terminology_corrections";

async function resolveOrg(sb: SB): Promise<string> {
  const { data, error } = await sb.rpc("current_active_organization_id");
  if (error) throw new Error((error as { message?: string }).message ?? "No active organization");
  const org = data as string | null;
  if (!org) throw new Error("No active organization");
  return org;
}

export interface TerminologyCorrectionDTO extends TerminologyCorrection {
  sourceProjectId: string | null;
  sourceEvidence: string | null;
  appliedCount: number;
  lastAppliedAt: string | null;
  createdAt: string;
}

function mapRow(row: Record<string, unknown>): TerminologyCorrectionDTO {
  return {
    id: String(row.id),
    wrongTerm: String(row.wrong_term),
    correctedTerm: String(row.corrected_term),
    triggerPhrase: (row.trigger_phrase as string | null) ?? null,
    contextScope: (row.context_scope as TerminologyCorrection["contextScope"]) ?? "any",
    tradeKey: (row.trade_key as string | null) ?? null,
    captureMethod:
      (row.capture_method as TerminologyCorrection["captureMethod"]) ?? "explicit_correction",
    isActive: row.is_active !== false,
    sourceProjectId: (row.source_project_id as string | null) ?? null,
    sourceEvidence: (row.source_evidence as string | null) ?? null,
    appliedCount: Number(row.applied_count ?? 0),
    lastAppliedAt: (row.last_applied_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

export const listTerminologyCorrections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as SB;
    const orgId = await resolveOrg(sb);
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error((error as { message?: string }).message ?? "Load failed");
    return ((data as Record<string, unknown>[] | null) ?? []).map(mapRow);
  });

const saveSchema = z.object({
  wrongTerm: z.string().min(1).max(200),
  correctedTerm: z.string().min(1).max(200),
  triggerPhrase: z.string().max(200).nullable().optional(),
  contextScope: z.enum(CORRECTION_CONTEXTS).default("any"),
  tradeKey: z.string().max(60).nullable().optional(),
  captureMethod: z.enum(CORRECTION_CAPTURE_METHODS).default("explicit_correction"),
  sourceProjectId: z.string().uuid().nullable().optional(),
  sourceEvidence: z.string().max(600).nullable().optional(),
});

export const saveTerminologyCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const verdict = validateProposedCorrection(data);
    if (!verdict.ok) throw new Error(verdict.reason);

    const sb = context.supabase as unknown as SB;
    const orgId = await resolveOrg(sb);
    const { data: row, error } = await sb
      .from(TABLE)
      .upsert(
        {
          organization_id: orgId,
          wrong_term: data.wrongTerm.trim(),
          corrected_term: data.correctedTerm.trim(),
          trigger_phrase: data.triggerPhrase?.trim() || null,
          context_scope: data.contextScope,
          trade_key: data.tradeKey?.trim() || null,
          capture_method: data.captureMethod,
          source_project_id: data.sourceProjectId ?? null,
          source_evidence: data.sourceEvidence?.trim() || null,
          is_active: true,
          created_by: (context as { userId?: string }).userId ?? null,
        },
        { onConflict: "organization_id,wrong_term_norm,trigger_phrase_norm,context_scope,trade_key" },
      )
      .select("*")
      .maybeSingle();
    if (error) throw new Error((error as { message?: string }).message ?? "Save failed");
    return row ? mapRow(row as Record<string, unknown>) : null;
  });

const toggleSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() });

export const setTerminologyCorrectionActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => toggleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SB;
    const orgId = await resolveOrg(sb);
    const { error } = await sb
      .from(TABLE)
      .update({ is_active: data.isActive })
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw new Error((error as { message?: string }).message ?? "Update failed");
    return { ok: true };
  });

const deleteSchema = z.object({ id: z.string().uuid() });

export const deleteTerminologyCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => deleteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SB;
    const orgId = await resolveOrg(sb);
    const { error } = await sb.from(TABLE).delete().eq("id", data.id).eq("organization_id", orgId);
    if (error) throw new Error((error as { message?: string }).message ?? "Delete failed");
    return { ok: true };
  });

const usageSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) });

/** Records that corrections actually fired, so unused rules are visible. */
export const recordTerminologyCorrectionUse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => usageSchema.parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SB;
    const orgId = await resolveOrg(sb);
    const { error } = await sb.rpc("bump_terminology_correction_usage", {
      _org_id: orgId,
      _ids: data.ids,
    });
    if (error) throw new Error((error as { message?: string }).message ?? "Usage update failed");
    return { ok: true };
  });
