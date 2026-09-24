import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMediaUnderstanding,
  saveMediaUnderstanding,
} from "../services/mediaUnderstanding.functions";
import {
  EMPTY_MEDIA_UNDERSTANDING,
  type MediaUnderstandingPatch,
  type MediaUnderstandingRecord,
} from "../services/mediaUnderstanding.shared";

export const mediaUnderstandingQueryKey = (projectId: string) => [
  "project-media-understanding",
  projectId,
];

/**
 * Durable read/write access to this project's multimodal understanding.
 *
 * Every estimating surface reads the same record, so the ballpark interview
 * and the detailed estimator can never disagree about what the project's own
 * media and narration said. Observations stay context-only by contract.
 */
export function useProjectMediaUnderstanding(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const fetchRecord = useServerFn(getMediaUnderstanding);
  const saveRecord = useServerFn(saveMediaUnderstanding);

  const query = useQuery({
    queryKey: mediaUnderstandingQueryKey(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const row = await fetchRecord({ data: { projectId: projectId as string } });
      return (row ?? { ...EMPTY_MEDIA_UNDERSTANDING, projectId }) as MediaUnderstandingRecord;
    },
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (patch: MediaUnderstandingPatch) =>
      saveRecord({ data: { projectId: projectId as string, patch } }),
    onSuccess: (record) => {
      if (!projectId) return;
      queryClient.setQueryData(mediaUnderstandingQueryKey(projectId), record);
    },
  });

  const save = useCallback(
    async (patch: MediaUnderstandingPatch) => {
      if (!projectId) return null;
      return mutation.mutateAsync(patch);
    },
    [mutation, projectId],
  );

  const record: MediaUnderstandingRecord = query.data ?? {
    ...EMPTY_MEDIA_UNDERSTANDING,
    projectId: projectId ?? "",
  };

  return {
    record,
    spokenNarration: record.spokenNarration,
    visualObservations: record.visualObservations,
    isLoading: query.isLoading,
    isSaving: mutation.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    save,
  };
}
