import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Durable contractor decisions on scope review findings.
 *
 * Why this exists: acknowledgements used to live in React state keyed to the
 * whole-scope fingerprint, so the moment a contractor fixed one item every
 * other answered finding was forgotten and the list re-grew. A decision is a
 * fact about the job, so it belongs in the database, keyed to the ISSUE
 * subject rather than to a render-time finding id.
 */

const listSchema = z.object({ projectId: z.string().uuid() });

const recordSchema = z.object({
  projectId: z.string().uuid(),
  subjectKey: z.string().min(1).max(300),
  subjectFingerprint: z.string().min(1).max(120),
  findingKind: z.string().min(1).max(60),
  decision: z.enum(["kept", "reassigned", "dismissed"]),
  decidedTradeKey: z.string().max(60).nullish(),
  itemIds: z.array(z.string().uuid()).default([]),
});

export interface ScopeDecisionDTO {
  subjectKey: string;
  subjectFingerprint: string;
  findingKind: string;
  decision: "kept" | "reassigned" | "dismissed";
  decidedTradeKey: string | null;
  itemIds: string[];
}

type SB = {
  from: (t: string) => any;
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

async function resolveOrg(sb: SB): Promise<string> {
  const { data, error } = await sb.rpc("current_active_organization_id");
  if (error) throw new Error((error as { message?: string }).message ?? "No active organization");
  const org = data as string | null;
  if (!org) throw new Error("No active organization");
  return org;
}

/** Project isolation is enforced on every call, never assumed from the client. */
async function assertProjectInOrg(sb: SB, projectId: string, orgId: string) {
  const { data, error } = await sb
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error((error as { message?: string }).message ?? "Project lookup failed");
  if (!data) throw new Error("Project not in active organization");
}

const mapRow = (r: any): ScopeDecisionDTO => ({
  subjectKey: r.subject_key,
  subjectFingerprint: r.subject_fingerprint,
  findingKind: r.finding_kind,
  decision: r.decision,
  decidedTradeKey: r.decided_trade_key ?? null,
  itemIds: r.item_ids ?? [],
});

export const listScopeValidationDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }): Promise<ScopeDecisionDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const orgId = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, orgId);
    const { data: rows, error } = await sb
      .from("scope_validation_decisions")
      .select("*")
      .eq("organization_id", orgId)
      .eq("project_id", data.projectId);
    if (error) throw new Error((error as { message?: string }).message ?? "Decision lookup failed");
    return ((rows ?? []) as any[]).map(mapRow);
  });

export const recordScopeValidationDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordSchema.parse(d))
  .handler(async ({ data, context }): Promise<ScopeDecisionDTO> => {
    const sb = context.supabase as unknown as SB;
    const orgId = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, orgId);
    /*
     * Upsert on (project_id, subject_key): re-answering the same question
     * replaces the previous answer instead of stacking duplicates, which also
     * makes a double-tap idempotent.
     */
    const { data: row, error } = await sb
      .from("scope_validation_decisions")
      .upsert(
        {
          organization_id: orgId,
          project_id: data.projectId,
          subject_key: data.subjectKey,
          subject_fingerprint: data.subjectFingerprint,
          finding_kind: data.findingKind,
          decision: data.decision,
          decided_trade_key: data.decidedTradeKey ?? null,
          item_ids: data.itemIds,
          decided_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,subject_key" },
      )
      .select("*")
      .single();
    if (error) throw new Error((error as { message?: string }).message ?? "Could not save decision");
    return mapRow(row);
  });
