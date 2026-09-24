import { useCallback, useMemo } from "react";
import {
  useNoteMutations,
  useNotesQuery,
} from "@/features/project-workspace/hooks/useProjectWorkspace";
import type { NoteDTO } from "@/features/project-workspace/types";
import { mergeDescriptionBody } from "@/domains/remoteVision/descriptionMerge";

/**
 * Single server-side "Project Description" record per project.
 *
 * Persistence entity: `project_notes` with `note_type = 'project_description'`.
 * One current record per project — saving again updates it instead of
 * appending a duplicate.
 */
export function useProjectDescriptionNote(projectId: string | undefined) {
  const query = useNotesQuery(projectId);
  const mutations = useNoteMutations(projectId ?? "");

  const note = useMemo(() => {
    const rows = (query.data as NoteDTO[] | undefined) ?? [];
    return rows.find((n) => n.noteType === "project_description" && !n.archivedAt) ?? null;
  }, [query.data]);

  const save = useCallback(
    async (body: string) => {
      if (!projectId) throw new Error("No project selected");
      const text = body.trim();
      if (!text) return null;
      if (note) {
        return await mutations.update.mutateAsync({
          id: note.id,
          projectId,
          roomId: null,
          body: text,
          noteType: "project_description",
          isInternal: false,
        });
      }
      return await mutations.create.mutateAsync({
        projectId,
        roomId: null,
        body: text,
        noteType: "project_description",
        isInternal: false,
      });
    },
    [mutations.create, mutations.update, note, projectId],
  );

  /**
   * ADD to the description instead of replacing it. Any capture surface that
   * is "one more input" (photo/video intake, a second walkthrough) must use
   * this — overwriting destroyed contractor-authored content.
   */
  const append = useCallback(
    async (body: string) => {
      const merged = mergeDescriptionBody(note?.body ?? "", body ?? "");
      if (!merged || merged === (note?.body ?? "").trim()) return null;
      return await save(merged);
    },
    [note?.body, save],
  );

  return {
    note,
    text: note?.body ?? "",
    loading: query.isLoading,
    save,
    append,
  };

}
