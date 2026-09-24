import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildOrphanRemovals,
  interpretNarrativeEdit,
  type InterpretationScopeItem,
  type NarrativeInterpretation,
  type ProposedScopeChange,
} from "@/domains/scopeInterpretation";
import { useScopeItemsQuery, useScopeSectionsQuery, useScopeMutations } from "@/features/scope/hooks/useScope";
import type { ScopeItemDTO } from "@/features/scope/types";

/**
 * Narrative editing → structured scope, applied.
 *
 * Interpretation is pure (see `@/domains/scopeInterpretation`); this hook owns
 * only the side effects: creating, updating and excluding scope items through
 * the existing scope server functions.
 *
 * Safety rules enforced here:
 *  - a "remove" is an *exclusion*, never a delete or an archive, so any pricing
 *    already attached to that work survives and stays reviewable;
 *  - an "update" never rewrites the contractor's title, only the measurable
 *    facts (quantity, unit, action) the narrative actually stated;
 *  - anything the pricebook cannot price is created as `needs_verification`.
 */
export interface UseNarrativeInterpretationResult {
  interpretation: NarrativeInterpretation | null;
  pendingText: string | null;
  applying: boolean;
  /** Returns true when structured scope changes need contractor review. */
  begin: (priorText: string, nextText: string) => NarrativeInterpretation;
  cancel: () => void;
  apply: (changes: readonly ProposedScopeChange[]) => Promise<{ applied: number }>;
}

const SECTION_NAME = "Scope updates";

export function useNarrativeInterpretation(projectId: string): UseNarrativeInterpretationResult {
  const itemsQ = useScopeItemsQuery(projectId);
  const sectionsQ = useScopeSectionsQuery(projectId);
  const m = useScopeMutations(projectId);
  const qc = useQueryClient();

  const [interpretation, setInterpretation] = useState<NarrativeInterpretation | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const items: InterpretationScopeItem[] = useMemo(
    () =>
      ((itemsQ.data ?? []) as ScopeItemDTO[])
        .filter((i) => !i.archivedAt)
        .map((i) => ({
          id: i.id,
          sectionId: i.sectionId,
          roomId: i.roomId,
          title: i.title,
          actionKey: i.actionKey,
          quantity: i.quantity,
          unitKey: i.unitKey,
          materialSelection: i.materialSelection,
          isIncluded: i.isIncluded,
        })),
    [itemsQ.data],
  );

  const begin = useCallback(
    (priorText: string, nextText: string) => {
      const diff = interpretNarrativeEdit({ priorText, nextText, items });
      /*
       * The sentence diff only sees this edit. Legacy structured scope that the
       * current narrative never mentions (an old kitchen remodel under a garage
       * conversion, say) is reconciled separately and offered for exclusion.
       */
      const orphans = buildOrphanRemovals(
        { narrativeText: nextText, items },
        { skipItemIds: diff.changes.map((c) => c.targetItemId).filter((id): id is string => !!id) },
      );
      const changes = [...diff.changes, ...orphans];
      const result: NarrativeInterpretation = {
        ...diff,
        isWordingOnly: changes.length === 0,
        changes,
        removed: changes.filter((c) => c.kind === "remove"),
        requiresReview: changes.some((c) => c.requiresReview),
      };
      setInterpretation(result);
      setPendingText(nextText);
      return result;
    },
    [items],
  );

  const cancel = useCallback(() => {
    setInterpretation(null);
    setPendingText(null);
  }, []);

  const apply = useCallback(
    async (changes: readonly ProposedScopeChange[]) => {
      if (changes.length === 0) return { applied: 0 };
      setApplying(true);
      try {
        const sections = (sectionsQ.data ?? []).filter((s) => !s.archivedAt);
        let targetSectionId = sections[0]?.id ?? null;
        const needsSection = changes.some((c) => c.kind === "add");
        if (!targetSectionId && needsSection) {
          const created = (await m.createSection.mutateAsync({
            projectId,
            name: SECTION_NAME,
          })) as { id: string };
          targetSectionId = created?.id ?? null;
        }

        const excludeIds: string[] = [];
        let applied = 0;

        for (const change of changes) {
          if (change.kind === "remove") {
            if (change.targetItemId) excludeIds.push(change.targetItemId);
            continue;
          }

          if (change.kind === "update" && change.targetItemId) {
            const current = ((itemsQ.data ?? []) as ScopeItemDTO[]).find(
              (i) => i.id === change.targetItemId,
            );
            if (!current) continue;
            await m.updateItem.mutateAsync({
              projectId,
              id: current.id,
              sectionId: current.sectionId,
              roomId: current.roomId,
              title: current.title,
              tradeKey: current.tradeKey ?? change.tradeKey,
              categoryKey: current.categoryKey ?? change.categoryKey,
              subcategoryKey: current.subcategoryKey ?? change.subcategoryKey,
              actionKey: change.actionKey ?? current.actionKey,
              description: current.description,
              quantity: change.quantity ?? current.quantity,
              unitKey: change.unitKey ?? current.unitKey,
              materialSelection: current.materialSelection,
              finishSelection: current.finishSelection,
              customerNotes: current.customerNotes,
              internalNotes: current.internalNotes,
              isIncluded: true,
              isClientVisible: current.isClientVisible,
              priority: current.priority,
              confidenceStatus: change.needsPricing ? "needs_verification" : current.confidenceStatus,
              completionStatus: current.completionStatus,
            });
            applied += 1;
            continue;
          }

          if (!targetSectionId) continue;
          await m.createItem.mutateAsync({
            projectId,
            sectionId: targetSectionId,
            title: change.title,
            tradeKey: change.tradeKey,
            categoryKey: change.categoryKey,
            subcategoryKey: change.subcategoryKey,
            actionKey: change.actionKey,
            quantity: change.quantity,
            unitKey: change.unitKey,
            /* Provenance stays internal: the contractor's own wording is the
               visible scope, not a "Note:" echo under every added item. */
            internalNotes: change.sourceText,
            isIncluded: true,
            confidenceStatus: change.needsPricing ? "needs_verification" : "confirmed",
            completionStatus: "draft",
          });
          applied += 1;
        }

        if (excludeIds.length > 0) {
          await m.bulkInclusion.mutateAsync({ projectId, itemIds: excludeIds, isIncluded: false });
          applied += excludeIds.length;
        }

        /* The estimate's scope baseline is now behind: let the banner surface. */
        await qc.invalidateQueries({ queryKey: ["estimating"] });
        setInterpretation(null);
        setPendingText(null);
        return { applied };
      } finally {
        setApplying(false);
      }
    },
    [itemsQ.data, sectionsQ.data, m, projectId, qc],
  );

  return { interpretation, pendingText, applying, begin, cancel, apply };
}
