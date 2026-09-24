import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { usePreselectedProject } from "@/features/crm/hooks/usePreselectedProject";
import { useWalkthrough } from "../hooks/useWalkthrough";
import { StepProgress } from "../components/StepProgress";
import { ProjectStep } from "../components/ProjectStep";
import { IntakeStep } from "../components/IntakeStep";
import { RoomStep } from "../components/RoomStep";
import { CaptureStep } from "../components/CaptureStep";
import { QuestionStep } from "../components/QuestionStep";
import { ReviewStep } from "../components/ReviewStep";
import { SummaryStep } from "../components/SummaryStep";
import { WalkthroughModeChooser } from "../components/WalkthroughModeChooser";

export function WalkthroughPage() {
  const { t } = useTranslation("walkthrough");
  const preselected = usePreselectedProject();
  /* The active project comes from the route: state is scoped to it, so a new
     project can never inherit another project's drafts, answers or questions. */
  const wt = useWalkthrough(preselected.projectId ?? null);
  /* Quick Ballpark leaves this page entirely; "detailed" keeps the room-by-room flow. */
  const [mode, setMode] = useState<"detailed" | null>(null);

  // The Create Estimate wizard already picked the project — skip the project
  // step and land on capture-first intake for THIS project.
  useEffect(() => {
    if (!wt.ready) return;
    if (!preselected.projectId) return;
    if (wt.projectId === preselected.projectId && wt.projectName) return;
    wt.setProject(preselected.projectId, preselected.projectName ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wt.ready, preselected.projectId, preselected.projectName]);

  const handleCommit = async () => {
    try {
      const count = await wt.commit();
      if (count > 0) toast.success(t("toast.committed", { count }));
    } catch {
      toast.error(t("toast.failed"));
    }
  };

  if (!wt.ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner label={t("common.loading")} />
      </div>
    );
  }

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
          className="min-h-11 min-w-11 shrink-0"
          aria-label={t("common.exit")}
          title={t("common.exit")}
          onClick={wt.abandon}
        >
          <X className="size-5" aria-hidden />
        </Button>
      </header>

      <StepProgress step={wt.step} />

      {wt.step === "project" ? (
        <ProjectStep
          selectedId={wt.projectId}
          onSelect={(id, name) => {
            wt.setProject(id, name);
            wt.goToStep("intake");
          }}
        />
      ) : null}

      {wt.step === "intake" && wt.projectId ? (
        <IntakeStep
          projectId={wt.projectId}
          projectName={wt.projectName}
          captureLanguage={wt.captureLanguage}
          description={wt.description}
          onDescriptionChange={wt.setDescription}
          onAnalyze={wt.analyzeIntake}
        />
      ) : null}

      {wt.step === "room" && wt.projectId && mode === null ? (
        <WalkthroughModeChooser
          projectId={wt.projectId}
          projectName={wt.projectName}
          onChooseDetailed={() => setMode("detailed")}
        />
      ) : null}

      {wt.step === "room" && wt.projectId && mode === "detailed" ? (
        <RoomStep
          projectId={wt.projectId}
          selectedId={wt.roomId}
          onSelect={(id, name) => {
            wt.setRoom(id, name);
            wt.goToStep("capture");
          }}
        />
      ) : null}


      {wt.step === "capture" && wt.projectId ? (
        <CaptureStep
          projectId={wt.projectId}
          projectName={wt.projectName}
          roomId={wt.roomId}
          roomName={wt.roomName}
          captureLanguage={wt.captureLanguage}
          onCaptureLanguageChange={wt.setCaptureLanguage}
          transcript={wt.transcript}
          interim={wt.interim}
          speechStatus={wt.speechStatus}
          errorCode={wt.errorCode}
          elapsedMs={wt.elapsedMs}
          audioLevel={wt.audioLevel}
          hasRetryableAudio={wt.hasRetryableAudio}
          recording={wt.recording}
          paused={wt.paused}
          speechSupported={wt.speechSupported}
          detectedCount={wt.drafts.length}
          unresolvedCount={wt.unresolvedCount}
          onTranscriptChange={wt.setTranscript}
          onStart={wt.startRecording}
          onPause={wt.pauseRecording}
          onResume={wt.resumeRecording}
          onStop={wt.stopRecording}
          onRetryTranscription={wt.retryTranscription}
          onRecordAgain={wt.recordAgain}
          onUndo={wt.undoLast}
          onFinishRoom={wt.finishRoom}
          onChangeRoom={() => wt.goToStep("room")}
        />
      ) : null}

      {/* Questions only ever exist for the current project's own drafts. */}
      {wt.step === "questions" && wt.questions.length > 0 ? (
        <QuestionStep
          questions={wt.questions}
          answers={wt.answers}
          onAnswer={wt.answer}
          onDone={() => wt.goToStep(wt.drafts.length > 0 ? "review" : "room")}
        />
      ) : null}

      {wt.step === "review" ? (
        <ReviewStep
          drafts={wt.drafts}
          rooms={wt.rooms}
          committing={wt.committing}
          unresolvedCount={wt.unresolvedCount}
          onApprove={wt.approveDraft}
          onDelete={wt.deleteDraft}
          onNeedsReview={wt.markNeedsReview}
          onChange={wt.updateDraft}
          onApproveAllHigh={wt.approveAllHighConfidence}
          onReviewUncertain={() => wt.goToStep("questions")}
          onCommit={handleCommit}
        />
      ) : null}

      {wt.step === "summary" && wt.projectId ? (
        <SummaryStep
          projectId={wt.projectId}
          completedRooms={wt.completedRooms}
          onAnotherRoom={wt.startAnotherRoom}
          onFinish={wt.finish}
        />
      ) : null}

      {wt.step !== "project" && wt.step !== "summary" ? (
        <Button variant="ghost" className="min-h-12 w-full" onClick={wt.goBack}>
          {t("common.back")}
        </Button>
      ) : null}
    </div>
  );
}
