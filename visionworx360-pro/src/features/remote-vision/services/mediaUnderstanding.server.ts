import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  mapUnderstandingRow,
  understandingPatchToRow,
  type MediaUnderstandingPatch,
  type MediaUnderstandingRecord,
} from "./mediaUnderstanding.shared";

type SB = SupabaseClient<Database>;
// The table is newer than the generated types in some checkouts; these are
// plain column reads/writes, so a loose client keeps this compiling without
// weakening the RLS-scoped runtime behaviour.
type LooseSB = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const TABLE = "project_media_understanding";

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

export async function loadMediaUnderstanding(
  supabase: SB,
  projectId: string,
): Promise<MediaUnderstandingRecord | null> {
  const sb = supabase as unknown as LooseSB;
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Project understanding lookup failed");
  return data ? mapUnderstandingRow(data as Record<string, unknown>) : null;
}

/**
 * Upsert with patch semantics: a narration-only save can never wipe stored
 * observations, and an analysis save can never wipe the contractor's words.
 */
export async function persistMediaUnderstanding(
  supabase: SB,
  userId: string,
  projectId: string,
  patch: MediaUnderstandingPatch,
): Promise<MediaUnderstandingRecord> {
  const sb = supabase as unknown as LooseSB;
  const columns = understandingPatchToRow(patch);
  const existing = await loadMediaUnderstanding(supabase, projectId);

  if (existing) {
    if (Object.keys(columns).length === 0) return existing;
    const { data, error } = await sb
      .from(TABLE)
      .update(columns)
      .eq("project_id", projectId)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to save project understanding");
    return mapUnderstandingRow(data as Record<string, unknown>);
  }

  const organizationId = await projectOrgId(sb, projectId);
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      project_id: projectId,
      organization_id: organizationId,
      created_by: userId,
      ...columns,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message ?? "Failed to save project understanding");
  return mapUnderstandingRow(data as Record<string, unknown>);
}
