import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, Mic, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WarningNotice } from "@/components/feedback/Notice";
import { cn } from "@/lib/utils";
import type { DictationErrorCode, DictationStatus } from "../hooks/useDictation";

interface Props {
  status: DictationStatus;
  errorCode: DictationErrorCode | null;
  interim?: string;
  elapsedMs?: number;
  audioLevel?: number;
  hasRetryableAudio?: boolean;
  onStart: () => void;
  onStop: () => void;
  onRetryTranscription?: () => void;
  onRecordAgain?: () => void;
  className?: string;
  /** Optional label override for the idle state (defaults to "Start recording"). */
  idleLabel?: string;
}

/**
 * The one recording control every audio-note surface renders. It always shows
 * exactly which state the microphone is in — idle, requesting permission,
 * recording, stopping, transcribing — or an actionable error. It never
 * silently no-ops: even "unsupported" is spelled out, with the typed field
 * left untouched next to it.
 */
export function DictationControl({
  status,
  errorCode,
  interim,
  elapsedMs = 0,
  audioLevel = 0,
  hasRetryableAudio = false,
  onStart,
  onStop,
  onRetryTranscription,
  onRecordAgain,
  className,
  idleLabel,
}: Props) {
  const { t } = useTranslation("voice");

  const recording = status === "listening" || status === "paused";
  const busy = status === "requesting" || status === "stopping" || status === "transcribing";
  const blocked = status === "unsupported";
  const succeeded = status === "success";
  const failed = status === "error" || status === "permission_denied";
  const seconds = Math.floor(elapsedMs / 1000);
  const timer = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const label = recording
    ? t("recorder.stop")
    : status === "requesting"
      ? t("recorder.requesting")
      : status === "stopping"
        ? t("recorder.stopping")
        : status === "transcribing"
          ? t("recorder.transcribing")
          : succeeded
            ? t("recorder.recordAgain")
            : (idleLabel ?? t("recorder.start"));

  return (
    <div className={cn("space-y-2", className)}>
      {recording ? (
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3" data-testid="recording-indicator">
          <div className="flex items-center justify-between gap-3" aria-live="polite">
            <span className="flex items-center gap-2 font-semibold text-destructive">
              <span className="size-3 animate-pulse rounded-full bg-destructive" aria-hidden />
              {t("recorder.recording")}
            </span>
            <span className="font-mono text-sm tabular-nums" data-testid="recording-timer">{timer}</span>
          </div>
          <div className="flex h-8 items-end gap-1" aria-label={t("recorder.audioActivity")} data-testid="audio-level-meter">
            {Array.from({ length: 12 }, (_, index) => {
              const threshold = (index + 1) / 12;
              const active = audioLevel >= threshold;
              const height = ["h-2", "h-3", "h-4", "h-5", "h-6", "h-7"][index % 6];
              return <span key={index} className={cn("flex-1 rounded-sm transition-colors", height, active ? "bg-destructive" : "bg-border")} />;
            })}
          </div>
          <Button type="button" data-testid="dictation-control" data-status={status} className="min-h-14 w-full text-base" variant="destructive" aria-pressed onClick={onStop}>
            <Square className="mr-2 size-5" aria-hidden />
            {label}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          data-testid="dictation-control"
          data-status={status}
          className="min-h-14 w-full text-base"
          variant={succeeded ? "outline" : "default"}
          disabled={busy || blocked}
          onClick={onStart}
        >
          {busy ? <Loader2 className="mr-2 size-5 animate-spin" aria-hidden /> : succeeded ? <CheckCircle2 className="mr-2 size-5 text-success" aria-hidden /> : <Mic className="mr-2 size-5" aria-hidden />}
          {label}
        </Button>
      )}

      <p
        className="text-sm text-foreground-muted"
        aria-live="polite"
        data-testid="dictation-status"
      >
        {status === "listening" && (interim || t("recorder.listening"))}
        {status === "paused" && t("recorder.paused")}
        {status === "requesting" && t("recorder.requestingHint")}
        {status === "transcribing" && t("recorder.transcribingHint")}
        {status === "success" && t("recorder.successHint")}
      </p>

      {errorCode ? (
        <WarningNotice
          title={t(`recorder.errors.${errorCode}.title`, {
            defaultValue: t("recorder.errors.recorder_failed.title"),
          })}
          description={t(`recorder.errors.${errorCode}.body`, {
            defaultValue: t("recorder.errors.recorder_failed.body"),
          })}
        />
      ) : null}

      {failed ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {hasRetryableAudio && onRetryTranscription ? (
            <Button type="button" variant="default" onClick={onRetryTranscription}>
              <RotateCcw className="size-4" aria-hidden />
              {t("recorder.retryTranscription")}
            </Button>
          ) : null}
          {onRecordAgain ? (
            <Button type="button" variant="outline" onClick={onRecordAgain}>
              <Mic className="size-4" aria-hidden />
              {t("recorder.recordAgain")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
