/**
 * Durable media mapping for the photo/video estimate workflow.
 *
 * Root cause this file addresses: media added in the Estimate-from-Photos
 * workflow used to live ONLY in the device session (localStorage) with
 * `storagePath: null`. The bytes were never uploaded, so any reload, new
 * device, or code update made the photos appear to "disappear" — they had
 * never been persisted in the first place.
 *
 * Everything here is pure so the merge rules can be regression-tested without
 * a browser or a database.
 */
import type { PhotoDTO, PhotoType } from "@/features/project-workspace/types";
import type { RemoteVisionMedia, RemoteVisionMediaKind } from "@/domains/remoteVision";

/** Marker stored in `caption` so a floor plan survives the photo_type mapping. */
export const FLOOR_PLAN_CAPTION = "floor_plan";

export function photoTypeForKind(kind: RemoteVisionMediaKind): PhotoType {
  if (kind === "after_rendering") return "rendering";
  if (kind === "floor_plan") return "other";
  return "existing";
}

export function kindForPhoto(photo: Pick<PhotoDTO, "photoType" | "caption">): RemoteVisionMediaKind {
  if (photo.caption === FLOOR_PLAN_CAPTION) return "floor_plan";
  if (photo.photoType === "rendering" || photo.photoType === "design") return "after_rendering";
  return "before_photo";
}

/** A durable database photo rendered as a session media item. */
export function mediaFromPhoto(photo: PhotoDTO): RemoteVisionMedia {
  return {
    id: photo.id,
    kind: kindForPhoto(photo),
    fileName: photo.fileName,
    mimeType: photo.mimeType,
    sizeBytes: photo.fileSize,
    previewUrl: null,
    storagePath: photo.storagePath,
    roomHint: null,
    createdAt: photo.createdAt,
    uploadState: "uploaded",
    uploadError: null,
  };
}

/**
 * The database is authoritative for anything that reached storage. A stale
 * device session can never remove or replace a durable row; it may only
 * contribute items that are still local (queued, uploading, or failed), so a
 * contractor never silently loses either side.
 *
 * Local items are de-duplicated by id AND by storage path. Without that, an
 * in-flight item that is also mirrored back into the session appears twice,
 * the mirror re-writes the doubled list, and each render doubles it again —
 * that feedback loop is what produced "hundreds of copies" of one upload.
 */
export function mergeDurableMedia(
  durable: RemoteVisionMedia[],
  local: RemoteVisionMedia[],
): RemoteVisionMedia[] {
  const byPath = new Set(durable.map((m) => m.storagePath).filter(Boolean) as string[]);
  const byId = new Set(durable.map((m) => m.id));
  const seen = new Set<string>();
  const localOnly = local.filter((m) => {
    if (byId.has(m.id)) return false;
    if (m.storagePath && byPath.has(m.storagePath)) return false;
    if (seen.has(m.id)) return false;
    const pathKey = m.storagePath ? `path:${m.storagePath}` : null;
    if (pathKey && seen.has(pathKey)) return false;
    seen.add(m.id);
    if (pathKey) seen.add(pathKey);
    // Videos are persisted as project documents, not photos — keep them.
    if (m.kind === "walkthrough_video") return true;
    return m.uploadState !== "uploaded";
  });
  return [...durable, ...localOnly];
}

