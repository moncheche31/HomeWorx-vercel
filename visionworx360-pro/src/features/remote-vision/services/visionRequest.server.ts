/**
 * Server-only bridge between a vision request and the project's own storage.
 *
 * The org/project prefix check is the same one every other signed-read path in
 * the app applies: a caller can only ever inline bytes that belong to the
 * project it named, inside its own active organization.
 */

import {
  resolveVisionImages,
  type VisionImageRef,
} from "./visionImageSource.server";
import type { VisionImageInput } from "./visionUnderstanding.server";

type SB = {
  from: (t: string) => any;
  storage: { from: (b: string) => any };
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** Active org for the caller, asserting the project belongs to it. */
export async function orgForProject(sb: SB, projectId: string): Promise<string> {
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

export async function resolveProjectVisionImages(
  supabase: unknown,
  projectId: string | null,
  refs: VisionImageRef[],
  limit: number,
): Promise<VisionImageInput[]> {
  const needsStorage = refs.some((r) => !r.dataUrl && r.storagePath);
  if (!needsStorage) {
    return resolveVisionImages(refs, { signUrl: async () => null }, limit);
  }
  if (!projectId) throw new Error("projectId is required to read stored media");

  const sb = supabase as SB;
  const org = await orgForProject(sb, projectId);
  const prefix = `${org}/${projectId}/`;

  return resolveVisionImages(
    refs,
    {
      signUrl: async (storagePath) => {
        if (!storagePath.startsWith(prefix)) return null;
        const { data: signed, error } = await sb.storage
          .from("project-media")
          .createSignedUrl(storagePath, 300);
        if (error || !signed) return null;
        return (signed as { signedUrl: string }).signedUrl;
      },
    },
    limit,
  );
}
