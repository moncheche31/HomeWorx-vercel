/**
 * DURABLE PROJECT MEDIA UNDERSTANDING (Phase 3).
 *
 * Visual observations and spoken narration used to live only in component
 * state, so every surface other than the one that ran the analysis was blind
 * to them and a reload erased the project's own evidence. This record makes
 * that understanding durable and project-scoped so the ballpark interview,
 * the scope pipeline and the estimator all read the SAME facts.
 *
 * Authority is unchanged: visual observations remain CONTEXT ONLY. They never
 * create scope, questions or cost on their own — persisting them does not
 * promote them.
 *
 * Pure module: no React, no IO.
 */

import { z } from "zod";
import {
  visualObservationSchema,
  type VisualObservation,
  type VisualUnderstandingStatus,
} from "@/domains/remoteVision/visualUnderstanding";

export const VISUAL_STATUSES = [
  "ok",
  "analyzing",
  "no_media",
  "provider_unavailable",
  "provider_error",
] as const satisfies readonly VisualUnderstandingStatus[];

export interface MediaUnderstandingRecord {
  projectId: string;
  /** Contractor walkthrough narration (transcribed or typed). */
  spokenNarration: string;
  /** Context-only visual facts seen in this project's media. */
  visualObservations: VisualObservation[];
  /** Fingerprint of the media set that produced the observations. */
  mediaFingerprint: string | null;
  visualStatus: VisualUnderstandingStatus;
  analyzedAt: string | null;
}

export const EMPTY_MEDIA_UNDERSTANDING: MediaUnderstandingRecord = {
  projectId: "",
  spokenNarration: "",
  visualObservations: [],
  mediaFingerprint: null,
  visualStatus: "no_media",
  analyzedAt: null,
};

export const getMediaUnderstandingSchema = z.object({ projectId: z.string().uuid() });

export const mediaUnderstandingPatchSchema = z.object({
  spokenNarration: z.string().max(200_000).optional(),
  visualObservations: z.array(visualObservationSchema).max(400).optional(),
  mediaFingerprint: z.string().max(200).nullable().optional(),
  visualStatus: z.enum(VISUAL_STATUSES).optional(),
});
export type MediaUnderstandingPatch = z.infer<typeof mediaUnderstandingPatchSchema>;

export const saveMediaUnderstandingSchema = z.object({
  projectId: z.string().uuid(),
  patch: mediaUnderstandingPatchSchema,
});

/** Tolerant row -> record mapping: stored rows predate later schema additions. */
export function mapUnderstandingRow(row: Record<string, unknown>): MediaUnderstandingRecord {
  const rawObservations = Array.isArray(row.visual_observations) ? row.visual_observations : [];
  const observations: VisualObservation[] = [];
  for (const candidate of rawObservations) {
    const parsed = visualObservationSchema.safeParse(candidate);
    if (parsed.success) observations.push(parsed.data);
  }
  const status = typeof row.visual_status === "string" ? row.visual_status : "no_media";
  return {
    projectId: typeof row.project_id === "string" ? row.project_id : "",
    spokenNarration: typeof row.spoken_narration === "string" ? row.spoken_narration : "",
    visualObservations: observations,
    mediaFingerprint: typeof row.media_fingerprint === "string" ? row.media_fingerprint : null,
    visualStatus: (VISUAL_STATUSES as readonly string[]).includes(status)
      ? (status as VisualUnderstandingStatus)
      : "no_media",
    analyzedAt: typeof row.analyzed_at === "string" ? row.analyzed_at : null,
  };
}

/** Patch -> column map. Absent keys are left untouched by the caller. */
export function understandingPatchToRow(patch: MediaUnderstandingPatch): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  if (patch.spokenNarration !== undefined) columns.spoken_narration = patch.spokenNarration;
  if (patch.visualObservations !== undefined) {
    columns.visual_observations = patch.visualObservations;
    // Observations only ever change as the result of an analysis run.
    columns.analyzed_at = new Date().toISOString();
  }
  if (patch.mediaFingerprint !== undefined) columns.media_fingerprint = patch.mediaFingerprint;
  if (patch.visualStatus !== undefined) columns.visual_status = patch.visualStatus;
  return columns;
}

/**
 * Stable fingerprint for a media set, so a reload can reuse stored
 * observations instead of paying for an identical re-analysis.
 */
export function mediaFingerprint(mediaIds: readonly string[]): string | null {
  if (mediaIds.length === 0) return null;
  return [...mediaIds].sort().join("|");
}

/**
 * Convert structured visual observations into the plain evidence strings the
 * scope-context gate consumes. The gate still treats them as visual context
 * only, never contractor-authorized scope.
 */
export function visualObservationsToScopeText(observations: readonly VisualObservation[]): string[] {
  return observations
    .map((observation) =>
      [observation.actionKey, observation.object, observation.note]
        .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
        .join(" ")
        .trim(),
    )
    .filter((text) => text.length > 0);
}

export function hasUnderstandingContent(record: MediaUnderstandingRecord): boolean {
  return record.spokenNarration.trim().length > 0 || record.visualObservations.length > 0;
}
