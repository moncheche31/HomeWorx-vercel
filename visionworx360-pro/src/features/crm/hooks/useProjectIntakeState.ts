import { useProjectDescriptionNote } from "@/features/voice-capture/hooks/useProjectDescriptionNote";
import { useScopeItemsQuery } from "@/features/scope/hooks/useScope";
import { useEstimatesQuery } from "@/features/estimating/hooks/useEstimating";

/** A captured description shorter than this is treated as noise, not scope. */
const MEANINGFUL_DESCRIPTION_CHARS = 12;

export interface ProjectIntakeState {
  loading: boolean;
  hasCapturedDescription: boolean;
  hasStructuredScope: boolean;
  hasEstimate: boolean;
  /** True only for a genuinely blank/unstarted project. */
  isUnstarted: boolean;
}

/**
 * Persisted sources of truth for "has this project actually been started?":
 * the project_description note, structured scope items, and estimates.
 * Never inferred from transient UI state.
 */
export function useProjectIntakeState(projectId: string | undefined): ProjectIntakeState {
  const captured = useProjectDescriptionNote(projectId);
  const itemsQ = useScopeItemsQuery(projectId);
  const estimatesQ = useEstimatesQuery(projectId);

  const hasCapturedDescription = captured.text.trim().length >= MEANINGFUL_DESCRIPTION_CHARS;
  const hasStructuredScope = (itemsQ.data ?? []).some((it) => !it.archivedAt);
  const hasEstimate = (estimatesQ.data ?? []).some((e) => !e.archivedAt);
  const loading = captured.loading || itemsQ.isLoading || estimatesQ.isLoading;

  return {
    loading,
    hasCapturedDescription,
    hasStructuredScope,
    hasEstimate,
    isUnstarted: !loading && !hasCapturedDescription && !hasStructuredScope && !hasEstimate,
  };
}
