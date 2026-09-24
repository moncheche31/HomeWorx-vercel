import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveOrgId } from "@/features/crm/hooks/useCrm";
import {
  archiveDocument,
  archiveNote,
  archivePhoto,
  archiveRoom,
  clearProjectCover,
  createNote,
  createRoom,
  createUploadTicket,
  finalizeDocument,
  finalizePhoto,
  getDownloadUrl,
  getSignedUrl,
  listActivity,
  listOrgActivity,
  listDocuments,
  listNotes,
  listPhotos,
  listRooms,
  reorderRooms,
  restoreDocument,
  restoreNote,
  restorePhoto,
  restoreRoom,
  setProjectCover,
  updateDocument,
  updateNote,
  updatePhoto,
  updateRoom,
} from "../services/project-workspace.functions";
import { ensureProjectMediaAnalysis } from "@/features/remote-vision/services/visionUnderstanding.functions";
import { scheduleProjectMediaAnalysis } from "@/features/remote-vision/services/analysisScheduler";
import { mediaUnderstandingQueryKey } from "@/features/remote-vision/hooks/useProjectMediaUnderstanding";
import type {
  CreateNoteInput,
  CreateRoomInput,
  CreateUploadTicketInput,
  FinalizeDocumentInput,
  FinalizePhotoInput,
  UpdateDocumentInput,
  UpdateNoteInput,
  UpdatePhotoInput,
  UpdateRoomInput,
} from "../services/schemas";

/* rooms */
export function useRoomsQuery(projectId: string | undefined, includeArchived = false) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listRooms);
  return useQuery({
    queryKey: ["pw", "rooms", orgId, projectId, includeArchived],
    enabled: !!orgId && !!projectId,
    queryFn: () => fn({ data: { projectId: projectId!, includeArchived } }),
  });
}

export function useRoomMutations(projectId: string) {
  const orgId = useActiveOrgId();
  const qc = useQueryClient();
  const create = useServerFn(createRoom);
  const update = useServerFn(updateRoom);
  const archive = useServerFn(archiveRoom);
  const restore = useServerFn(restoreRoom);
  const reorder = useServerFn(reorderRooms);
  const inval = () => {
    qc.invalidateQueries({ queryKey: ["pw", "rooms", orgId, projectId] });
    qc.invalidateQueries({ queryKey: ["pw", "activity", orgId, projectId] });
  };
  return {
    orgId,
    create: useMutation({ mutationFn: (d: CreateRoomInput) => create({ data: d }), onSuccess: inval }),
    update: useMutation({ mutationFn: (d: UpdateRoomInput) => update({ data: d }), onSuccess: inval }),
    archive: useMutation({
      mutationFn: (d: { projectId: string; id: string }) => archive({ data: d }),
      onSuccess: inval,
    }),
    restore: useMutation({
      mutationFn: (d: { projectId: string; id: string }) => restore({ data: d }),
      onSuccess: inval,
    }),
    reorder: useMutation({
      mutationFn: (d: { projectId: string; orderedIds: string[] }) => reorder({ data: d }),
      onSuccess: inval,
    }),
  };
}

/* notes */
export function useNotesQuery(
  projectId: string | undefined,
  opts: { roomId?: string | null; includeArchived?: boolean; internalOnly?: boolean } = {},
) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listNotes);
  return useQuery({
    queryKey: ["pw", "notes", orgId, projectId, opts],
    enabled: !!orgId && !!projectId,
    queryFn: () =>
      fn({
        data: {
          projectId: projectId!,
          roomId: opts.roomId,
          includeArchived: opts.includeArchived ?? false,
          internalOnly: opts.internalOnly ?? false,
        },
      }),
  });
}

export function useNoteMutations(projectId: string) {
  const orgId = useActiveOrgId();
  const qc = useQueryClient();
  const create = useServerFn(createNote);
  const update = useServerFn(updateNote);
  const archive = useServerFn(archiveNote);
  const restore = useServerFn(restoreNote);
  const inval = () => {
    qc.invalidateQueries({ queryKey: ["pw", "notes", orgId, projectId] });
    qc.invalidateQueries({ queryKey: ["pw", "activity", orgId, projectId] });
  };
  return {
    orgId,
    create: useMutation({ mutationFn: (d: CreateNoteInput) => create({ data: d }), onSuccess: inval }),
    update: useMutation({ mutationFn: (d: UpdateNoteInput) => update({ data: d }), onSuccess: inval }),
    archive: useMutation({
      mutationFn: (d: { projectId: string; id: string }) => archive({ data: d }),
      onSuccess: inval,
    }),
    restore: useMutation({
      mutationFn: (d: { projectId: string; id: string }) => restore({ data: d }),
      onSuccess: inval,
    }),
  };
}

/* photos */
export function usePhotosQuery(projectId: string | undefined, includeArchived = false) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listPhotos);
  return useQuery({
    queryKey: ["pw", "photos", orgId, projectId, includeArchived],
    enabled: !!orgId && !!projectId,
    queryFn: () => fn({ data: { projectId: projectId!, includeArchived } }),
  });
}

export function usePhotoMutations(projectId: string) {
  const orgId = useActiveOrgId();
  const qc = useQueryClient();
  const finalize = useServerFn(finalizePhoto);
  const update = useServerFn(updatePhoto);
  const archive = useServerFn(archivePhoto);
  const restore = useServerFn(restorePhoto);
  const setCover = useServerFn(setProjectCover);
  const clearCover = useServerFn(clearProjectCover);
  const ensureAnalysis = useServerFn(ensureProjectMediaAnalysis);
  const inval = () => {
    qc.invalidateQueries({ queryKey: ["pw", "photos", orgId, projectId] });
    qc.invalidateQueries({ queryKey: ["pw", "activity", orgId, projectId] });
    qc.invalidateQueries({ queryKey: ["project", orgId, projectId] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
  /*
   * Any media change on this project schedules analysis, whatever surface
   * triggered it. The server call is fingerprint-guarded, so an unchanged
   * media set costs nothing, and a failure never surfaces to the uploader.
   */
  const scheduleAnalysis = () => {
    if (!projectId) return;
    scheduleProjectMediaAnalysis(projectId, async (id) => {
      await ensureAnalysis({ data: { projectId: id } });
      qc.invalidateQueries({ queryKey: mediaUnderstandingQueryKey(id) });
    });
  };
  const invalAndAnalyze = () => {
    inval();
    scheduleAnalysis();
  };
  return {
    orgId,
    finalize: useMutation({
      mutationFn: (d: FinalizePhotoInput) => finalize({ data: d }),
      onSuccess: invalAndAnalyze,
    }),
    update: useMutation({ mutationFn: (d: UpdatePhotoInput) => update({ data: d }), onSuccess: inval }),
    archive: useMutation({
      mutationFn: (d: { projectId: string; id: string }) => archive({ data: d }),
      onSuccess: invalAndAnalyze,
    }),
    restore: useMutation({
      mutationFn: (d: { projectId: string; id: string }) => restore({ data: d }),
      onSuccess: invalAndAnalyze,
    }),

    setCover: useMutation({
      mutationFn: (d: { projectId: string; photoId: string }) => setCover({ data: d }),
      onSuccess: inval,
    }),
    clearCover: useMutation({
      mutationFn: (d: { projectId: string }) => clearCover({ data: d }),
      onSuccess: inval,
    }),
  };
}

/* documents */
export function useDocumentsQuery(projectId: string | undefined, includeArchived = false) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listDocuments);
  return useQuery({
    queryKey: ["pw", "docs", orgId, projectId, includeArchived],
    enabled: !!orgId && !!projectId,
    queryFn: () => fn({ data: { projectId: projectId!, includeArchived } }),
  });
}

export function useDocumentMutations(projectId: string) {
  const orgId = useActiveOrgId();
  const qc = useQueryClient();
  const finalize = useServerFn(finalizeDocument);
  const update = useServerFn(updateDocument);
  const archive = useServerFn(archiveDocument);
  const restore = useServerFn(restoreDocument);
  const inval = () => {
    qc.invalidateQueries({ queryKey: ["pw", "docs", orgId, projectId] });
    qc.invalidateQueries({ queryKey: ["pw", "activity", orgId, projectId] });
  };
  return {
    orgId,
    finalize: useMutation({
      mutationFn: (d: FinalizeDocumentInput) => finalize({ data: d }),
      onSuccess: inval,
    }),
    update: useMutation({
      mutationFn: (d: UpdateDocumentInput) => update({ data: d }),
      onSuccess: inval,
    }),
    archive: useMutation({
      mutationFn: (d: { projectId: string; id: string }) => archive({ data: d }),
      onSuccess: inval,
    }),
    restore: useMutation({
      mutationFn: (d: { projectId: string; id: string }) => restore({ data: d }),
      onSuccess: inval,
    }),
  };
}

/* upload ticket + signed urls */
export function useUploadTicket() {
  const fn = useServerFn(createUploadTicket);
  return useMutation({ mutationFn: (d: CreateUploadTicketInput) => fn({ data: d }) });
}

export function useSignedUrl() {
  const fn = useServerFn(getSignedUrl);
  return useMutation({
    mutationFn: (d: { projectId: string; storagePath: string }) => fn({ data: d }),
  });
}

/** Cached signed URL for private storage images. Refreshes within TTL. */
export function useSignedImageQuery(
  projectId: string | undefined,
  storagePath: string | null | undefined,
) {
  const fn = useServerFn(getSignedUrl);
  return useQuery({
    queryKey: ["pw", "signed", projectId, storagePath],
    enabled: !!projectId && !!storagePath,
    queryFn: () => fn({ data: { projectId: projectId!, storagePath: storagePath! } }),
    staleTime: 4 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useDownloadUrl() {
  const fn = useServerFn(getDownloadUrl);
  return useMutation({
    mutationFn: (d: { projectId: string; storagePath: string }) => fn({ data: d }),
  });
}

/* activity */
export function useActivityQuery(projectId: string | undefined) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listActivity);
  return useQuery({
    queryKey: ["pw", "activity", orgId, projectId],
    enabled: !!orgId && !!projectId,
    queryFn: () => fn({ data: { projectId: projectId! } }),
  });
}

/* organization-wide recent activity */
export function useOrgActivityQuery(limit = 15) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listOrgActivity);
  return useQuery({
    queryKey: ["pw", "orgActivity", orgId, limit],
    enabled: !!orgId,
    queryFn: () => fn({ data: { limit } }),
  });
}
