import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  EMPTY_NARRATIVE_RECORD,
  mapNarrativeRow,
  patchToRow,
  type NarrativeScopePatch,
  type NarrativeScopeRecord,
} from "./narrativeScope.shared";

type SB = SupabaseClient<Database>;
// The table is newer than the generated types in some checkouts; the queries
// below are plain column reads/writes, so a loose client keeps this compiling
// without weakening the RLS-scoped runtime behaviour.
type LooseSB = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const TABLE = "project_narrative_scopes";

async function projectOrgId(supabase: LooseSB, projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Project lookup failed");
  const orgId = (data as { organization_id?: string } | null)?.organization_id;
  // RLS already scopes the read to the caller's organizations, so a missing
  // row means "not yours" as much as "not found".
  if (!orgId) throw new Error("Project not found");
  return orgId;
}

export async function loadNarrativeScope(
  supabase: SB,
  projectId: string,
): Promise<NarrativeScopeRecord | null> {
  const sb = supabase as unknown as LooseSB;
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Narrative scope lookup failed");
  return data ? mapNarrativeRow(data as Record<string, unknown>) : null;
}

/**
 * Upsert the durable narrative record with patch semantics: untouched fields
 * keep their stored value, so a wording-only save can never clear an approval
 * and an approval save can never drop the contractor's wording.
 */
export async function persistNarrativeScope(
  supabase: SB,
  userId: string,
  projectId: string,
  patch: NarrativeScopePatch,
): Promise<NarrativeScopeRecord> {
  const sb = supabase as unknown as LooseSB;
  const organizationId = await projectOrgId(sb, projectId);
  const existing = await loadNarrativeScope(supabase, projectId);
  const columns = patchToRow(patch);

  if (existing) {
    const { data, error } = await sb
      .from(TABLE)
      .update(columns)
      .eq("project_id", projectId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to save scope wording");
    return mapNarrativeRow(data as Record<string, unknown>);
  }

  const { data, error } = await sb
    .from(TABLE)
    .insert({
      project_id: projectId,
      organization_id: organizationId,
      created_by: userId,
      ...patchToRow({ ...EMPTY_NARRATIVE_RECORD, ...patch }),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message ?? "Failed to save scope wording");
  return mapNarrativeRow(data as Record<string, unknown>);
}
