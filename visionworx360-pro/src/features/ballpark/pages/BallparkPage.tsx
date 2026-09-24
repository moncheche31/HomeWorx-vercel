import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { refreshBallparkAfterClarification } from "@/features/estimating/services/estimating.functions";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ProjectStep } from "@/features/walkthrough/components/ProjectStep";
import { usePreselectedProject } from "@/features/crm/hooks/usePreselectedProject";
import {
  useMeasurementMutations,
  useProjectGeometry,
} from "@/features/estimating/hooks/useMeasurements";
import {
  BALLPARK_ENGINE_VERSION,
  adjustMeasurement,

  buildMultiInputBallpark,
  improveAccuracyQuestionIds,
  improveAccuracySelectionAnswers,
  cabinetsConfirmed as evidenceHasCabinets,
  confirmMeasurement,
  emptyHistory,
  inferMeasurements,
  isIntakeSource,
  recordRefinement,
  refineWithMeasurements,
  reconcileAnswerIntegrity,
  controlledGeometryPatch,

  schemaForSource,
  type BallparkHistory,
  type BallparkAnswers,
  analyzePhotoPackage,
  type InferenceEvidence,
  type PhotoKind,
  transcriptsFromAnswers,
  type DurableBallparkSession,
} from "@/domains/ballpark";
import type { Json } from "@/integrations/supabase/types";
import { useNarrativeScopeStore } from "@/features/narrative-scope/hooks/useNarrativeScopeStore";
import { withBallparkHistory } from "@/domains/ballpark/snapshotHistory";
import { useBallparkSession } from "../hooks/useBallparkSession";
import { useBallparkFlow } from "../hooks/useBallparkFlow";
import { useDurableBallparkSession } from "../hooks/useDurableBallparkSession";
import { useBallparkBaseline } from "../hooks/useBallparkBaseline";
import { BallparkQuestionCard } from "../components/BallparkQuestionCard";
import { BallparkResultCard } from "../components/BallparkResultCard";
import { IntakeSourceChooser } from "../components/IntakeSourceChooser";
import { PhotoIntakePanel } from "../components/PhotoIntakePanel";
import { PhotoAnalysisSummary } from "../components/PhotoAnalysisSummary";
import { AssumptionsReviewPanel } from "../components/AssumptionsReviewPanel";
import { PhotoInferenceSummary } from "../components/PhotoInferenceSummary";
import { DescriptionIntakePanel } from "../components/DescriptionIntakePanel";
import { categorizeBallparkSaveError } from "../services/saveErrors";
import { useScopeItemsQuery } from "@/features/scope/hooks/useScope";
import { useProjectScopeContext } from "@/features/estimating/hooks/useProjectScopeContext";
import { useProjectMediaUnderstanding } from "@/features/remote-vision/hooks/useProjectMediaUnderstanding";
import { visualObservationsToScopeText } from "@/features/remote-vision/services/mediaUnderstanding.shared";
import {
  eligibleBallparkQuestionIds,
  hasSubstantiveAnswerChange,
  resolveProjectFacts,
} from "@/domains/projectFacts";
import { logger } from "@/lib/logging/logger";

/**
 * The Multi-Input Ballpark: on site, from photos, or from a description.
 *
 * All three paths run the same question engine, the same assumption ledger and
 * the same preliminary range. Photo scale inference feeds that engine as
 * normalized measurements — it never prices anything itself.
 *
 * Where the contractor is in the flow is an explicit, persisted stage rather
 * than something inferred from component state. That is what stops a refresh
 * (or any remount) from throwing a finished questionnaire back to "How are you
 * estimating this job?".
 */
export function BallparkPage() {
  const { t, i18n } = useTranslation("ballpark");
  const navigate = useNavigate();
  const preselected = usePreselectedProject();
  const searchSource = (preselected as { source?: unknown }).source;

  const [projectId, setProjectId] = useState<string | null>(preselected.projectId ?? null);
  const [projectName, setProjectName] = useState<string | null>(preselected.projectName ?? null);
  const [history, setHistory] = useState<BallparkHistory>(() => emptyHistory());
  const estimateId = preselected.estimateId ?? null;
  const durable = useDurableBallparkSession(estimateId);
  const serverSession = durable.query.data ?? null;
  const waitForSession = Boolean(estimateId && durable.query.isLoading);
  const resumeIntent = preselected.resume;

  /*
   * Autosave updates the durable-session query cache. That response must not
   * become the new comparison baseline or the just-edited answers appear
   * unchanged and the preview snaps back to the saved band. Freeze the answers
   * that existed when this edit run opened; only an explicit completion starts
   * a new pricing baseline.
   */
  const openedEstimateRef = useRef<string | null>(estimateId);
  const openedAnswersRef = useRef<BallparkAnswers | null>(null);
  if (openedEstimateRef.current !== estimateId) {
    openedEstimateRef.current = estimateId;
    openedAnswersRef.current = null;
  }
  if (!waitForSession && openedAnswersRef.current === null) {
    openedAnswersRef.current = { ...(serverSession?.answers ?? {}) };
  }

  const flow = useBallparkFlow(
    projectId,
    isIntakeSource(searchSource) ? searchSource : null,
    estimateId,
    serverSession,
    waitForSession,
  );
  const source = flow.source;

  const sourceSchema = useMemo(() => schemaForSource(source ?? "onsite"), [source]);
  const interviewType = resumeIntent !== "interview" && source === "photos" && flow.clarifications.length > 0
    ? "photo_clarification" as const
    : "full_refinement" as const;

  /*
   * Canonical project facts. Full Interview means "review unresolved
   * decisions", not "restart intake": anything the project already knows —
   * geometry, structured scope, prior answers — suppresses its question here
   * exactly as it does in Scope of Work -> Answer More Questions.
   */
  const geometryQuery = useProjectGeometry(projectId ?? undefined);
  const scopeItemsQuery = useScopeItemsQuery(projectId ?? undefined);
  /** Approved narrative counts as scope when no structured rows exist yet. */
  const narrativeStore = useNarrativeScopeStore(projectId ?? "");
  const narrativeText =
    narrativeStore.record?.approvedText || narrativeStore.record?.editedText || null;
  /**
   * Questions are constrained to the work this project actually contains, so
   * a cabinet job is never asked garage-conversion questions.
   */
  const mediaUnderstanding = useProjectMediaUnderstanding(projectId ?? undefined);
  const multimodalEvidence = useMemo(
    () => ({
      spokenNarration: mediaUnderstanding.spokenNarration,
      visualObservations: visualObservationsToScopeText(mediaUnderstanding.visualObservations),
    }),
    [mediaUnderstanding.spokenNarration, mediaUnderstanding.visualObservations],
  );
  const scopeContext = useProjectScopeContext(projectId ?? undefined, multimodalEvidence, sourceSchema);
  const schema = scopeContext.schema;

  const facts = useMemo(
    () =>
      resolveProjectFacts({
        projectName,
        geometry: geometryQuery.record ?? null,
        items: (scopeItemsQuery.data ?? []).map((item) => ({
          title: item.title,
          materialSelection: item.materialSelection,
          customerNotes: item.customerNotes,
          isIncluded: item.isIncluded,
        })),
        narrativeText: [narrativeText, mediaUnderstanding.spokenNarration].filter(Boolean).join("\n"),
        priorAnswers: serverSession?.schemaKey === schema.key ? serverSession.answers : null,
      }),
    [
      projectName,
      geometryQuery.record,
      scopeItemsQuery.data,
      narrativeText,
      mediaUnderstanding.spokenNarration,
      serverSession?.answers,
      serverSession?.schemaKey,
      schema.key,
    ],
  );

  /** The 0-5 decisions still worth asking, shared with every other entry point. */
  const remainingQuestionIds = useMemo(
    () => eligibleBallparkQuestionIds(schema.questions.map((q) => q.id), facts),
    [schema, facts],
  );
  const isFullInterview = resumeIntent === "interview";
  /**
   * PILOT SAFETY GATE: the "Improve accuracy" refinement path is hidden from
   * the pilot UI. The selector and its domain code stay intact; this flag is
   * the single switch that keeps contractors out of the frozen-subset path.
   */
  const IMPROVE_ACCURACY_ENABLED = false as boolean;
  const isImproveAccuracy = IMPROVE_ACCURACY_ENABLED && resumeIntent === "inputs";
  const savedAnswersForSelection = useMemo(
    () =>
      improveAccuracySelectionAnswers({
        savedAnswers: serverSession?.answers ?? null,
        savedSchemaKey: serverSession?.schemaKey ?? null,
        schemaKey: schema.key,
        measured: geometryQuery.record ?? null,
        domains: scopeContext.domains,
      }),
    [
      serverSession?.answers,
      serverSession?.schemaKey,
      schema.key,
      geometryQuery.record,
      scopeContext.domains,
    ],
  );
  const improveAccuracyIds = useMemo(
    () => improveAccuracyQuestionIds(schema, savedAnswersForSelection),
    [schema, savedAnswersForSelection],
  );
  /** Explicit opt-in to re-open every question, even already-known ones. */
  const [reviewAll, setReviewAll] = useState(false);
  const nothingLeftToAsk =
    isFullInterview && !reviewAll && remainingQuestionIds.length === 0;
  /* The photo path asks only the frozen high-value set; other paths ask all. */
  const session = useBallparkSession(
    projectId,
    schema,
    interviewType === "photo_clarification"
      ? flow.clarifications
      : isFullInterview && !reviewAll && remainingQuestionIds.length > 0
        ? remainingQuestionIds
        : isImproveAccuracy && !reviewAll && improveAccuracyIds.length > 0
          ? improveAccuracyIds
          : undefined,
    estimateId,
    serverSession,
    interviewType,
    waitForSession,
  );
  const record = geometryQuery.record;
  const { saveMeasurements } = useMeasurementMutations(projectId ?? "");
  const refreshCanonical = useServerFn(refreshBallparkAfterClarification);
  const queryClient = useQueryClient();

  /*
   * One reconciled set of facts drives everything below (results, assumptions,
   * confirmed values, derived geometry).
   *
   * 1. A transcript and its stored value may never disagree — the contractor's
   *    own words are re-read and win, or the answer is held for review.
   * 2. Measurements refine what the interview only assumed, but never overwrite
   *    a value the contractor stated.
   */
  const reconciled = useMemo(
    () =>
      reconcileAnswerIntegrity(
        schema,
        session.answers,
        i18n.language?.startsWith("es") ? "es-US" : "en-US",
      ).answers,
    [schema, session.answers, i18n.language],
  );
  const answers = useMemo(
    () => refineWithMeasurements(reconciled, record ?? null).answers,
    [reconciled, record],
  );


  const answerValue = (id: string): string | null => {
    const a = answers[id];
    return a?.status === "answered" && a.value != null ? String(a.value) : null;
  };
  const answeredRoomType = answerValue("roomType");
  const answeredSizeClass = answerValue("sizeClass");

  /* What the contractor has actually confirmed gates what may be inferred. */
  const evidence: InferenceEvidence = useMemo(
    () => ({
      cabinetsPresent: (answerValue("obs.cabinetsPresent") as InferenceEvidence["cabinetsPresent"]) ?? null,
      cabinetsScope: answerValue("cabinets"),
      backsplashPresent: (answerValue("obs.backsplashPresent") as InferenceEvidence["backsplashPresent"]) ?? null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answers],
  );
  const hasCabinets = evidenceHasCabinets(evidence);

  /** A sketch or rendering never gets object-scale heuristics. */
  const photoKind: PhotoKind = useMemo(() => {
    const counts = new Map<PhotoKind, number>();
    for (const photo of flow.photos) counts.set(photo.kind, (counts.get(photo.kind) ?? 0) + 1);
    let dominant: PhotoKind = "room_photo";
    let best = -1;
    for (const [kind, count] of counts) {
      if (count > best) {
        dominant = kind;
        best = count;
      }
    }
    return dominant;
  }, [flow.photos]);

  /**
   * The automatic-first read of the uploaded package: what these images are,
   * what the job probably is, and which few questions are worth asking. It
   * never reads pixels and never prices anything.
   */
  const analysis = useMemo(
    () =>
      analyzePhotoPackage({
        photos: flow.photos.map(({ id, name, kind }) => ({ id, name, kind })),
        roomType: answeredRoomType,
        sizeClass: answeredSizeClass,
        answers,
        overriddenKeys: Object.keys(flow.corrections),
      }),
    [flow.photos, flow.corrections, answeredRoomType, answeredSizeClass, answers],
  );

  /**
   * Photo analysis, then corrections. Kept out of the pricing path: the engine
   * only ever sees the normalized measurements this produces.
   */
  const inference = useMemo(() => {
    if (source !== "photos" || flow.photos.length === 0) return null;
    let result = inferMeasurements({
      observations: flow.observations,
      roomType: answeredRoomType,
      sizeClass: answeredSizeClass,
      photoIds: flow.photos.map((photo) => photo.id),
      photoKind,
      evidence,
    });
    for (const [key, correction] of Object.entries(flow.corrections)) {
      result =
        correction === "confirm"
          ? confirmMeasurement(result, key)
          : adjustMeasurement(result, key, correction);
    }
    return result;
  }, [
    source,
    flow.photos,
    flow.observations,
    flow.corrections,
    answeredRoomType,
    answeredSizeClass,
    photoKind,
    evidence,
  ]);

  const result = useMemo(
    () =>
      buildMultiInputBallpark({
        source: source ?? "onsite",
        answers,
        description: flow.description || null,
        photoCount: flow.photos.length,
        inference,
        options: { schema },
      }),
    [answers, source, flow.description, flow.photos.length, inference, schema],
  );

  /*
   * Re-opening the interview is not a pricing event. Until a fact actually
   * changes, the results screen shows the CURRENT saved snapshot — never the
   * history chain, and never a fresh intake recompute that would silently
   * undo a scope-derived recalculation.
   */
  const factsChanged = useMemo(
    () =>
      Boolean(serverSession?.schemaKey && serverSession.schemaKey !== schema.key) ||
      hasSubstantiveAnswerChange(openedAnswersRef.current, session.answers),
    [session.answers, serverSession?.schemaKey, schema.key],
  );
  const sessionSnapshot = serverSession?.rangeSnapshot ?? null;
  const baseline = useBallparkBaseline({
    estimateId,
    projectId,
    sessionSnapshot,
    computedBand: result.band,
    factsChanged,
    schemaKey: schema.key,
    savedSchemaKey: serverSession?.schemaKey ?? null,
  });
  const { baselineSnapshot, preview } = baseline;
  const waitForServer = Boolean(
    estimateId && (durable.query.isLoading || baseline.estimateQuery.isLoading),
  );

  const rangeSnapshot = useMemo(() => ({
    kind: "ballpark" as const,
    mode: "ballpark" as const,
    engineVersion: BALLPARK_ENGINE_VERSION,
    currency: result.currency,

    calculatedAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    intakeMethod: source,
    band: result.band,
    confidence: result.confidence,
    unknownWidenPct: result.unknownWidenPct,
    assumptions: result.assumptions as unknown as Json[],
    unknowns: result.unknowns as unknown as Json[],
    quantities: result.quantities as unknown as Json[],
    geometry: result.derived.geometryInput as unknown as Record<string, Json | undefined>,
    isSampleData: result.isSampleData,
    source: "intake",
  }) as unknown as Record<string, Json | undefined>, [result, source]);

  /*
   * History is reference, never a working value. An intake re-run may add a new
   * band, but it must never erase the chain a scope-derived recalculation built.
   */
  const rangeSnapshotWithHistory = useMemo(
    () => withBallparkHistory(rangeSnapshot, baselineSnapshot),
    [rangeSnapshot, baselineSnapshot],
  );

  const durablePayload = (
    stage = flow.stage,
    currentQuestionId: string | null = session.currentId,
  ): DurableBallparkSession | null => {
    if (!estimateId || !projectId || !source) return null;
    /* The durable session only knows four stages; the assumptions review is a
       sub-step of "review" and is persisted as such. */
    const persistedStage = stage === "assumptions" ? "review" : stage;
    const inferredValues = Object.fromEntries(
      (result.ledger.inferred ?? []).map((item) => [item.key, item as unknown as Json]),
    );
    const assumedValues = Object.fromEntries(
      (result.ledger.assumed ?? []).map((item) => [item.key, item as unknown as Json]),
    );
    const confirmedValues = Object.fromEntries(
      Object.entries(answers)
        .filter(([, answer]) => answer?.status === "answered")
        .map(([key, answer]) => [key, answer?.value ?? null]),
    );
    return {
      schemaKey: schema.key,
      schemaVersion: 1,
      estimateId,
      projectId,
      intakeSource: source,
      currentStage: persistedStage,
      interviewType,
      frozenQuestionIds: session.frozenQuestionIds,
      currentQuestionId,
      /* Reconciled answers only: the saved session can never hold a value that
         contradicts the contractor's transcript. */
      answers: reconciled,
      transcripts: transcriptsFromAnswers(reconciled),
      photoReferences: flow.photos.map(({ id, name, kind }) => ({ id, name, kind })),
      photoAnalysis: analysis as unknown as Record<string, Json | undefined>,
      confirmedValues,
      inferredValues,
      assumedValues,
      contractorOverrides: flow.corrections,
      derivedGeometry: result.derived.geometryInput as unknown as Record<string, Json | undefined>,
      derivedQuantities: result.quantities as unknown as Json[],
      unknowns: result.unknowns as unknown as Json[],
      rangeInputs: {
        sourceWidenPct: result.sourceWidenPct,
        totalWidenPct: result.totalWidenPct,
        footprintAssumed: result.footprintAssumed,
        footprintInferred: result.footprintInferred,
      },
      rangeSnapshot: baselineSnapshot as Record<string, Json | undefined> | null,
      draftPreview: rangeSnapshot,
      confidence: result.confidence,
      description: flow.description,
      observations: flow.observations as unknown as Json[],
      corrections: flow.corrections,
      clarifications: flow.clarifications,
      updatedAt: new Date().toISOString(),
    };
  };

  const autosave = async (stage = flow.stage, currentQuestionId = session.currentId) => {
    const payload = durablePayload(stage, currentQuestionId);
    if (!payload || !navigator.onLine) return;
    try {
      await durable.persist.mutateAsync(payload);
    } catch (error) {
      /* A failed draft save never touches the interview: the answer, the
         current question and the local draft all stay exactly as they are. */
      const failure = categorizeBallparkSaveError(error);
      logger.error("ballpark.draft_save_failed", {
        reference: failure.reference,
        category: failure.category,
        cause: failure.cause,
        estimateId,
      });
      toast.error(t(`saveError.${failure.category}`, { reference: failure.reference }));
    }
  };

  /*
   * Resume intents from the estimate page. "inputs" and "interview" both
   * reopen the saved interview with prior answers in place; only the explicit
   * "chooser" intent is allowed back to "How are you estimating this job?".
   */
  const [resumeApplied, setResumeApplied] = useState(false);
  const [editingInputs, setEditingInputs] = useState(false);

  useEffect(() => {
    if (resumeApplied || !resumeIntent || !flow.hydrated || !session.hydrated) return;
    setResumeApplied(true);
    if (resumeIntent === "chooser") {
      flow.reset();
      return;
    }
    const firstUnanswered = session.questions.find(
      (q) => session.answers[q.id]?.status !== "answered",
    );
    const savedId = durable.query.data?.currentQuestionId ?? null;
    const resumeSaved = savedId && session.questions.some((q) => q.id === savedId) ? savedId : null;
    const target =
      resumeSaved ??
      (resumeIntent === "interview"
        ? (session.questions[0]?.id ?? null)
        : (firstUnanswered?.id ?? session.questions[0]?.id ?? null));
    setEditingInputs(true);
    flow.patch({ source: flow.source ?? "onsite", stage: "questions" });
    if (target) session.goTo(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeIntent, resumeApplied, flow.hydrated, session.hydrated]);

  /* Finishing the questionnaire always lands on results — never back on intake. */
  useEffect(() => {
    if (editingInputs) return;
    if (flow.hydrated && session.hydrated && flow.stage === "questions" && session.isComplete) {
      /* Photos never jump straight to a number: the contractor reviews the
         assumptions the range rests on first. */
      flow.setStage(source === "photos" ? "assumptions" : "results");
    }
  }, [flow, session.hydrated, session.isComplete, editingInputs, source]);

  const confirmMeasurementKey = (key: string) =>
    flow.patch({ corrections: { ...flow.corrections, [key]: "confirm" } });
  const adjustMeasurementKey = (key: string, value: number) =>
    flow.patch({ corrections: { ...flow.corrections, [key]: value } });

  if (!projectId) {
    return (
      <Shell onExit={() => navigate({ to: "/app/dashboard" })}>
        <ProjectStep
          selectedId={null}
          onSelect={(id, name) => {
            setProjectId(id);
            setProjectName(name);
          }}
        />
      </Shell>
    );
  }

  if (!flow.hydrated || !session.hydrated || waitForServer) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner label={t("meta.title")} />
      </div>
    );
  }

  if (!source) {
    return (
      <Shell onExit={() => navigate({ to: "/app/dashboard" })}>
        <IntakeSourceChooser onChoose={flow.setSource} />
      </Shell>
    );
  }

  if (flow.stage === "intake" && source === "photos") {
    return (
      <Shell onExit={() => navigate({ to: "/app/dashboard" })}>
        <PhotoIntakePanel
          photos={flow.photos}
          onPhotosChange={(photos) => flow.patch({ photos })}
          observations={flow.observations}
          onObservationsChange={(observations) => flow.patch({ observations })}
          roomType={answeredRoomType}
          sizeClass={answeredSizeClass}
          cabinetsConfirmed={hasCabinets}
          onContinue={() =>
            flow.patch({
              stage: "review",
              clarifications: analysis.clarificationIds,
            })
          }
        />
      </Shell>
    );
  }

  /* Confirm or correct what the package suggested before answering anything. */
  if (flow.stage === "review" && source === "photos") {
    return (
      <Shell onExit={() => navigate({ to: "/app/dashboard" })}>
        <div className="space-y-4">
          <PhotoAnalysisSummary
            analysis={analysis}
            onCorrect={(key) => {
              flow.patch({
                stage: "questions",
                clarifications: analysis.clarificationIds.includes(key)
                  ? analysis.clarificationIds
                  : [key, ...analysis.clarificationIds],
              });
              session.goTo(key);
            }}
            onBack={() => flow.setStage("intake")}
            onContinue={() =>
              flow.patch({ stage: "questions", clarifications: analysis.clarificationIds })
            }
          />
          {inference ? (
            <PhotoInferenceSummary
              inference={inference}
              onConfirm={confirmMeasurementKey}
              onAdjust={adjustMeasurementKey}
            />
          ) : null}
        </div>
      </Shell>
    );
  }

  if (flow.stage === "intake" && source === "description") {
    return (
      <Shell onExit={() => navigate({ to: "/app/dashboard" })}>
        <DescriptionIntakePanel
          value={flow.description}
          locale={i18n.language}
          onChange={(description) => flow.patch({ description })}
          onContinue={() => flow.setStage("questions")}
        />
      </Shell>
    );
  }

  const handleUse = async () => {
    /*
     * Only the facts the answered questions actually control are written back.
     * The interview derives a complete geometry object, most of it assumed;
     * publishing all of it re-derived quantities this round never asked about.
     */
    const answeredIds = session.questions
      .map((question) => question.id)
      .filter((id) => answers[id]?.status === "answered");
    const geometry = controlledGeometryPatch(
      result.derived.geometryInput,
      record ?? null,
      answeredIds,
    );
    /*
     * Completing an interview is not, by itself, a pricing event. If no fact
     * changed, the active range snapshot is left exactly as the corrected
     * scope-derived resolver wrote it — an intake re-run must never restore a
     * stale band over current pricing.
     */
    if (!factsChanged && baselineSnapshot) {
      try {
        const draft = durablePayload("results");
        if (draft) await durable.persist.mutateAsync(draft);
      } catch {
        /* A draft-save failure must not block navigation or touch pricing. */
      }
      toast.success(t("toast.noChanges"));
      navigate({ to: "/app/projects/$projectId", params: { projectId } });
      return;
    }
    try {
      const payload = durablePayload("results");
      /*
       * FACTS FIRST. The refined geometry is saved as project measurement
       * before anything reprices, so whichever pipeline owns this estimate sees
       * the corrected facts.
       */
      await saveMeasurements.mutateAsync({
        projectId,
        roomId: null,
        label: projectName,
        lengthFt: geometry.lengthFt,
        widthFt: geometry.widthFt,
        ceilingHeightFt: geometry.ceilingHeightFt,
        openings: geometry.openings,
        interiorPartitionLf: geometry.interiorPartitionLf,
        floorWastePct: geometry.floorWastePct ?? 10,
        notes: geometry.notes ?? null,
      });
      /*
       * ADR-062: one authoritative cost pipeline. When this estimate already
       * has canonical cost lines, the band is refreshed FROM THOSE LINES and
       * the intake-derived snapshot is never written — the interview only owns
       * session continuity here. Only an estimate with no canonical lines may
       * bootstrap its first band from the intake pricer.
       */
      /*
       * The saved band itself declares its owner. A snapshot written from
       * canonical cost lines is owned by that pipeline, so the intake band is
       * withheld even if the refresh call cannot be reached at all.
       */
      let ownedByCanonical =
        (baselineSnapshot as { source?: unknown } | null)?.source === "canonical_lines";
      if (estimateId) {
        try {
          const outcome = await refreshCanonical({ data: { estimateId } });
          ownedByCanonical = ownedByCanonical || outcome.hasCanonicalLines;
        } catch (error) {
          /* Refresh failure must not let the intake band overwrite pricing. */
          ownedByCanonical = true;
          logger.error("ballpark.canonical_refresh_failed", { estimateId, cause: String(error) });
        }
      }
      if (payload) {
        if (ownedByCanonical) await durable.persist.mutateAsync(payload);
        else
          await durable.persistComplete.mutateAsync({
            session: payload,
            rangeSnapshot: rangeSnapshotWithHistory,
          });
      }
      queryClient.invalidateQueries({ queryKey: ["estimating"] });
      setHistory((prev) =>
        recordRefinement(prev, {
          kind: "measurements",
          source: source ?? "onsite",
          changedKeys: ["lengthFt", "widthFt", "ceilingHeightFt"],
          bandBefore: result.band,
          bandAfter: result.band,
          confidenceBefore: result.confidence,
          confidenceAfter: result.confidence,
        }),
      );
      toast.success(t("toast.applied"));
      navigate({ to: "/app/projects/$projectId", params: { projectId } });
    } catch (error) {
      const failure = categorizeBallparkSaveError(error);
      logger.error("ballpark.complete_save_failed", {
        reference: failure.reference,
        category: failure.category,
        cause: failure.cause,
        estimateId,
      });
      toast.error(t(`saveError.${failure.category}`, { reference: failure.reference }));
    }
  };

  const handleRefine = (questionId?: string) => {
    const target = questionId ?? session.questions[0]?.id ?? "";
    if (!target) return;
    setHistory((prev) =>
      recordRefinement(prev, {
        kind: "answers",
        source: source ?? "onsite",
        changedKeys: [target],
        bandBefore: result.band,
        bandAfter: null,
        confidenceBefore: result.confidence,
        confidenceAfter: null,
      }),
    );
    session.goTo(target);
    flow.setStage("questions");
  };

  /* Editable assumptions review — the gate between the interview and a range. */
  if (flow.stage === "assumptions") {
    return (
      <Shell onExit={() => navigate({ to: "/app/dashboard" })}>
        <AssumptionsReviewPanel
          ledger={result.ledger}
          onEdit={(key) => {
            flow.setStage("questions");
            session.goTo(key);
          }}
          onBack={() => flow.setStage("questions")}
          onContinue={() => {
            flow.setStage("results");
            void autosave("results");
          }}
        />
      </Shell>
    );
  }

  const showResult = flow.stage === "results";

  /*
   * Full Interview with nothing unresolved. It must not manufacture questions
   * just because the contractor opened it.
   */
  if (nothingLeftToAsk && !showResult) {
    return (
      <Shell onExit={() => navigate({ to: "/app/dashboard" })}>
        <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-lg font-semibold">{t("resolved.title")}</h2>
          <p className="text-sm text-foreground-muted">{t("resolved.body")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className="min-h-(--control-min-h) text-base"
              onClick={() =>
                projectId
                  ? navigate({ to: "/app/projects/$projectId", params: { projectId } })
                  : navigate({ to: "/app/dashboard" })
              }
            >
              {t("resolved.back")}
            </Button>
            <Button
              variant="outline"
              className="min-h-(--control-min-h) text-base"
              onClick={() => {
                const first = schema.questions[0]?.id;
                if (first) session.goTo(first);
                flow.patch({ source: flow.source ?? "onsite", stage: "questions" });
                setReviewAll(true);
              }}
            >
              {t("resolved.reviewAll")}
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onExit={() => navigate({ to: "/app/dashboard" })}>
      {showResult ? (
        <div className="space-y-4">
          {source === "photos" ? (
            <PhotoAnalysisSummary
              analysis={analysis}
              onCorrect={(key) => {
                flow.setStage("questions");
                session.goTo(key);
              }}
            />
          ) : null}
          {inference ? (
            <PhotoInferenceSummary
              inference={inference}
              onConfirm={confirmMeasurementKey}
              onAdjust={adjustMeasurementKey}
            />
          ) : null}
          <BallparkResultCard
            result={result}
            band={preview.band}
            savedBand={preview.savedBand}
            isPreview={preview.isPreview}
            history={history}
            saving={saveMeasurements.isPending || durable.persistComplete.isPending}
            onUse={handleUse}
            onRefine={handleRefine}
            onContinueDetailed={() =>
              navigate({
                to: "/app/walkthrough",
                search: { projectId, projectName: projectName ?? undefined },
              })
            }
          />
        </div>
      ) : session.current ? (
        <div className="space-y-4">
          {estimateId ? (
            <p className="text-xs text-foreground-muted" role="status" aria-live="polite">
              {typeof navigator !== "undefined" && !navigator.onLine
                ? t("persistence.offline")
                : durable.persist.isPending
                  ? t("persistence.saving")
                  : durable.persist.isError
                    ? t("persistence.error")
                    : t("persistence.saved")}
            </p>
          ) : null}
          <div className="space-y-2">
            <p className="text-sm text-foreground-muted">
              {t("progress.counter", { current: session.index + 1, total: session.total })}
            </p>
            <Progress value={((session.index + 1) / Math.max(1, session.total)) * 100} />
          </div>

          <BallparkQuestionCard
            question={session.current}
            answer={answers[session.current.id]}
            locale={session.locale}
            onAnswer={session.setAnswer}
            onAnswerMany={session.mergeAnswers}
          />

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="min-h-(--control-min-h) text-base"
              disabled={session.index === 0}
              onClick={() => {
                const previousId = session.previousQuestionId();
                session.back();
                void autosave("questions", previousId);
              }}
            >
              <ChevronLeft className="mr-1 size-5" aria-hidden />
              {t("actions.back")}
            </Button>
            <Button
              className="min-h-(--control-min-h) text-base"
              disabled={durable.persist.isPending}
              onClick={() => {
                if (session.index === session.total - 1) {
                  session.next();
                  setEditingInputs(false);
                  flow.setStage("results");
                  void autosave("questions", null);
                  return;
                }
                const nextId = session.nextQuestionId();
                session.next();
                void autosave("questions", nextId);
              }}
            >
              {session.index === session.total - 1 ? t("actions.finish") : t("actions.next")}
              <ChevronRight className="ml-1 size-5" aria-hidden />
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="min-h-(--control-min-h) w-full text-base"
          onClick={() => {
            setEditingInputs(false);
            flow.setStage("results");
          }}
        >
          {t("actions.finish")}
        </Button>
      )}
    </Shell>
  );
}

function Shell({ children, onExit }: { children: React.ReactNode; onExit: () => void }) {
  const { t } = useTranslation("ballpark");
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold text-foreground sm:text-3xl">
            {t("meta.title")}
          </h1>
          <p className="text-sm text-foreground-muted">{t("meta.subtitle")}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-(--control-min-h-sm) min-w-11 shrink-0"
          aria-label={t("actions.exit")}
          title={t("actions.exit")}
          onClick={onExit}
        >
          <X className="size-5" aria-hidden />
        </Button>
      </header>
      {children}
    </div>
  );
}
