import { useCallback, useMemo, useRef, useState } from "react";
import {
  usePhotosQuery,
  usePhotoMutations,
  useUploadTicket,
} from "@/features/project-workspace/hooks/useProjectWorkspace";
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from "@/features/project-workspace/types";
import type { RemoteVisionMedia, RemoteVisionMediaKind } from "@/domains/remoteVision";
import {
  FLOOR_PLAN_CAPTION,
  mediaFromPhoto,
  mergeDurableMedia,
  photoTypeForKind,
} from "../services/mediaPersistence";

export type MediaSaveState = "idle" | "saving" | "saved" | "error";

/**
 * Durable photo persistence for the photo/video estimate workflow.
 *
 * Photos are uploaded into the org/project-scoped `project-media` bucket and
 * registered as `project_photos` rows — the same architecture the Project
 * Workspace already uses — so they survive reloads, new sessions, and code
 * updates. Local session state is only ever a mirror for in-flight items.
 */
export function useRemoteVisionMedia(projectId: string | null, sessionMedia: RemoteVisionMedia[]) {
  const photosQuery = usePhotosQuery(projectId ?? undefined);
  const ticket = useUploadTicket();
  const { finalize, archive } = usePhotoMutations(projectId ?? "");
  const [pending, setPending] = useState<RemoteVisionMedia[]>([]);
  const [saveState, setSaveState] = useState<MediaSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  /** One upload pass at a time: a re-submit or re-render cannot double-insert. */
  const uploadingRef = useRef(false);

  const durable = useMemo(
    () => (photosQuery.data ?? []).map(mediaFromPhoto),
    [photosQuery.data],
  );

  const media = useMemo(
    () => mergeDurableMedia(durable, [...sessionMedia, ...pending]),
    [durable, sessionMedia, pending],
  );

  const uploadFiles = useCallback(
    async (kind: RemoteVisionMediaKind, files: File[]) => {
      if (!projectId || files.length === 0 || uploadingRef.current) return;
      uploadingRef.current = true;
      setSaveState("saving");
      setSaveError(null);
      let failed: string | null = null;

      for (const file of files) {
        const localId = `pending-${crypto.randomUUID()}`;
        const item: RemoteVisionMedia = {
          id: localId,
          kind,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
          storagePath: null,
          roomHint: null,
          createdAt: new Date().toISOString(),
          uploadState: "uploading",
          uploadError: null,
        };
        setPending((prev) => [...prev, item]);
        try {
          if (file.size > MAX_IMAGE_BYTES) throw new Error("file_too_large");
          if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type))
            throw new Error("unsupported_type");
          const tk = await ticket.mutateAsync({
            kind: "photo",
            projectId,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
          });
          const res = await fetch(tk.signedUrl, {
            method: "PUT",
            body: file,
            headers: { "content-type": file.type },
          });
          if (!res.ok) throw new Error("upload_failed");
          await finalize.mutateAsync({
            projectId,
            roomId: null,
            storagePath: tk.storagePath,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            photoType: photoTypeForKind(kind),
            caption: kind === "floor_plan" ? FLOOR_PLAN_CAPTION : null,
          });
          // The durable row now owns this item; drop the local mirror.
          setPending((prev) => prev.filter((m) => m.id !== localId));
        } catch (err) {
          failed = (err as Error).message || "upload_failed";
          setPending((prev) =>
            prev.map((m) =>
              m.id === localId ? { ...m, uploadState: "error", uploadError: failed } : m,
            ),
          );
        }
      }

      uploadingRef.current = false;
      if (failed) {
        setSaveState("error");
        setSaveError(failed);
      } else {
        setSaveState("saved");
      }
    },
    [projectId, ticket, finalize],
  );

  /** Removing a durable photo archives the row; it is never hard-deleted. */
  const removeMedia = useCallback(
    async (id: string) => {
      const local = pending.find((m) => m.id === id);
      if (local) {
        setPending((prev) => prev.filter((m) => m.id !== id));
        return { durable: false as const };
      }
      const isDurable = durable.some((m) => m.id === id);
      if (isDurable && projectId) {
        await archive.mutateAsync({ projectId, id });
        return { durable: true as const };
      }
      return { durable: false as const };
    },
    [pending, durable, projectId, archive],
  );

  return {
    media,
    durableItems: durable,
    durableCount: durable.length,
    pendingCount: pending.length,
    loading: photosQuery.isLoading,
    saveState,
    saveError,
    uploadFiles,
    removeMedia,
    canPersist: Boolean(projectId),
  };
}
