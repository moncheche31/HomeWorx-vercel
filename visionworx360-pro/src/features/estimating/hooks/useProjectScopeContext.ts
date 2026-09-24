import { useMemo } from "react";
import { QUICK_BALLPARK_SCHEMA, type BallparkInterviewSchema } from "@/domains/ballpark";
import {
  buildCurrentProjectScopeContext,
  schemaFromContext,
  type CurrentProjectScopeContext,
  type KnownQuantity,
  type MeasurementFieldId,
  type MeasurementProvenance,
  type QuestionProvenance,
  guardMeasurementFields,
  guardQuestions,
  reportRejections,
  type ScopeSignal,
  type WorkDomain,
} from "@/domains/workScope";
import { useNarrativeScopeStore } from "@/features/narrative-scope/hooks/useNarrativeScopeStore";
import { useOptionalScopeItemsQuery } from "@/features/scope/hooks/useScope";

export interface ProjectScopeContext {
  projectId: string | null;
  /** Everything the CURRENT project's approved scope tells us about the work. */
  signals: ScopeSignal[];
  domains: WorkDomain[];
  /** Measurement fields this scope actually needs, with why. */
  measurementFields: MeasurementFieldId[];
  measurementProvenance: MeasurementProvenance[];
  /** Confirmed work quantities (cabinet run LF, etc.) already known. */
  knownQuantities: KnownQuantity[];
  /** Interview schema filtered down to this scope. */
  schema: BallparkInterviewSchema;
  questionProvenance: QuestionProvenance[];
  /** True when nothing is known about the work yet. */
  isEmpty: boolean;
  /** True when the interview is just the broad "what work?" clarifier. */
  needsScopeClarifier: boolean;
  isLoading: boolean;
}

/**
 * ONE current-project scope context for every estimating surface.
 *
 * Measurements, ballpark questions, refinement, pricing and the proposal all
 * read this. It is derived fresh from the CURRENT project's evidence on every
 * `projectId` change — no module cache, no inherited schema, no generic
 * garage/kitchen fallback when the project has no scope yet.
 */
export interface MultimodalScopeEvidence {
  /** What the contractor said during a walkthrough / video narration. */
  spokenNarration?: string | null;
  /** What was seen in project media. Context only — never creates scope. */
  visualObservations?: string[];
}

export function useProjectScopeContext(
  projectId: string | undefined,
  multimodal?: MultimodalScopeEvidence,
  baseSchema: BallparkInterviewSchema = QUICK_BALLPARK_SCHEMA,
): ProjectScopeContext {
  const scopeItems = useOptionalScopeItemsQuery(projectId, { includedOnly: true });
  const narrative = useNarrativeScopeStore(projectId ?? "");
  const narrativeText = narrative.record?.approvedText || narrative.record?.editedText || null;

  const items = scopeItems.data ?? [];
  const spokenNarration = multimodal?.spokenNarration ?? null;
  /* Stable identity so the context is not rebuilt on every render. */
  const visualObservationsKey = (multimodal?.visualObservations ?? []).join("\u0000");

  const context: CurrentProjectScopeContext = useMemo(
    () =>
      buildCurrentProjectScopeContext(
        {
          projectId: projectId ?? null,
          scopeItems: items.map((item) => ({
            id: item.id,
            key: item.scopeItemKey,
            title: item.title,
            tradeKey: item.tradeKey,
            categoryKey: item.categoryKey,
            description: item.description,
            quantity: item.quantity,
            unitKey: item.unitKey,
          })),
          narrativeText,
          spokenNarration,
          visualObservations: visualObservationsKey ? visualObservationsKey.split("\u0000") : [],
        },
        baseSchema,
      ),
    [projectId, items, narrativeText, spokenNarration, visualObservationsKey, baseSchema],
  );

  /*
   * Central runtime guard: nothing reaches a surface unless it traces back to
   * this project's scope. Rejections are a bug in a producer, so they are
   * reported loudly in dev and filtered everywhere.
   */
  const guarded = useMemo(() => {
    const questions = guardQuestions(context, context.questions);
    const fields = guardMeasurementFields(context, context.measurementFields);
    reportRejections("useProjectScopeContext", [...questions.rejected, ...fields.rejected]);
    return { questions: questions.allowed, fields: fields.allowed as MeasurementFieldId[] };
  }, [context]);

  const schema = useMemo(
    () => schemaFromContext({ ...context, questions: guarded.questions }, baseSchema),
    [context, guarded.questions, baseSchema],
  );

  return {
    projectId: context.projectId,
    signals: context.signals,
    domains: context.domains,
    measurementFields: guarded.fields,
    measurementProvenance: context.measurementProvenance,
    knownQuantities: context.knownQuantities,
    schema,
    questionProvenance: context.questionProvenance,
    isEmpty: context.isEmpty,
    needsScopeClarifier: context.needsScopeClarifier,
    isLoading: scopeItems.isLoading,
  };
}
