/**
 * Prerecorded walkthrough video intake rules — deterministic, UI-free.
 *
 * V1 safeguards are explicit so the contractor gets a real message instead of
 * a mysterious upload failure.
 */

export const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/3gpp",
] as const;

/** 500 MB — comfortably covers a several-minute phone walkthrough. */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
/** 15 minutes. Longer walkthroughs should be split. */
export const MAX_VIDEO_SECONDS = 15 * 60;
/** Representative frames pulled for the deterministic vision pipeline. */
export const KEYFRAME_TARGET = 8;

export type VideoValidationError = "unsupported_type" | "too_large" | "too_long" | null;

export function isSupportedVideoType(mimeType: string): boolean {
  return (VIDEO_MIME_TYPES as readonly string[]).includes(mimeType.toLowerCase());
}

export function validateVideoFile(input: {
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number | null;
}): VideoValidationError {
  if (!isSupportedVideoType(input.mimeType)) return "unsupported_type";
  if (input.sizeBytes > MAX_VIDEO_BYTES) return "too_large";
  if (
    typeof input.durationSeconds === "number" &&
    Number.isFinite(input.durationSeconds) &&
    input.durationSeconds > MAX_VIDEO_SECONDS
  ) {
    return "too_long";
  }
  return null;
}

/** Evenly spaced sample times (seconds) used for keyframe extraction. */
export function keyframeTimestamps(durationSeconds: number, count = KEYFRAME_TARGET): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [0];
  const n = Math.max(1, Math.min(count, Math.ceil(durationSeconds)));
  return Array.from({ length: n }, (_, i) =>
    Math.min(durationSeconds - 0.05, ((i + 0.5) * durationSeconds) / n),
  );
}
