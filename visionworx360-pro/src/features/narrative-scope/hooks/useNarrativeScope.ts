import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  applyTerminologyMemory,
  inferCorrectionContext,
  type TerminologyCorrection,
} from "@/domains/terminologyMemory";
import {
  useTerminologyCorrectionMutations,
  useTerminologyCorrectionsQuery,
} from "@/features/terminology/hooks/useTerminologyCorrections";

import {
  answeredQuestions,
  detectQuestions,
  generateNarrative,
  rawAnswerFragments,
  stripScopeArtifacts,
  summarizeDecisions,
  type DecisionSummary,

  type NarrativeDocument,
  type NarrativeLocale,
  type NarrativeQuestion,
  type NarrativeSourceItem,
} from "@/domains/narrativeScope";

import { computeScopeFingerprint } from "@/domains/estimating/scopeSync";
import { useRoomsQuery } from "@/features/project-workspace/hooks/useProjectWorkspace";
import { useScopeItemsQuery, useScopeSectionsQuery } from "@/features/scope/hooks/useScope";
import { useProjectGeometry } from "@/features/estimating/hooks/useMeasurements";
import {
  approveRecord,
  invalidateApprovalRecord,
  useNarrativeScopeStore,
} from "./useNarrativeScopeStore";

interface RoomRow {
  id: string;
  name: string;
}

export interface UseNarrativeScopeResult {
  loading: boolean;
  error: boolean;
  generated: NarrativeDocument;
  /** What the contractor sees: their edit if any, otherwise the generated text. */
  displayText: string;
  questions: NarrativeQuestion[];
  /** Questions already answered — reopened for review, never re-asked blank. */
  answeredQuestions: NarrativeQuestion[];
  hasItems: boolean;
  record: ReturnType<typeof useNarrativeScopeStore>["record"];
  hydrated: boolean;
  /** Fingerprint of the structured scope currently on screen. */
  scopeFingerprint: string;
  /**
   * Prior approval no longer matches the structured scope. Wording-only edits
   * never set this; applied construction/scope changes always do.
   */
  needsReapproval: boolean;
  /** Review/clarification decision counts, for the history surface only. */
  decisionSummary: DecisionSummary;

  approve: () => Promise<unknown>;
  /** Clear the current approval because structured scope changed. */
  invalidateApproval: () => Promise<unknown>;
  /** Durable: resolves only once the wording is stored in the database. */
  saveWording: (text: string) => Promise<unknown>;
  regenerate: () => Promise<unknown>;
  saveAnswers: (answers: Record<string, string>) => Promise<unknown>;
  refetch: () => void;
}

export function useNarrativeScope(
  projectId: string,
  projectName: string,
  audience: "contractor" | "customer" = "contractor",
): UseNarrativeScopeResult {
  const { i18n } = useTranslation();
  const locale: NarrativeLocale = i18n.language?.startsWith("es") ? "es-US" : "en-US";

  const sectionsQ = useScopeSectionsQuery(projectId);
  const itemsQ = useScopeItemsQuery(projectId);
  const roomsQ = useRoomsQuery(projectId);
  const geometryQ = useProjectGeometry(projectId);
  const { record, hydrated, update } = useNarrativeScopeStore(projectId);

  /**
   * CORRECTION MEMORY, consulted FIRST.
   *
   * Before any scope wording is shown for approval, the contractor's saved
   * corrections get a chance to restore his own vocabulary. Purely a wording
   * filter: when nothing matches, the text is exactly what it was before.
   */
  const correctionsQ = useTerminologyCorrectionsQuery();
  const { recordUse } = useTerminologyCorrectionMutations();
  const corrections: TerminologyCorrection[] = useMemo(
    () =>
      (correctionsQ.data ?? [])
        .filter((c) => c.isActive)
        .map((c) => ({
          id: c.id,
          wrongTerm: c.wrongTerm,
          correctedTerm: c.correctedTerm,
          triggerPhrase: c.triggerPhrase ?? null,
          contextScope: c.contextScope,
          tradeKey: c.tradeKey ?? null,
          captureMethod: c.captureMethod,
          isActive: true,
        })),
    [correctionsQ.data],
  );

  const rawItems: NarrativeSourceItem[] = useMemo(
    () =>
      (itemsQ.data ?? []).map((it) => ({
        id: it.id,
        title: it.title,
        actionKey: it.actionKey,
        quantity: it.quantity,
        unitKey: it.unitKey,
        materialSelection: it.materialSelection,
        customerNotes: it.customerNotes,
        roomId: it.roomId,
        sectionId: it.sectionId,
        isIncluded: it.isIncluded,
        isClientVisible: it.isClientVisible,
        confidenceStatus: it.confidenceStatus,
        sortOrder: it.sortOrder,
      })),
    [itemsQ.data],
  );

  const narration = useMemo(
    () =>
      [record.editedText ?? "", record.approvedText ?? "", ...rawItems.map((i) => i.title)]
        .filter(Boolean)
        .join(" "),
    [record.editedText, record.approvedText, rawItems],
  );

  const { items, firedCorrectionIds } = useMemo(() => {
    if (corrections.length === 0) return { items: rawItems, firedCorrectionIds: [] as string[] };
    const fired: string[] = [];
    const rewrite = (value: string | null, tradeKey?: string | null): string | null => {
      if (!value?.trim()) return value;
      const { term, match } = applyTerminologyMemory(corrections, {
        candidateTerm: value,
        narration,
        context: inferCorrectionContext(`${value} ${narration}`),
        tradeKey: tradeKey ?? null,
      });
      if (match) fired.push(match.correction.id);
      return term;
    };
    const next = rawItems.map((it) => ({
      ...it,
      title: rewrite(it.title) ?? it.title,
      materialSelection: rewrite(it.materialSelection),
      customerNotes: rewrite(it.customerNotes),
    }));
    return { items: next, firedCorrectionIds: [...new Set(fired)] };
  }, [corrections, rawItems, narration]);

  /* Usage counters follow real applications, never mere page views. */
  const firedKey = firedCorrectionIds.join(",");
  const recordedRef = useRef<string>("");
  useEffect(() => {
    if (!firedKey || recordedRef.current === firedKey) return;
    recordedRef.current = firedKey;
    recordUse.mutate({ ids: firedKey.split(",") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firedKey]);


  const generated = useMemo(
    () =>
      generateNarrative({
        projectName,
        locale,
        audience,
        answers: record.answers,
        items,
        sections: (sectionsQ.data ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          roomId: s.roomId,
          sortOrder: s.sortOrder,
        })),
        rooms: ((roomsQ.data as RoomRow[] | undefined) ?? []).map((r) => ({
          id: r.id,
          name: r.name,
        })),
      }),
    [projectName, locale, audience, record.answers, items, sectionsQ.data, roomsQ.data],
  );

  /**
   * Contractor-facing text is always free of workflow artifacts — decision
   * statuses, orphan answer fragments and echoed "Note:" lines — including
   * wording saved before these rules existed. Self-healing on read, so a
   * repeated save can never carry a legacy artifact forward.
   */
  const answerFragments = useMemo(() => rawAnswerFragments(record.answers), [record.answers]);
  const displayText = useMemo(
    () => stripScopeArtifacts(record.editedText ?? generated.text, answerFragments),
    [record.editedText, generated.text, answerFragments],
  );

  /** Decision history for the secondary details surface, never for the scope. */
  const decisionSummary = useMemo(() => summarizeDecisions(record.answers), [record.answers]);


  /**
   * Reconcile against every known fact before asking anything: structured
   * scope, the narrative the contractor already wrote, prior answers, and
   * whether project geometry exists (which makes measurement prompts moot).
   */
  const questions = useMemo(
    () =>
      detectQuestions({
        items,
        answers: record.answers,
        narrativeText: displayText,
        projectName,
        hasGeometry: !!geometryQ.record,
        geometry: geometryQ.record ?? null,
      }),
    [items, record.answers, displayText, projectName, geometryQ.record],
  );


  /**
   * Prior answers, restored as reviewable questions. Completion state lives in
   * the persisted narrative record, so refresh/navigation cannot reset it.
   */
  const priorQuestions = useMemo(
    () =>
      answeredQuestions({
        items,
        answers: record.answers,
        narrativeText: displayText,
        projectName,
        hasGeometry: !!geometryQ.record,
        geometry: geometryQ.record ?? null,
      }),
    [items, record.answers, displayText, projectName, geometryQ.record],
  );

  const scopeFingerprint = useMemo(
    () => computeScopeFingerprint((itemsQ.data ?? []) as never),
    [itemsQ.data],
  );

  /**
   * Approval invalidation: only a structured-scope difference counts. Rewording
   * the narrative leaves the fingerprint untouched, so the approval survives.
   */
  const lastApproval = (record.approvalHistory ?? [])[(record.approvalHistory ?? []).length - 1];
  const needsReapproval = record.approvedAt
    ? record.approvedScopeFingerprint !== null &&
      record.approvedScopeFingerprint !== scopeFingerprint
    : lastApproval?.invalidatedReason === "scope_changed";

  return {
    loading: sectionsQ.isLoading || itemsQ.isLoading,
    error: sectionsQ.isError || itemsQ.isError,
    generated,
    displayText,
    questions,
    answeredQuestions: priorQuestions,
    hasItems: items.some((i) => i.isIncluded),
    record,
    hydrated,
    scopeFingerprint,
    needsReapproval,
    decisionSummary,
    approve: () => update(approveRecord(record, { text: displayText, scopeFingerprint })),
    invalidateApproval: () => update(invalidateApprovalRecord(record)),
    /* The contractor's own wording is the scope. We only drop workflow
       artifacts (decision statuses, echoed notes) — never their sentences. */
    saveWording: (text: string) => update({ editedText: stripScopeArtifacts(text) }),
    regenerate: () => update({ editedText: null }),


    saveAnswers: (answers: Record<string, string>) =>
      update({ answers: { ...record.answers, ...answers }, editedText: null }),
    refetch: () => {
      void sectionsQ.refetch();
      void itemsQ.refetch();
    },
  };
}
