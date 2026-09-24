import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Check, Undo2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { WarningNotice } from "@/components/feedback/Notice";
import { PhotoUploadDialog } from "@/features/project-workspace/components/PhotoUploadDialog";
import type { CaptureLanguage } from "@/domains/walkthrough";
import { DictationControl } from "@/features/voice-capture/components/DictationControl";
import type { DictationErrorCode, DictationStatus } from "@/features/voice-capture/hooks/useDictation";

interface Props {
  projectId: string;
  projectName: string | null;
  roomName: string | null;
  roomId: string | null;
  captureLanguage: CaptureLanguage;
  onCaptureLanguageChange: (lang: CaptureLanguage) => void;
  transcript: string;
  interim: string;
  speechStatus: DictationStatus;
  errorCode: DictationErrorCode | null;
  elapsedMs: number;
  audioLevel: number;
  hasRetryableAudio: boolean;
  recording: boolean;
  paused: boolean;
  speechSupported: boolean;
  detectedCount: number;
  unresolvedCount: number;
  onTranscriptChange: (value: string) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRetryTranscription: () => void;
  onRecordAgain: () => void;
  onUndo: () => void;
  onFinishRoom: () => void;
  onChangeRoom: () => void;
}

export function CaptureStep({
  projectId,
  projectName,
  roomName,
  roomId,
  captureLanguage,
  onCaptureLanguageChange,
  transcript,
  interim,
  speechStatus,
  errorCode,
  elapsedMs,
  audioLevel,
  hasRetryableAudio,
  recording,
  paused,
  speechSupported,
  detectedCount,
  unresolvedCount,
  onTranscriptChange,
  onStart,
  onPause,
  onResume,
  onStop,
  onRetryTranscription,
  onRecordAgain,
  onUndo,
  onFinishRoom,
  onChangeRoom,
}: Props) {
  const { t } = useTranslation("walkthrough");
  const [photoOpen, setPhotoOpen] = useState(false);
  const hasTranscript = transcript.trim().length > 0;

  return (
    <div className="space-y-4 pb-32">
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{projectName ?? "—"}</p>
              <p className="truncate text-xs text-foreground-muted">{roomName ?? "—"}</p>
            </div>
            <Badge variant={recording ? "destructive" : "outline"} className="shrink-0">
              {recording
                ? t("capture.status.recording")
                : paused
                  ? t("capture.status.paused")
                  : t("capture.status.idle")}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
            <span>{t("capture.detected", { count: detectedCount })}</span>
            <span aria-hidden>·</span>
            <span>{t("capture.unresolved", { count: unresolvedCount })}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <WifiOff className="size-3" aria-hidden />
              {t("capture.savedLocally")}
            </span>
          </div>
          <Button variant="ghost" className="min-h-11 w-full justify-start" onClick={onChangeRoom}>
            {t("capture.changeRoom")}
          </Button>
        </CardContent>
      </Card>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("capture.language.legend")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["en-US", "es-US"] as CaptureLanguage[]).map((lang) => (
            <Button
              key={lang}
              type="button"
              variant={captureLanguage === lang ? "default" : "outline"}
              className="min-h-12"
              aria-pressed={captureLanguage === lang}
              disabled={recording}
              onClick={() => onCaptureLanguageChange(lang)}
            >
              {t(`capture.language.${lang === "en-US" ? "english" : "spanish"}`)}
            </Button>
          ))}
        </div>
      </fieldset>

      {!speechSupported ? (
        <WarningNotice
          title={t("capture.unsupportedTitle")}
          description={t("capture.unsupportedBody")}
        />
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="wt-transcript" className="text-sm font-medium">
          {t("capture.transcript")}
        </Label>
        <Textarea
          id="wt-transcript"
          value={transcript}
          onChange={(e) => onTranscriptChange(e.target.value)}
          rows={8}
          placeholder={t("capture.transcriptPlaceholder")}
          className="min-h-40 text-base"
        />
        {recording && interim ? (
          <p className="text-sm italic text-foreground-muted" aria-live="polite">
            {interim}…
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="min-h-12" onClick={onUndo} disabled={!hasTranscript}>
          <Undo2 className="mr-2 size-4" aria-hidden />
          {t("capture.controls.undo")}
        </Button>
        <Button variant="outline" className="min-h-12" onClick={() => setPhotoOpen(true)}>
          <Camera className="mr-2 size-4" aria-hidden />
          {t("capture.controls.photo")}
        </Button>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-4 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          <DictationControl
            status={speechStatus}
            errorCode={errorCode}
            interim={interim}
            elapsedMs={elapsedMs}
            audioLevel={audioLevel}
            hasRetryableAudio={hasRetryableAudio}
            onStart={paused ? onResume : onStart}
            onStop={onStop}
            onRetryTranscription={onRetryTranscription}
            onRecordAgain={onRecordAgain}
          />
          <Button
            variant="outline"
            className="min-h-12 w-full text-base"
            disabled={!hasTranscript}
            onClick={onFinishRoom}
          >
            <Check className="mr-2 size-5" aria-hidden />
            {t("capture.controls.finishRoom")}
          </Button>
        </div>
      </div>

      <PhotoUploadDialog
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        projectId={projectId}
        defaultRoomId={roomId}
      />
    </div>
  );
}
