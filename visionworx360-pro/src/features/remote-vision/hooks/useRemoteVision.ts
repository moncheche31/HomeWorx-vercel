import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  analyzeDescription,
  buildAssumptions,
  buildQuestions,
  applyQuantityAnswers,
  buildRemoteNarrative,
  buildScenarios,
  buildInputLedger,
  buildMeasurementFacts,
  collectFeatures,
  excludeFeatures,
  mergeIntakeText,
  isDeterministicVisionOnly,
  planDurableHydration,
  planReCaptureAdoption,
  type EstimateScenario,
  type RemoteVisionLocale,
} from "@/domains/remoteVision";
import type { ConfirmedRunMeasurement } from "@/domains/scopeGrounding";
import { useBookPricingLocation } from "@/features/estimating/hooks/useBookPricingLocation";
import { useProjectDescriptionNote } from "@/features/voice-capture/hooks/useProjectDescriptionNote";
import { useNarrativeScopeStore } from "@/features/narrative-scope/hooks/useNarrativeScopeStore";
import { useRemoteVisionSessionStore } from "./useRemoteVisionSessionStore";
import { useEstimatorReading } from "./useEstimatorReading";

const EMPTY_MEASUREMENTS: ConfirmedRunMeasurement[] = [];

/**
 * Orchestrates the Remote Vision workflow. Everything below is derived
 * synchronously from the session — the walkthrough workflow is untouched.
 */
export function useRemoteVision(
  projectId: string | null,
  projectName: string,
  /** Confirmed measurement facts from the durable measurement capture. */
  confirmedMeasurementFacts = "",
  /**
   * The same confirmed measurements as structured rows. Passed through so the
   * estimator can treat a confirmed wall/run as authoritative instead of
   * re-parsing it out of the merged text.
   */
  confirmedMeasurements: ConfirmedRunMeasurement[] = EMPTY_MEASUREMENTS,
) {
  const { i18n } = useTranslation();
  const locale: RemoteVisionLocale = i18n.language?.startsWith("es") ? "es-US" : "en-US";
  const store = useRemoteVisionSessionStore(projectId);
  const { session } = store;

  /*
   * READ-ONLY hydration from the project's durable records. This flow used to
   * live entirely in localStorage, so a project with a real saved description /
   * narrative / approval opened as a blank, disabled first-time intake on any
   * fresh device. Seeding is fill-the-blanks only (see planDurableHydration) —
   * nothing here ever writes back to the project or downgrades approved scope.
   */
  const durableDescription = useProjectDescriptionNote(projectId ?? undefined);
  const durableNarrative = useNarrativeScopeStore(projectId ?? "");
  const durableReady = !projectId
    ? true
    : !durableDescription.loading && durableNarrative.hydrated;
  const hydratedFor = useRef<string | null>(null);
  const seenDurableDescription = useRef<string | null>(null);
  const storeHydrated = store.hydrated;
  const storeUpdate = store.update;

  useEffect(() => {
    if (!storeHydrated || !durableReady) return;
    const key = projectId ?? "unlinked";
    if (hydratedFor.current === key) return;
    hydratedFor.current = key;
    seenDurableDescription.current = durableDescription.text;
    if (!projectId) return;
    const patch = planDurableHydration(session, {
      descriptionText: durableDescription.text,
      approvedText: durableNarrative.record.approvedText,
      approvedAt: durableNarrative.record.approvedAt,
      editedText: durableNarrative.record.editedText,
    });
    if (patch) storeUpdate(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeHydrated, durableReady, projectId]);

  /*
   * Re-recorded scope must actually re-run. The Voice Capture screen saves the
   * new narration straight to `project_notes`, so without this the local
   * session keeps replaying the OLD text and nothing downstream (analysis,
   * narrative record, ballpark) is ever regenerated or persisted.
   */
  useEffect(() => {
    if (!projectId || !storeHydrated || !durableReady) return;
    if (hydratedFor.current !== projectId) return;
    const patch = planReCaptureAdoption(session, {
      previousDurableText: seenDurableDescription.current,
      descriptionText: durableDescription.text,
    });
    seenDurableDescription.current = durableDescription.text;
    if (patch) storeUpdate(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, storeHydrated, durableReady, durableDescription.text]);


  /* Downstream resume/step logic must not run before durable state is in. */
  const hydrated = storeHydrated && durableReady && hydratedFor.current === (projectId ?? "unlinked");


  /**
   * Every contractor input merged: description + voice note + typed notes +
   * measurements. Media is analyzed as evidence only.
   */
  const context = useMemo(
    () => ({
      voiceTranscript: session.voiceTranscript ?? "",
      typedNotes: session.typedNotes ?? "",
      dimensions: session.dimensions ?? [],
    }),
    [session.voiceTranscript, session.typedNotes, session.dimensions],
  );

  const intakeText = useMemo(
    () =>
      [mergeIntakeText(session.description, context), confirmedMeasurementFacts.trim()]
        .filter(Boolean)
        .join("\n"),
    [session.description, context, confirmedMeasurementFacts],
  );

  const inputLedger = useMemo(
    () => buildInputLedger(session.description, context, session.media),
    [session.description, context, session.media],
  );

  const measurementFacts = useMemo(() => buildMeasurementFacts(context), [context]);

  /*
   * The deterministic reading always happens first and stands on its own. The
   * estimator pass is layered on top only once it resolves, so a slow or failed
   * model call never changes what the contractor sees.
   */
  const deterministicAnalysis = useMemo(
    () =>
      analyzeDescription({
        locale,
        description: intakeText,
        media: session.media,
        confirmedMeasurements,
      }),
    [locale, intakeText, session.media, confirmedMeasurements],
  );

  const recognizedWork = useMemo(
    () => collectFeatures(deterministicAnalysis).map((f) => f.label),
    [deterministicAnalysis],
  );

  const { reading: estimatorReading } = useEstimatorReading(
    intakeText,
    confirmedMeasurementFacts.trim(),
    recognizedWork,
  );

  const rawAnalysis = useMemo(
    () =>
      estimatorReading
        ? analyzeDescription({
            locale,
            description: intakeText,
            media: session.media,
            confirmedMeasurements,
            estimatorReading,
          })
        : deterministicAnalysis,
    [
      estimatorReading,
      deterministicAnalysis,
      locale,
      intakeText,
      session.media,
      confirmedMeasurements,
    ],
  );

  /** Contractor removals in the interpreted-scope review win over inference. */
  const removedFeatureKeys = useMemo(
    () => session.removedFeatureKeys ?? [],
    [session.removedFeatureKeys],
  );

  const analysis = useMemo(
    () => excludeFeatures(applyQuantityAnswers(rawAnalysis, session.answers), removedFeatureKeys),
    [rawAnalysis, session.answers, removedFeatureKeys],
  );

  const assumptions = useMemo(
    () => buildAssumptions(analysis, intakeText, session.assumptionOverrides),
    [analysis, intakeText, session.assumptionOverrides],
  );

  /*
   * ONE PRICING ENGINE. The preliminary band prices from the same book the
   * detailed estimate prices from: NCE 2026 craft wages times the job-site
   * area modification factor. Before the job site is confirmed this resolves
   * to the flagged national baseline, so a brand-new project still produces a
   * ballpark instead of failing or guessing a flat rate.
   */
  const bookPricing = useBookPricingLocation(projectId);

  const scenarios = useMemo(
    () =>
      buildScenarios(analysis, assumptions, locale, {
        bookLocation: bookPricing.location,
        laborRates: bookPricing.laborRates,
      }),
    [analysis, assumptions, locale, bookPricing.location, bookPricing.laborRates],
  );

  const questions = useMemo(
    () => buildQuestions(analysis, assumptions, session.answers),
    [analysis, assumptions, session.answers],
  );

  const narrative = useMemo(
    () =>
      buildRemoteNarrative({
        projectName: projectName || session.projectName || "Project",
        locale,
        result: analysis,
        assumptions,
        answers: session.answers,
      }),
    [projectName, session.projectName, locale, analysis, assumptions, session.answers],
  );

  const customerNarrative = useMemo(
    () =>
      buildRemoteNarrative({
        projectName: projectName || session.projectName || "Project",
        locale,
        audience: "customer",
        result: analysis,
        assumptions,
        answers: session.answers,
      }),
    [projectName, session.projectName, locale, analysis, assumptions, session.answers],
  );

  const displayText = session.editedNarrative ?? narrative.text;
  const selectedScenario: EstimateScenario | undefined =
    scenarios.find((s) => s.level === session.selectedLevel) ?? scenarios[1];

  return {
    ...store,
    hydrated,
    locale,
    context,
    intakeText,
    inputLedger,
    measurementFacts,
    aiEnabled: !isDeterministicVisionOnly(),
    bookPricing,
    analysis,
    grounded: analysis.grounded ?? null,
    sanity: analysis.sanity ?? null,
    removedFeatureKeys,
    removeFeature: (featureKey: string) =>
      store.update({
        removedFeatureKeys: Array.from(new Set([...removedFeatureKeys, featureKey])),
        editedNarrative: null,
      }),
    restoreFeature: (featureKey: string) =>
      store.update({
        removedFeatureKeys: removedFeatureKeys.filter((k) => k !== featureKey),
        editedNarrative: null,
      }),
    features: collectFeatures(analysis),
    assumptions,
    scenarios,
    selectedScenario,
    questions,
    narrative,
    customerNarrative,
    displayText,
    hasAnalysis: collectFeatures(analysis).length > 0,
    setAssumption: (id: string, optionKey: string) =>
      store.update({
        assumptionOverrides: { ...session.assumptionOverrides, [id]: optionKey },
      }),
    saveAnswers: (answers: Record<string, string>) =>
      store.update({ answers: { ...session.answers, ...answers }, editedNarrative: null }),
    setVoiceTranscript: (text: string) =>
      store.update({ voiceTranscript: text, editedNarrative: null }),
    setTypedNotes: (text: string) => store.update({ typedNotes: text, editedNarrative: null }),
    saveWording: (text: string) => store.update({ editedNarrative: text }),
    regenerate: () => store.update({ editedNarrative: null }),
    approve: () =>
      store.update({ approvedNarrative: displayText, approvedAt: new Date().toISOString() }),
  };
}

export type UseRemoteVisionResult = ReturnType<typeof useRemoteVision>;
