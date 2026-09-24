import { useCallback, useMemo } from "react";
import type { EstimatingMode } from "@/domains/estimating/modes";
import {
  contractorTradeDecisions,
  evaluateScopeApproval,
  isFindingDecided,
  partitionFindingsByMode,
  validateScope,
  type ScopeDecisionRecord,
  type ScopeFinding,
  type ScopeValidationItem,
} from "@/domains/scopeValidation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useOptionalWorkspace } from "@/features/workspace/providers/WorkspaceProvider";
import { listRooms } from "@/features/project-workspace/services/project-workspace.functions";
import { listScopeItems, listScopeSections } from "../services/scope.functions";
import {
  listScopeValidationDecisions,
  recordScopeValidationDecision,
  type ScopeDecisionDTO,
} from "../services/scopeValidation.functions";
import type { ScopeItemDTO, ScopeSectionDTO } from "../types";

/**
 * Pre-approval scope sanity check.
 *
 * Read-only over scope by design: the hook never rewrites scope items. What it
 * DOES own is the contractor's answers. Those are persisted per issue subject,
 * so fixing one finding can never wipe the answers given to the others — the
 * bug that made the review list refuse to get shorter.
 */
export function toValidationItems(
  items: readonly ScopeItemDTO[],
  sections: readonly ScopeSectionDTO[],
  rooms: readonly { id: string; name: string }[],
  /** Item ids whose trade the contractor has already settled themselves. */
  contractorTraded?: ReadonlySet<string>,
): ScopeValidationItem[] {
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  return items.map((it) => ({
    id: it.id,
    title: it.title,
    description: it.description,
    tradeKey: it.tradeKey ?? sectionById.get(it.sectionId)?.tradeKey ?? null,
    categoryKey: it.categoryKey,
    sectionName: sectionById.get(it.sectionId)?.name ?? null,
    sectionId: it.sectionId,
    originRef: (it as { originRef?: string | null }).originRef ?? null,
    roomId: it.roomId,
    roomName: it.roomId ? (roomById.get(it.roomId)?.name ?? null) : null,
    quantity: it.quantity,
    unitKey: it.unitKey,
    isIncluded: it.isIncluded,
    tradeAssignedBy: contractorTraded?.has(it.id) ? ("contractor" as const) : null,
  }));
}

export function useScopeValidation(
  projectId: string,
  evidenceText?: string | null,
  /**
   * Which estimating mode the contractor is in. Ballpark defers the
   * production/trade-assignment findings so a preliminary number is never
   * gated on them.
   */
  mode: EstimatingMode = "detailed",
) {
  /*
   * Deliberately not reusing the standard scope hooks: this gate renders in
   * surfaces (and tests) that may sit outside the workspace provider, so a
   * missing organization must degrade to "no findings", never throw.
   */
  const orgId = useOptionalWorkspace()?.organization?.id ?? null;
  const queryClient = useQueryClient();
  const itemsFn = useServerFn(listScopeItems);
  const sectionsFn = useServerFn(listScopeSections);
  const roomsFn = useServerFn(listRooms);
  const decisionsFn = useServerFn(listScopeValidationDecisions);
  const recordFn = useServerFn(recordScopeValidationDecision);
  const enabled = !!orgId && !!projectId;
  const itemsQ = useQuery({
    queryKey: ["scope", "items", orgId, projectId, {}],
    enabled,
    queryFn: () => itemsFn({ data: { projectId } }) as Promise<ScopeItemDTO[]>,
  });
  const sectionsQ = useQuery({
    queryKey: ["scope", "sections", orgId, projectId, "all", false],
    enabled,
    queryFn: () =>
      sectionsFn({ data: { projectId, includeArchived: false } }) as Promise<ScopeSectionDTO[]>,
  });
  const roomsQ = useQuery({
    queryKey: ["pw", "rooms", orgId, projectId, false],
    enabled,
    queryFn: () =>
      roomsFn({ data: { projectId, includeArchived: false } }) as Promise<
        { id: string; name: string }[]
      >,
  });
  const decisionsKey = ["scope", "validation-decisions", orgId, projectId] as const;
  const decisionsQ = useQuery({
    queryKey: decisionsKey,
    enabled,
    queryFn: () => decisionsFn({ data: { projectId } }) as Promise<ScopeDecisionDTO[]>,
  });

  /*
   * A contractor's own trade call is authoritative. Their persisted decisions
   * are fed back INTO validation so an improved classifier can never re-open a
   * question they have already answered.
   */
  const contractorTraded = useMemo(
    () =>
      new Set(
        contractorTradeDecisions(
          (decisionsQ.data ?? []).map((d) => ({
            subjectKey: d.subjectKey,
            subjectFingerprint: d.subjectFingerprint,
            decision: d.decision,
            decidedTradeKey: d.decidedTradeKey,
          })),
        ).keys(),
      ),
    [decisionsQ.data],
  );

  const validationItems = useMemo(
    () =>
      toValidationItems(
        itemsQ.data ?? [],
        sectionsQ.data ?? [],
        roomsQ.data ?? [],
        contractorTraded,
      ),
    [itemsQ.data, sectionsQ.data, roomsQ.data, contractorTraded],
  );

  const report = useMemo(
    () =>
      validateScope(validationItems, {
        evidenceText,
        roomNames: (roomsQ.data ?? []).map((r) => r.name),
      }),
    [validationItems, evidenceText, roomsQ.data],
  );

  const decisions: ScopeDecisionRecord[] = useMemo(
    () =>
      (decisionsQ.data ?? []).map((d) => ({
        subjectKey: d.subjectKey,
        subjectFingerprint: d.subjectFingerprint,
        decision: d.decision,
        decidedTradeKey: d.decidedTradeKey,
      })),
    [decisionsQ.data],
  );

  const recordMutation = useMutation({
    mutationFn: (input: {
      subjectKey: string;
      subjectFingerprint: string;
      findingKind: string;
      decision: "kept" | "reassigned" | "dismissed";
      decidedTradeKey?: string | null;
      itemIds: string[];
    }) => recordFn({ data: { projectId, ...input } }) as Promise<ScopeDecisionDTO>,
    onSuccess: (saved) => {
      /* Merge locally so the row disappears immediately, then reconcile. */
      queryClient.setQueryData<ScopeDecisionDTO[]>(decisionsKey, (prev) => [
        ...(prev ?? []).filter((d) => d.subjectKey !== saved.subjectKey),
        saved,
      ]);
      void queryClient.invalidateQueries({ queryKey: decisionsKey });
    },
  });

  const decide = useCallback(
    async (
      finding: ScopeFinding,
      decision: "kept" | "reassigned" | "dismissed",
      decidedTradeKey?: string | null,
    ) => {
      await recordMutation.mutateAsync({
        subjectKey: finding.subjectKey,
        subjectFingerprint: finding.subjectFingerprint,
        findingKind: finding.kind,
        decision,
        decidedTradeKey: decidedTradeKey ?? null,
        itemIds: [...finding.itemIds],
      });
    },
    [recordMutation],
  );

  /* Bulk "looks right" only ever clears what THIS mode actually reviews. */
  const staged = useMemo(
    () => partitionFindingsByMode(report.findings, mode),
    [report.findings, mode],
  );

  const decideAll = useCallback(async () => {
    for (const finding of staged.active) {
      if (isFindingDecided(finding, decisions)) continue;
      await decide(finding, "kept");
    }
  }, [staged.active, decisions, decide]);

  const decidedSubjectKeys = useMemo(
    () =>
      report.findings.filter((f) => isFindingDecided(f, decisions)).map((f) => f.subjectKey),
    [report.findings, decisions],
  );

  const evaluation = useMemo(
    () => evaluateScopeApproval(report, { decisions, mode }),
    [report, decisions, mode],
  );

  return {
    isLoading: enabled && (itemsQ.isLoading || sectionsQ.isLoading || decisionsQ.isLoading),
    items: itemsQ.data ?? [],
    report,
    mode,
    decision: evaluation,
    /** Findings this mode reviews now. */
    activeFindings: staged.active,
    /** Findings postponed to the detailed estimate — optional, non-blocking. */
    deferredFindings: staged.deferred,
    decisions,
    decidedSubjectKeys,
    isSaving: recordMutation.isPending,
    decide,
    decideAll,
  };
}
