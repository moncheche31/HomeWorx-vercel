import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  acceptedRecommendations,
  decisionsFromFacts,
  getCopilotProvider,
  isDeterministicCopilotOnly,
  pendingCount,
  planReviewCommit,
  resolveDecision,
  reviewProject,
  suppressAnsweredRecommendations,
  toContractorPresentation,
  toCustomerPresentation,
  type CopilotDecision,
  type CopilotDecisionMap,
  type CopilotLocale,
  type CopilotScopeItem,
} from "@/domains/copilot";
import { useRoomsQuery } from "@/features/project-workspace/hooks/useProjectWorkspace";
import { useScopeItemsQuery } from "@/features/scope/hooks/useScope";
import { useNarrativeScopeStore } from "@/features/narrative-scope/hooks/useNarrativeScopeStore";

interface RoomRow {
  id: string;
  name: string;
}

/**
 * Module 013 orchestration, on the canonical fact model.
 *
 * Decisions are durable project facts (`review.<itemKey>`), not device state,
 * so a decision survives reload and suppresses the same question in Answer
 * More Questions and the Full Interview.
 */
export function useCopilot(
  projectId: string,
  projectName: string,
  options?: { description?: string; origin?: "walkthrough" | "remote_vision" | "manual" },
) {
  const { i18n } = useTranslation();
  const locale: CopilotLocale = i18n.language?.startsWith("es") ? "es-US" : "en-US";

  const itemsQ = useScopeItemsQuery(projectId);
  const roomsQ = useRoomsQuery(projectId);
  const narrative = useNarrativeScopeStore(projectId);
  const persistedAnswers = useMemo(
    () => narrative.record.answers ?? {},
    [narrative.record.answers],
  );

  /** Decisions taken in this session, before they are committed as facts. */
  const [sessionDecisions, setSessionDecisions] = useState<CopilotDecisionMap>({});

  const rooms = (roomsQ.data as RoomRow[] | undefined) ?? [];

  const items: CopilotScopeItem[] = useMemo(
    () =>
      (itemsQ.data ?? [])
        .filter((it) => it.isIncluded)
        .map((it) => ({
          id: it.id,
          title: it.title,
          roomName: rooms.find((r) => r.id === it.roomId)?.name ?? null,
          materialSelection: it.materialSelection ?? null,
          notes: it.customerNotes ?? null,
        })),
    [itemsQ.data, rooms],
  );

  const fullReview = useMemo(
    () =>
      reviewProject({
        projectName,
        locale,
        origin: options?.origin ?? "manual",
        items,
        description: options?.description,
      }),
    [projectName, locale, items, options?.description, options?.origin],
  );

  /** What is still worth asking: previously decided facts never reappear. */
  const review = useMemo(
    () => suppressAnsweredRecommendations(fullReview, persistedAnswers),
    [fullReview, persistedAnswers],
  );

  const persistedDecisions = useMemo(
    () => decisionsFromFacts(fullReview, persistedAnswers),
    [fullReview, persistedAnswers],
  );

  const decisions = useMemo(
    () => ({ ...persistedDecisions, ...sessionDecisions }),
    [persistedDecisions, sessionDecisions],
  );

  const accepted = useMemo(
    () => acceptedRecommendations(fullReview, decisions),
    [fullReview, decisions],
  );

  const customerPresentation = useMemo(
    () => toCustomerPresentation(fullReview, decisions),
    [fullReview, decisions],
  );

  const contractorPresentation = useMemo(
    () => toContractorPresentation(fullReview, decisions),
    [fullReview, decisions],
  );

  const setDecision = useCallback(
    (id: string, decision: CopilotDecision) =>
      setSessionDecisions((prev) => ({ ...prev, [id]: decision })),
    [],
  );

  const setMany = useCallback((ids: string[], decision: CopilotDecision) => {
    setSessionDecisions((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = decision;
      return next;
    });
  }, []);

  /** Exactly what finishing the review should do — computed, never guessed. */
  const commitPlan = useMemo(
    () => planReviewCommit(fullReview, decisions, persistedAnswers),
    [fullReview, decisions, persistedAnswers],
  );

  /** Persist the decided facts. Returns the plan that was committed. */
  const persistFacts = useCallback(async () => {
    if (!commitPlan.hasFactChange) return commitPlan;
    await narrative.update({ answers: { ...persistedAnswers, ...commitPlan.factPatch } });
    setSessionDecisions({});
    return commitPlan;
  }, [commitPlan, narrative, persistedAnswers]);

  return {
    decisions,
    hydrated: narrative.hydrated,
    locale,
    loading: itemsQ.isLoading,
    error: itemsQ.isError,
    refetch: () => void itemsQ.refetch(),
    providerKey: getCopilotProvider().key,
    aiEnabled: !isDeterministicCopilotOnly(),
    /** Only the undecided recommendations. */
    review,
    /** Every recommendation, decided or not. */
    fullReview,
    accepted,
    pending: pendingCount(review, decisions),
    customerPresentation,
    contractorPresentation,
    commitPlan,
    persistFacts,
    setDecision,
    setMany,
    decisionFor: (id: string) => {
      const rec = fullReview.recommendations.find((r) => r.id === id);
      return rec ? resolveDecision(rec, decisions) : "pending";
    },
  };
}

export type UseCopilotResult = ReturnType<typeof useCopilot>;
