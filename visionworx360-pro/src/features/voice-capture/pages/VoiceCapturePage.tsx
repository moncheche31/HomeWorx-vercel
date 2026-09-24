import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Loader2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DangerNotice, WarningNotice } from "@/components/feedback/Notice";
import { EstimateCommitActions } from "@/features/estimating/components/EstimateCommitActions";
import { ProjectSelectField } from "@/features/crm/components/ProjectSelectField";
import { usePreselectedProject } from "@/features/crm/hooks/usePreselectedProject";
import { useVoiceCapture } from "../hooks/useVoiceCapture";
import { RecordingControls } from "../components/RecordingControls";
import { LiveTranscript } from "../components/LiveTranscript";
import { DraftReviewList } from "../components/DraftReviewList";

export function VoiceCapturePage() {
  const { t } = useTranslation("voice");
  const preselected = usePreselectedProject();
  const [projectId, setProjectId] = useState<string | null>(preselected.projectId ?? null);
  const activeProjectId = projectId ?? undefined;
  const capture = useVoiceCapture(activeProjectId);
  const navigate = useNavigate();
  const dirty = capture.saveState !== "saved";

  // Warn on leaving only when there are genuinely unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const [saveError, setSaveError] = useState(false);
  const [savingToServer, setSavingToServer] = useState(false);

  const handleSaveAndReturn = async () => {
    if (!activeProjectId || savingToServer) return;
    setSavingToServer(true);
    setSaveError(false);
    try {
      await capture.saveToServer();
      toast.success(t("capture.save.toast"));
      void navigate({ to: "/app/projects/$projectId", params: { projectId: activeProjectId } });
    } catch {
      setSaveError(true);
      toast.error(t("capture.save.error"));
    } finally {
      setSavingToServer(false);
    }
  };

  const handleCommit = async () => {
    try {
      const count = await capture.commit();
      if (count > 0) toast.success(t("capture.toast.committed", { count }));
    } catch {
      toast.error(t("capture.toast.failed"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{t("capture.title")}</h1>
        <p className="text-sm text-foreground-muted">{t("capture.subtitle")}</p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("capture.project.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {preselected.projectId ? (
            <p className="text-sm font-medium text-foreground">
              {preselected.projectName ?? preselected.projectId}
            </p>
          ) : (
            <ProjectSelectField
              id="voice-project"
              value={projectId}
              onChange={(id) => setProjectId(id)}
              label={t("capture.project.title")}
              placeholder={t("capture.project.placeholder")}
            />
          )}
        </CardContent>
      </Card>

      {capture.estimateId && projectId ? (
        <EstimateCommitActions projectId={projectId} />
      ) : null}

      {!capture.supported ? (
        <WarningNotice
          title={t("capture.offline.unsupportedTitle")}
          description={t("capture.offline.unsupportedBody")}
        />
      ) : null}
      {capture.state === "permission_denied" ? (
        <DangerNotice
          title={t("capture.offline.deniedTitle")}
          description={t("capture.offline.deniedBody")}
        />
      ) : null}
      {capture.state === "error" ? (
        <WarningNotice
          title={t("capture.offline.errorTitle")}
          description={t("capture.offline.errorBody")}
        />
      ) : null}

      {capture.reviewing ? (
        <DraftReviewList
          drafts={capture.drafts}
          rooms={capture.rooms}
          committing={capture.committing}
          onToggle={capture.toggle}
          onApprove={capture.approve}
          onReject={capture.reject}
          onMerge={capture.merge}
          onSplit={capture.split}
          onChange={capture.updateDraft}
          onAddCustom={capture.addCustom}
          onBack={capture.backToCapture}
          onCommit={handleCommit}
        />
      ) : (
        <div className="space-y-4">
          <RecordingControls
            state={capture.state}
            status={capture.status}
            errorCode={capture.errorCode}
            interim={capture.interim}
            elapsedMs={capture.elapsedMs}
            audioLevel={capture.audioLevel}
            hasRetryableAudio={capture.hasRetryableAudio}
            hasTranscript={capture.transcript.trim().length > 0 && Boolean(activeProjectId)}
            onStart={capture.start}
            onPause={capture.pause}
            onResume={capture.resume}
            onStop={capture.stop}
            onReview={capture.review}
            onRetryTranscription={capture.retryTranscription}
            onRecordAgain={capture.recordAgain}
          />
          <LiveTranscript
            transcript={capture.transcript}
            interim={capture.interim}
            listening={capture.state === "listening"}
            onChange={capture.setTranscript}
          />
          <p className="text-xs text-muted-foreground">{t("capture.disclaimer")}</p>
        </div>
      )}

      {saveError ? (
        <DangerNotice
          title={t("capture.save.errorTitle")}
          description={t("capture.save.errorBody")}
        />
      ) : null}

      <div
        className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6"
        data-testid="voice-save-bar"
      >
        <p
          className="flex items-center gap-2 text-sm text-foreground-muted"
          role="status"
          aria-live="polite"
        >
          {capture.saveState === "saving" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("capture.save.saving")}
            </>
          ) : capture.saveState === "unsaved" ? (
            <>
              <CircleAlert className="size-4 text-warning" aria-hidden />
              {t("capture.save.unsaved")}
            </>
          ) : (
            <>
              <Check className="size-4 text-success" aria-hidden />
              {t("capture.save.saved")}
            </>
          )}
        </p>
        <Button
          className="min-h-12 w-full text-base sm:w-auto"
          disabled={!activeProjectId || savingToServer}
          onClick={() => void handleSaveAndReturn()}
        >
          {activeProjectId ? t("capture.save.finish") : t("capture.save.finishNoProject")}
        </Button>
      </div>
    </div>
  );
}
