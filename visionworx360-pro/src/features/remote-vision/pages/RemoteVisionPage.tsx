import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { EstimateCommitActions } from "@/features/estimating/components/EstimateCommitActions";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, FileText, Pencil, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  workspaceBackLinkClass,
  WorkspaceBackFooter,
} from "@/components/navigation/workspaceBack";
import { NarrativeDocumentView } from "@/features/narrative-scope/components/NarrativeDocumentView";
import { ProjectSelectField } from "@/features/crm/components/ProjectSelectField";
import { usePreselectedProject } from "@/features/crm/hooks/usePreselectedProject";
import { useRemoteVision } from "../hooks/useRemoteVision";
import { useRemoteVisionMedia } from "../hooks/useRemoteVisionMedia";

import { useRemoteVisionCommit } from "../hooks/useRemoteVisionCommit";

import { MediaUploadPanel } from "../components/MediaUploadPanel";
import { VideoUploadPanel } from "../components/VideoUploadPanel";
import { ProjectDetailsPanel } from "../components/ProjectDetailsPanel";
import { useMeasurementCapture } from "../hooks/useMeasurementCapture";
import { measurementFactsText } from "@/domains/measurementCapture";
import { DescribePanel } from "../components/DescribePanel";
import { DetectedFeaturesPanel } from "../components/DetectedFeaturesPanel";
import { GroundedScopePanel } from "../components/GroundedScopePanel";
import { AssumptionsPanel } from "../components/AssumptionsPanel";
import { ScenarioCards } from "../components/ScenarioCards";
import { NeedsReviewPanel } from "../components/NeedsReviewPanel";
import { RemoteQuestionsPanel } from "../components/RemoteQuestionsPanel";
import { InputLedgerPanel } from "../components/InputLedgerPanel";
import { UnderstandingPanel } from "../components/UnderstandingPanel";
import { PhotoObjectsPanel } from "../components/PhotoObjectsPanel";
import { TechnicalDetailsDisclosure } from "../components/TechnicalDetailsDisclosure";
import { useProjectUnderstanding } from "../hooks/useProjectUnderstanding";
import { useProjectMediaUnderstanding } from "../hooks/useProjectMediaUnderstanding";
import { mediaFingerprint } from "../services/mediaUnderstanding.shared";
import type { VisualUnderstandingResult } from "@/domains/remoteVision";

/**
 * Four primary steps, mobile-first and voice-first.
 *
 * Upload + Details + Describe used to be three separate buttons even though
 * all three feed the same merged intake text, and "Scope of Work" read like a
 * fourth input surface when it is in fact the generated output. Capture is now
 * one screen, and the scope step is explicitly the generated document that
 * gets reviewed and approved.
 */
const STEPS = ["capture", "review", "estimate", "scope"] as const;
type Step = (typeof STEPS)[number];

export function RemoteVisionPage() {
  const { t, i18n } = useTranslation("remote-vision");
  const { t: tNav } = useTranslation("workspace-pw");

  const [step, setStep] = useState<Step>("capture");
  const preselected = usePreselectedProject();
  const [projectId, setProjectId] = useState<string | null>(preselected.projectId ?? null);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");

  const [selectedName, setSelectedName] = useState(preselected.projectName ?? "");
  const projectName = selectedName;
  const measurements = useMeasurementCapture(projectId);
  // Only contractor-confirmed measurements are allowed to price the job.
  const confirmedMeasurementFacts = measurementFactsText(measurements.confirmed);
  const rv = useRemoteVision(
    projectId,
    projectName,
    confirmedMeasurementFacts,
    measurements.confirmed,
  );
  const durableMedia = useRemoteVisionMedia(projectId, rv.session.media);
  const mediaUnderstanding = useProjectMediaUnderstanding(projectId ?? undefined);
  const currentMediaFingerprint = mediaFingerprint(rv.session.media.map((m) => m.id));
  const saveMediaUnderstanding = mediaUnderstanding.save;
  const storedMediaFingerprint = mediaUnderstanding.record.mediaFingerprint;
  const storedVisualStatus = mediaUnderstanding.record.visualStatus;
  const storedVisualObservations = mediaUnderstanding.record.visualObservations;
  const storedSpokenNarration = mediaUnderstanding.spokenNarration;
  const persistedVisual = useMemo(
    () => storedMediaFingerprint === currentMediaFingerprint
      ? ({
          observations: storedVisualObservations,
          transformations: [],
          hiddenConditionWarnings: [],
          measurementTargets: [],
          status: storedVisualStatus,
          providerId: "stored-project-understanding",
        } satisfies VisualUnderstandingResult)
      : null,
    [currentMediaFingerprint, storedMediaFingerprint, storedVisualObservations, storedVisualStatus],
  );
  const persistVisualUnderstanding = useCallback(
    async (result: VisualUnderstandingResult) => {
      await saveMediaUnderstanding({
        spokenNarration: rv.intakeText,
        visualObservations: result.observations,
        visualStatus: result.status,
        mediaFingerprint: currentMediaFingerprint,
      });
    },
    [currentMediaFingerprint, saveMediaUnderstanding, rv.intakeText],
  );
  useEffect(() => {
    if (!projectId || !rv.hydrated || step === "capture") return;
    const spokenNarration = rv.intakeText.trim();
    if (!spokenNarration || spokenNarration === storedSpokenNarration.trim()) return;
    void saveMediaUnderstanding({ spokenNarration });
  }, [projectId, rv.hydrated, step, rv.intakeText, saveMediaUnderstanding, storedSpokenNarration]);
  /*
   * NOTE: adding a photo used to blank `visual_observations` here and nothing
   * re-triggered analysis, so the project silently lost its visual evidence.
   * The understanding hook now keeps prior facts flagged stale and re-runs
   * automatically; the completed run overwrites the row.
   */
  /* Real multimodal analysis of THIS project's media, fused with the transcript. */
  const understanding = useProjectUnderstanding(
    rv.analysis,
    rv.session.media,
    rv.intakeText,
    confirmedMeasurementFacts,
    measurements.confirmed,
    persistVisualUnderstanding,
    persistedVisual,
    { autoAnalyze: Boolean(projectId), ready: !mediaUnderstanding.isLoading, projectId },
  );

  const commit = useRemoteVisionCommit(projectId);

  // Durable photos are authoritative: mirror ONLY saved rows into the analysis
  // session. Mirroring in-flight/local items instead fed them back into the
  // merge as session input, which duplicated them on every render.
  const durableIds = durableMedia.durableItems.map((m) => m.id).join("|");
  const sessionPhotoIds = rv.session.media
    .filter((m) => m.kind !== "walkthrough_video")
    .map((m) => m.id)
    .join("|");
  useEffect(() => {
    if (durableMedia.loading) return;
    if (durableIds === sessionPhotoIds) return;
    const videos = rv.session.media.filter((m) => m.kind === "walkthrough_video");
    rv.update({ media: [...durableMedia.durableItems, ...videos] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durableIds, sessionPhotoIds, durableMedia.loading]);

  /*
   * Resume where the contractor stopped instead of always restarting at the
   * first step. Runs once per project, after the session is hydrated, so it
   * can never fight manual navigation.
   */
  const resumedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!rv.hydrated) return;
    const key = projectId ?? "unlinked";
    if (resumedFor.current === key) return;
    resumedFor.current = key;
    if (rv.session.approvedAt) setStep("scope");
    else if (rv.intakeText.trim()) setStep("review");
    else setStep("capture");
  }, [rv.hydrated, projectId, rv.session.approvedAt, rv.intakeText]);

  const approvedDate = rv.session.approvedAt
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
        new Date(rv.session.approvedAt),
      )
    : null;

  const stepIndex = STEPS.indexOf(step);
  /** Capture is the only gated step: nothing downstream exists without input. */
  const hasIntake = rv.intakeText.trim().length > 0;
  const canAdvance = step !== "capture" || hasIntake;

  const goNext = () => {
    if (!canAdvance) return;
    setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)]);
  };

  /*
   * Seeing a number is a durable milestone. The intake and generated scope are
   * written to the project as a draft the moment the estimate is reached, so
   * leaving the app before approval never throws the work away.
   */
  const draftedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || !rv.hydrated) return;
    if (step !== "estimate" && step !== "scope") return;
    if (!rv.intakeText.trim()) return;
    /* Quantities are part of the identity of a draft: a re-run that resolves
       the same wording to different numbers must save again. */
    const resolved = (rv.grounded?.explicit ?? [])
      .map((f) => `${f.featureKey}:${f.quantity ?? ""}:${f.unitKey ?? ""}`)
      .join("|");
    const key = `${projectId}:${rv.intakeText.length}:${rv.displayText.length}:${resolved}`;
    if (draftedFor.current === key) return;
    draftedFor.current = key;
    void commit.saveDraft({
      intakeText: rv.intakeText,
      narrativeText: rv.displayText,
      replay: {
        version: 1,
        intakeText: rv.intakeText,
        confirmedMeasurements: measurements.confirmed,
        grounded: rv.grounded,
        assumptions: rv.assumptions,
        scenarios: rv.scenarios,
        removedFeatureKeys: rv.removedFeatureKeys,
        capturedAt: new Date().toISOString(),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, projectId, rv.hydrated, rv.intakeText, rv.displayText]);


  const handleApprove = async () => {
    rv.approve();
    if (!projectId) {
      toast.success(t("toast.approved"));
      return;
    }
    const ok = await commit.commit({
      intakeText: rv.intakeText,
      narrativeText: rv.displayText,
      dimensions: rv.session.dimensions ?? [],
      grounded: rv.grounded,
      removedFeatureKeys: rv.removedFeatureKeys,
      scenario: rv.selectedScenario ?? null,
      assumptions: rv.assumptions,
      replay: {
        version: 1,
        intakeText: rv.intakeText,
        confirmedMeasurements: measurements.confirmed,
        grounded: rv.grounded,
        assumptions: rv.assumptions,
        scenarios: rv.scenarios,
        removedFeatureKeys: rv.removedFeatureKeys,
        approvedAt: new Date().toISOString(),
      },
    });
    toast[ok ? "success" : "error"](ok ? t("toast.committed") : t("toast.commitFailed"));
  };

  const backLabel = projectId ? tNav("nav.backToProject") : tNav("nav.backToProjects");

  const backLink = (placement: "top" | "bottom") =>
    projectId ? (
      <Link
        to="/app/projects/$projectId"
        params={{ projectId }}
        aria-label={backLabel}
        className={workspaceBackLinkClass(placement)}
      >
        <ArrowLeft className="size-5 shrink-0" aria-hidden />
        <span>{backLabel}</span>
      </Link>
    ) : (
      <Link to="/app/projects" aria-label={backLabel} className={workspaceBackLinkClass(placement)}>
        <ArrowLeft className="size-5 shrink-0" aria-hidden />
        <span>{backLabel}</span>
      </Link>
    );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      {backLink("top")}
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{t("title")}</h1>
        <p className="text-sm text-foreground-muted">{t("subtitle")}</p>
        <p className="text-xs text-foreground-muted">{t("disclaimer")}</p>
      </header>


      <nav aria-label={t("title")} className="flex flex-wrap gap-2">
        {STEPS.map((s, index) => (
          <Button
            key={s}
            size="sm"
            variant={s === step ? "default" : index < stepIndex ? "secondary" : "outline"}
            className="min-h-11"
            disabled={s !== "capture" && !hasIntake}
            onClick={() => setStep(s)}
          >
            {t(`steps.${s}`)}
          </Button>
        ))}
      </nav>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("project.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {preselected.projectId ? (
            <p className="text-sm font-medium text-foreground">{selectedName || preselected.projectId}</p>
          ) : (
            <ProjectSelectField
              id="rv-project"
              value={projectId}
              onChange={(id, name) => {
                setProjectId(id);
                setSelectedName(name);
              }}
              label={t("project.title")}
              placeholder={t("project.placeholder")}
            />
          )}
        </CardContent>
      </Card>

      {step === "capture" ? (
        <>
          <VideoUploadPanel
            projectId={projectId}
            media={rv.session.media}
            onAdd={rv.addMedia}
            onUpdate={rv.updateMedia}
            onRemove={rv.removeMedia}
          />
          <MediaUploadPanel
            projectId={projectId}
            media={durableMedia.media}
            saveState={durableMedia.saveState}
            loading={durableMedia.loading}
            onUpload={(kind, files) => {
              void durableMedia.uploadFiles(kind, files);
            }}
            onRemove={(id) => {
              void durableMedia.removeMedia(id).then((r) => {
                if (!r.durable) rv.removeMedia(id);
              });
            }}
          />
          <DescribePanel
            value={rv.session.description}
            locale={rv.locale}
            onChange={(text) => rv.update({ description: text, editedNarrative: null })}
          />
          <ProjectDetailsPanel
            locale={rv.locale}
            projectId={projectId}
            voiceTranscript={rv.session.voiceTranscript ?? ""}
            typedNotes={rv.session.typedNotes ?? ""}
            dimensions={rv.session.dimensions ?? []}
          onVoiceTranscriptChange={rv.setVoiceTranscript}
            onTypedNotesChange={rv.setTypedNotes}
            onDimensionsChange={rv.setDimensions}
          />
          <Button
            className="min-h-14 w-full text-base"
            disabled={!hasIntake}
            onClick={() => {
              setStep("review");
              toast.success(t("toast.analyzed"));
            }}
          >
            {t("describe.analyze")}
          </Button>
        </>
      ) : null}

      {step === "review" ? (
        <>
          {/* Actionable first: scope edits, assumptions, open questions. */}
          <GroundedScopePanel
            grounded={rv.grounded}
            sanity={rv.sanity}
            removedFeatureKeys={rv.removedFeatureKeys}
            onRemove={rv.removeFeature}
            onRestore={rv.restoreFeature}
          />
          <AssumptionsPanel assumptions={rv.assumptions} onChange={rv.setAssumption} />
          <RemoteQuestionsPanel
            questions={rv.questions}
            answers={rv.session.answers}
            onSave={(answers) => {
              rv.saveAnswers(answers);
              toast.success(t("toast.answers"));
            }}
          />

          {/* Pure status/audit — no presence in the default view. */}
          <TechnicalDetailsDisclosure>
            <UnderstandingPanel
              understanding={understanding.understanding}
              visual={understanding.visual}
              analyzing={understanding.analyzing}
              stale={understanding.stale}
              canAnalyzeVisually={understanding.canAnalyzeVisually}
              imageCount={understanding.imageCount}
              onAnalyze={() => void understanding.runVisualAnalysis()}
            />
            <PhotoObjectsPanel
              media={rv.session.media}
              observations={understanding.visual.observations}
              narration={rv.intakeText}
            />
            <DetectedFeaturesPanel result={rv.analysis} />
            <InputLedgerPanel records={rv.inputLedger} />
          </TechnicalDetailsDisclosure>
        </>
      ) : null}


      {step === "estimate" ? (
        <div className="space-y-4">
          {/*
            D1: this screen renders DRAFT replay math, not the saved estimate.
            It is labelled as such so a preview can never be mistaken for the
            authoritative price on the Estimate tab.
          */}
          <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm">
            <p className="font-semibold">{t("draftPreview.title")}</p>
            <p className="text-foreground-muted">{t("draftPreview.body")}</p>
            {projectId ? (
              <Link
                to="/app/projects/$projectId"
                params={{ projectId }}
                search={{ tab: "estimate" }}
                className="mt-1 inline-block font-medium underline"
              >
                {t("draftPreview.link")}
              </Link>
            ) : null}
          </div>
          {/* Unpriced/needs-review scope is shown BEFORE the numbers. */}
          <NeedsReviewPanel scenarios={rv.scenarios} />
          <ScenarioCards
            scenarios={rv.scenarios}
            selected={rv.session.selectedLevel}
            onSelect={rv.setLevel}
          />
        </div>
      ) : null}


      {step === "scope" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{t("scope.title")}</h2>
            {approvedDate ? <Badge variant="secondary">{approvedDate}</Badge> : null}
          </div>
          <p className="text-sm text-foreground-muted">{t("scope.hint")}</p>

          {projectId && rv.session.approvedAt ? (
            <EstimateCommitActions projectId={projectId} />
          ) : null}

          {editing ? (
            <div className="space-y-3">
              <Textarea
                className="min-h-72 text-base leading-relaxed"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  className="min-h-12"
                  onClick={() => {
                    rv.saveWording(draftText);
                    setEditing(false);
                    toast.success(t("toast.saved"));
                  }}
                >
                  {t("scope.save")}
                </Button>
                <Button variant="outline" className="min-h-12" onClick={() => setEditing(false)}>
                  {t("scope.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <NarrativeDocumentView text={rv.displayText} />
              <p className="text-sm text-foreground-muted">
                {projectId ? t("scope.saveHint") : t("scope.needsProject")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  className="min-h-14 text-base sm:col-span-2"
                  disabled={commit.saving}
                  onClick={() => {
                    void handleApprove();
                  }}
                >
                  <CheckCircle2 className="mr-2 size-5" aria-hidden />
                  {commit.saving
                    ? t("scope.saving")
                    : rv.session.approvedAt
                      ? t("scope.approved")
                      : t("scope.approve")}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-12"
                  onClick={() => {
                    setDraftText(rv.displayText);
                    setEditing(true);
                  }}
                >
                  <Pencil className="mr-2 size-4" aria-hidden />
                  {t("scope.edit")}
                </Button>
                <Button variant="outline" className="min-h-12" onClick={rv.regenerate}>
                  <RefreshCw className="mr-2 size-4" aria-hidden />
                  {t("scope.regenerate")}
                </Button>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t("proposal.title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-foreground-muted">{t("proposal.subtitle")}</p>
                  {rv.session.approvedAt ? (
                    <NarrativeDocumentView text={rv.customerNarrative.text} />
                  ) : (
                    <p className="text-sm text-warning">
                      <FileText className="mr-2 inline size-4" aria-hidden />
                      {t("proposal.notApproved")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </section>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <Button
          variant="outline"
          className="min-h-12"
          disabled={stepIndex === 0}
          onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)])}
        >
          {t("actions.back")}
        </Button>
        <Button
          className="min-h-12"
          disabled={stepIndex === STEPS.length - 1 || !canAdvance}
          onClick={goNext}
        >
          {t("actions.next")}
        </Button>
        <Button
          variant="ghost"
          className="min-h-12"
          onClick={() => {
            rv.reset();
              void commit.resetDraft();
              resumedFor.current = projectId ?? "unlinked";
            setStep("capture");
            toast.success(t("toast.reset"));
          }}
        >
          <RotateCcw className="mr-2 size-4" aria-hidden />
          {t("actions.reset")}
        </Button>
      </div>
      <WorkspaceBackFooter>{backLink("bottom")}</WorkspaceBackFooter>
    </div>

  );
}
