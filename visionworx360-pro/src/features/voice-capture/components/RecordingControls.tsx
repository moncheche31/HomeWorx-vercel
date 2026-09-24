import { useTranslation } from "react-i18next";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VoiceCaptureState } from "@/domains/voiceCapture";
import { DictationControl } from "./DictationControl";
import type { DictationErrorCode, DictationStatus } from "../hooks/useDictation";

interface Props {
  state: VoiceCaptureState;
  status: DictationStatus;
  errorCode: DictationErrorCode | null;
  interim: string;
  elapsedMs: number;
  audioLevel: number;
  hasRetryableAudio: boolean;
  hasTranscript: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReview: () => void;
  onRetryTranscription: () => void;
  onRecordAgain: () => void;
}

/** Large jobsite-friendly controls (min 56px targets). */
export function RecordingControls({
  state,
  status,
  errorCode,
  interim,
  elapsedMs,
  audioLevel,
  hasRetryableAudio,
  hasTranscript,
  onStart,
  onPause,
  onResume,
  onStop,
  onReview,
  onRetryTranscription,
  onRecordAgain,
}: Props) {
  const { t } = useTranslation("voice");

  return (
    <div className="space-y-3">
      <DictationControl
        status={status}
        errorCode={errorCode}
        interim={interim}
        elapsedMs={elapsedMs}
        audioLevel={audioLevel}
        hasRetryableAudio={hasRetryableAudio}
        onStart={onStart}
        onStop={onStop}
        onRetryTranscription={onRetryTranscription}
        onRecordAgain={onRecordAgain}
      />
      <Button
        size="lg"
        variant={hasTranscript ? "default" : "outline"}
        className="min-h-14 w-full text-base sm:w-auto sm:flex-1"
        disabled={!hasTranscript}
        onClick={onReview}
      >
        <ListChecks aria-hidden className="size-5" />
        {t("capture.controls.review")}
      </Button>
    </div>
  );
}
