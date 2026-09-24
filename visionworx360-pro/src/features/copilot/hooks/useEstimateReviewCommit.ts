import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { CopilotRecommendation } from "@/domains/copilot";
import { useScopeMutations, useScopeSectionsQuery } from "@/features/scope/hooks/useScope";
import { useEstimateMutations, useEstimatesQuery } from "@/features/estimating/hooks/useEstimating";

export type ReviewCommitOutcome =
  /** Nothing was decided that was not already a known fact. */
  | "no_changes"
  /** Facts were recorded, but none of them add work, so the range is unchanged. */
  | "facts_only"
  /** Accepted work entered the scope and the active ballpark re-priced. */
  | "recalculated"
  /** Accepted work entered the scope, but there is no editable estimate to price. */
  | "no_estimate";

export interface ReviewCommitResult {
  outcome: ReviewCommitOutcome;
  added: number;
}

/**
 * Finishing Estimate Review must never silently do nothing.
 *
 * Accepted, cost-driving recommendations become real scope items and the
 * ACTIVE estimate is re-priced exactly once through the corrected resolver
 * (`syncEstimateFromScope` -> `refreshBallparkFromScope`), which carries the
 * ballpark history forward untouched. When nothing cost-driving changed, the
 * caller is told why the range stayed the same.
 */
export function useEstimateReviewCommit(projectId: string) {
  const { i18n } = useTranslation();
  const sectionsQ = useScopeSectionsQuery(projectId);
  const scope = useScopeMutations(projectId);
  const estimatesQ = useEstimatesQuery(projectId);
  const estimates = useEstimateMutations(projectId);

  return useCallback(
    async (additions: CopilotRecommendation[]): Promise<ReviewCommitResult> => {
      if (additions.length === 0) return { outcome: "facts_only", added: 0 };

      const sections = (sectionsQ.data ?? []) as { id: string }[];
      let sectionId: string | null = sections[0]?.id ?? null;
      if (!sectionId) {
        const created = (await scope.createSection.mutateAsync({
          projectId,
          title: i18n.language?.startsWith("es") ? "Revisión del estimado" : "Estimate review",
        })) as { id?: string };
        sectionId = created?.id ?? null;
      }
      if (!sectionId) return { outcome: "facts_only", added: 0 };

      for (const rec of additions) {
        await scope.quickAddItem.mutateAsync({
          projectId,
          sectionId,
          title: rec.label.slice(0, 200),
        });
      }

      /* One recalculation, on the active editable document only. */
      const active = (estimatesQ.data ?? []).find((e) => !e.archivedAt && !e.lockedAt);
      if (!active) return { outcome: "no_estimate", added: additions.length };

      await estimates.syncFromScope.mutateAsync({ estimateId: active.id });
      return { outcome: "recalculated", added: additions.length };
    },
    [projectId, sectionsQ.data, scope, estimatesQ.data, estimates, i18n.language],
  );
}
