import { useCallback, useState } from "react";
import {
  useDocumentMutations,
  useUploadTicket,
} from "@/features/project-workspace/hooks/useProjectWorkspace";

/**
 * Persists a prerecorded walkthrough video into the existing project-media
 * storage architecture (org/project scoped path + signed upload ticket +
 * server-validated finalize). No public URLs are ever created.
 */
export function useRemoteVisionVideoUpload(projectId: string | null) {
  const ticket = useUploadTicket();
  const { finalize } = useDocumentMutations(projectId ?? "");
  const [busyId, setBusyId] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<{ storagePath: string }> => {
      if (!projectId) throw new Error("no_project");
      setBusyId(file.name);
      try {
        const tk = await ticket.mutateAsync({
          kind: "document",
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
          description: "Prerecorded walkthrough video",
          documentType: "other",
        });
        return { storagePath: tk.storagePath };
      } finally {
        setBusyId(null);
      }
    },
    [projectId, ticket, finalize],
  );

  return { upload, busyId, canUpload: !!projectId };
}
