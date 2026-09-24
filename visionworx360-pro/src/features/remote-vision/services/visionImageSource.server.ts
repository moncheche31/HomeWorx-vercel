/**
 * DURABLE PHOTO -> VISION IMAGE INPUT.
 *
 * Root cause this file addresses: a photo that reached storage was mapped into
 * the session with `previewUrl: null` (only a `storagePath`), while the vision
 * pipeline accepted `data:image/...` URLs only. Every persisted photo was
 * therefore silently dropped before analysis, on BOTH the Photos tab and the
 * Estimate-from-Photos page — only video keyframes (which carry base64
 * previews) ever reached the model.
 *
 * Bytes are now read server-side from the project's own storage and inlined,
 * exactly like the plan-reading path does. Everything here is pure apart from
 * the injected signer/fetcher, so the rules are regression-testable without a
 * browser, a database, or a gateway call.
 */

import type { VisualEvidenceKind } from "@/domains/remoteVision/visualUnderstanding";
import type { VisionImageInput } from "./visionUnderstanding.server";

/** A jobsite photo is a phone photo; anything larger is not worth inlining. */
export const MAX_STORED_IMAGE_BYTES = 12 * 1024 * 1024;

/**
 * One media item the client wants analyzed. Exactly one source is used:
 * an already-inlined `dataUrl` (video keyframes, in-flight previews) or a
 * `storagePath` in the project-media bucket (every durable photo).
 */
export interface VisionImageRef {
  id: string;
  kind: VisualEvidenceKind;
  dataUrl?: string | null;
  storagePath?: string | null;
  mimeType?: string | null;
}

export interface VisionImageLoaderDeps {
  /** Returns a short-lived signed URL, or null when the object cannot be read. */
  signUrl: (storagePath: string) => Promise<string | null>;
  /** Injected so tests never touch the network. */
  fetchImage?: (url: string) => Promise<Response>;
}

const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

/** Content-type header first; fall back to the stored mime, then the extension. */
export function imageMimeType(
  headerType: string | null,
  storedMime: string | null | undefined,
  storagePath: string,
): string | null {
  const header = headerType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (header.startsWith("image/")) return header;
  const stored = storedMime?.trim().toLowerCase() ?? "";
  if (stored.startsWith("image/")) return stored;
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME[ext] ?? null;
}

/** Chunked so a multi-megabyte photo cannot blow the argument stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Resolve every reference to an inlineable image.
 *
 * A reference that cannot be read (missing object, oversized, non-image, or a
 * failed fetch) is SKIPPED, never faked: analysis proceeds on the media that
 * is genuinely readable rather than failing the whole run.
 */
export async function resolveVisionImages(
  refs: VisionImageRef[],
  deps: VisionImageLoaderDeps,
  limit = 12,
): Promise<VisionImageInput[]> {
  const fetchImage = deps.fetchImage ?? ((url: string) => fetch(url));
  const out: VisionImageInput[] = [];

  for (const ref of refs) {
    if (out.length >= limit) break;

    if (ref.dataUrl?.startsWith("data:image/")) {
      out.push({ id: ref.id, kind: ref.kind, dataUrl: ref.dataUrl });
      continue;
    }
    if (!ref.storagePath) continue;

    let signed: string | null = null;
    try {
      signed = await deps.signUrl(ref.storagePath);
    } catch {
      signed = null;
    }
    if (!signed) continue;

    try {
      const response = await fetchImage(signed);
      if (!response.ok) continue;
      const mime = imageMimeType(
        response.headers?.get?.("content-type") ?? null,
        ref.mimeType,
        ref.storagePath,
      );
      if (!mime) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_STORED_IMAGE_BYTES) continue;
      out.push({
        id: ref.id,
        kind: ref.kind,
        dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}`,
      });
    } catch {
      /* Unreadable object: skip it, keep the rest of the media set. */
    }
  }

  return out;
}
