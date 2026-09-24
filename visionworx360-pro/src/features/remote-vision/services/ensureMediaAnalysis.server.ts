/**
 * Server-side "any surface" vision analysis.
 *
 * Called after ANY media change on a project, from any client surface. It is
 * idempotent and self-guarding: it re-reads the project's durable photos and
 * the stored understanding record and only pays for a gateway call when the
 * media set actually changed.
 *
 * Never throws to the caller: a failed analysis must not break an upload.
 */

import { analyzeMediaWithModel } from "./visionUnderstanding.server";
import { resolveProjectVisionImages } from "./visionRequest.server";
import { loadMediaUnderstanding, persistMediaUnderstanding } from "./mediaUnderstanding.server";
import {
  planMediaAnalysis,
  visionRefsForPhotos,
  type AnalyzablePhotoRow,
} from "./ensureMediaAnalysis.shared";

export const ENSURE_MAX_IMAGES = 12;

export type EnsureAnalysisOutcome =
  | { status: "skipped"; reason: "no_media" | "already_analyzed" }
  | { status: "analyzed"; observations: number }
  | { status: "failed"; reason: string };

type LooseSB = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadAnalyzablePhotos(
  supabase: unknown,
  projectId: string,
): Promise<AnalyzablePhotoRow[]> {
  const sb = supabase as LooseSB;
  const { data, error } = await sb
    .from("project_photos")
    .select("id, storage_path, mime_type, photo_type, caption")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error((error as { message?: string }).message ?? "Photo lookup failed");
  return ((data as Record<string, unknown>[]) ?? []).map((row) => ({
    id: String(row.id),
    storagePath: (row.storage_path as string | null) ?? null,
    mimeType: (row.mime_type as string | null) ?? null,
    photoType: (row.photo_type as string | null) ?? null,
    caption: (row.caption as string | null) ?? null,
  }));
}

export async function ensureProjectMediaAnalysisFor(
  supabase: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
  projectId: string,
): Promise<EnsureAnalysisOutcome> {
  try {
    const photos = await loadAnalyzablePhotos(supabase, projectId);
    const refs = visionRefsForPhotos(photos, ENSURE_MAX_IMAGES);
    const stored = await loadMediaUnderstanding(supabase, projectId);
    const plan = planMediaAnalysis({
      mediaIds: refs.map((r) => r.id),
      storedFingerprint: stored?.mediaFingerprint ?? null,
      storedStatus: stored?.visualStatus ?? "no_media",
    });
    if (!plan.run) {
      return {
        status: "skipped",
        reason: plan.reason === "no_media" ? "no_media" : "already_analyzed",
      };
    }

    const images = await resolveProjectVisionImages(
      supabase,
      projectId,
      refs,
      ENSURE_MAX_IMAGES,
    );
    if (images.length === 0) return { status: "skipped", reason: "no_media" };

    const result = await analyzeMediaWithModel({
      images,
      transcript: stored?.spokenNarration ?? "",
      measurementFacts: "",
    });

    if (result.status !== "ok") {
      /* Do NOT claim the fingerprint on failure: the next change re-tries. */
      await persistMediaUnderstanding(supabase, userId, projectId, {
        visualStatus: result.status,
      });
      return { status: "failed", reason: result.errorCode ?? result.status };
    }

    await persistMediaUnderstanding(supabase, userId, projectId, {
      visualObservations: result.observations,
      mediaFingerprint: plan.fingerprint,
      visualStatus: "ok",
    });
    return { status: "analyzed", observations: result.observations.length };
  } catch (error) {
    return { status: "failed", reason: (error as Error).message || "ensure_failed" };
  }
}
