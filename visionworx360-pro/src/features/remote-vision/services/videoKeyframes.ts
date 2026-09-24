/**
 * Browser-only representative-frame extraction for prerecorded walkthrough
 * video.
 *
 * There is NO continuous video AI in V1. We read the video's own metadata for
 * duration and decode a small number of evenly spaced frames so the existing
 * deterministic vision pipeline has visual evidence to reference. The source
 * video is kept as project evidence; frames never produce measurements.
 *
 * Memory: only one frame is on the canvas at a time and the file is streamed
 * through an object URL — the video is never read into memory as a buffer.
 */

import { KEYFRAME_TARGET, keyframeTimestamps } from "@/domains/remoteVision/videoIntake";

export interface VideoProbe {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}

function createVideo(url: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  return video;
}

/** Reads duration/resolution from metadata without downloading the whole file. */
export async function probeVideo(file: File): Promise<VideoProbe> {
  if (typeof document === "undefined") return { durationSeconds: null, width: null, height: null };
  const url = URL.createObjectURL(file);
  const video = createVideo(url);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("probe_timeout")), 15000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("probe_failed"));
      };
    });
    const duration = Number.isFinite(video.duration) ? video.duration : null;
    return { durationSeconds: duration, width: video.videoWidth, height: video.videoHeight };
  } catch {
    return { durationSeconds: null, width: null, height: null };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export interface KeyframeResult {
  durationSeconds: number | null;
  /** JPEG data URLs, one per representative frame. May be empty. */
  frames: string[];
}

export async function extractKeyframes(
  file: File,
  count = KEYFRAME_TARGET,
): Promise<KeyframeResult> {
  if (typeof document === "undefined") return { durationSeconds: null, frames: [] };
  const url = URL.createObjectURL(file);
  const video = createVideo(url);
  const frames: string[] = [];
  let duration: number | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("probe_timeout")), 20000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("probe_failed"));
      };
    });
    duration = Number.isFinite(video.duration) ? video.duration : null;
    if (duration === null) return { durationSeconds: null, frames: [] };

    const canvas = document.createElement("canvas");
    const scale = video.videoWidth > 640 ? 640 / video.videoWidth : 1;
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { durationSeconds: duration, frames: [] };

    for (const time of keyframeTimestamps(duration, count)) {
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error("seek_timeout")), 10000);
          video.onseeked = () => {
            window.clearTimeout(timer);
            resolve();
          };
          video.currentTime = time;
        });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL("image/jpeg", 0.6));
      } catch {
        break;
      }
    }
    return { durationSeconds: duration, frames };
  } catch {
    return { durationSeconds: duration, frames };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
