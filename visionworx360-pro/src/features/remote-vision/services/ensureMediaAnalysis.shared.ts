/**
 * SURFACE-INDEPENDENT VISION ANALYSIS PLANNING (pure).
 *
 * A photo added to a project must be analyzed the same way no matter which
 * door it came through (Photos tab, Estimate-from-Photos flow, anything
 * later). The decision of WHETHER a run is owed — and for which media set —
 * lives here so it can be regression-tested without a browser, a database or
 * a paid gateway call.
 *
 * Cost rule: exactly one run per real media-set change. A stored successful
 * result whose fingerprint already covers every current photo is never
 * re-run, so revisiting a page costs nothing.
 *
 * Authority rule is unchanged: this decides only when to LOOK. Visual
 * observations remain context-only and never create scope, questions or price.
 */

import { kindForPhoto } from "./mediaPersistence";
import { mediaFingerprint } from "./mediaUnderstanding.shared";
import type { VisualEvidenceKind, VisualUnderstandingStatus } from "@/domains/remoteVision/visualUnderstanding";

export interface AnalyzablePhotoRow {
  id: string;
  storagePath: string | null;
  mimeType: string | null;
  photoType: string | null;
  caption: string | null;
}

export interface PlannedVisionRef {
  id: string;
  kind: VisualEvidenceKind;
  storagePath: string;
  mimeType?: string;
}

/** Storage-backed photos of this project, mapped to vision refs. */
export function visionRefsForPhotos(
  photos: readonly AnalyzablePhotoRow[],
  limit: number,
): PlannedVisionRef[] {
  const refs: PlannedVisionRef[] = [];
  for (const photo of photos) {
    if (!photo.storagePath) continue;
    const kind = kindForPhoto({
      photoType: (photo.photoType ?? "existing") as never,
      caption: photo.caption,
    });
    refs.push({
      id: photo.id,
      kind: kind === "walkthrough_video" ? "video_keyframe" : kind,
      storagePath: photo.storagePath,
      ...(photo.mimeType ? { mimeType: photo.mimeType } : {}),
    });
    if (refs.length >= limit) break;
  }
  return refs;
}

export type AnalysisPlanReason = "no_media" | "already_analyzed" | "media_changed";

export interface AnalysisPlan {
  run: boolean;
  reason: AnalysisPlanReason;
  fingerprint: string | null;
}

/**
 * A stored OK result covers this media set when its fingerprint contains every
 * current photo id. Superset matches count: the Remote Vision flow fingerprints
 * video keyframes too, and those extra ids must not force a paid re-run.
 */
export function planMediaAnalysis(input: {
  mediaIds: readonly string[];
  storedFingerprint: string | null;
  storedStatus: VisualUnderstandingStatus;
}): AnalysisPlan {
  const fingerprint = mediaFingerprint(input.mediaIds);
  if (!fingerprint) return { run: false, reason: "no_media", fingerprint: null };
  if (input.storedStatus === "ok" && input.storedFingerprint) {
    const covered = new Set(input.storedFingerprint.split("|"));
    if (input.mediaIds.every((id) => covered.has(id)))
      return { run: false, reason: "already_analyzed", fingerprint };
  }
  return { run: true, reason: "media_changed", fingerprint };
}
