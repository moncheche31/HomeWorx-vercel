import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Keyboard, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WarningNotice } from "@/components/feedback/Notice";
import { DictationControl } from "@/features/voice-capture/components/DictationControl";
import { useDictation } from "@/features/voice-capture/hooks/useDictation";
import { parseMeasurementText } from "@/domains/measurementCapture";
import { selectBindableMeasurement } from "@/domains/estimating/measurementBinding";
import { useEstimateMutations } from "../hooks/useEstimating";

interface Props {
  projectId: string;
  estimateId: string;
  lineId: string;
  description: string;
  unitKey: string | null;
  locale: "en-US" | "es-US";
}

/**
 * Standing in the room, the contractor says the number and the line resolves.
 *
 * Voice is primary; the typed field is always next to it for noisy sites.
 * Nothing commits silently: whatever the existing measurement parser makes of
 * the words is shown back first, and the contractor taps to confirm.
 */
export function LineMeasurementCapture({
  projectId,
  estimateId,
  lineId,
  description,
  unitKey,
  locale,
}: Props) {
  const { t } = useTranslation("estimating");
  const m = useEstimateMutations(projectId, estimateId);
  const [transcript, setTranscript] = useState("");
  const [typed, setTyped] = useState("");
  const [failed, setFailed] = useState(false);

  const speech = useDictation({
    lang: locale,
    onFinalSegment: (segment) =>
      setTranscript((prev) => `${prev ? `${prev} ` : ""}${segment}`.trim()),
  });

  const preview = transcript.trim()
    ? selectBindableMeasurement(unitKey, parseMeasurementText(transcript, { source: "spoken" }))
    : null;

  const submit = async (data: { text?: string; quantity?: number; source: "spoken" | "typed" }) => {
    setFailed(false);
    const result = await m.captureLineMeasurement.mutateAsync({ estimateId, lineId, ...data });
    if (result.status === "needs_review") {
      setFailed(true);
      return;
    }
    setTranscript("");
    setTyped("");
  };

  const typedNumber = Number(typed);
  const typedValid = typed.trim() !== "" && Number.isFinite(typedNumber) && typedNumber > 0;

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface px-3 py-3">
      <p className="text-sm font-medium text-foreground">
        {t("measure.prompt", { description })}
      </p>

      <DictationControl
        status={speech.status}
        errorCode={speech.errorCode}
        interim={speech.interim}
        elapsedMs={speech.elapsedMs}
        audioLevel={speech.audioLevel}
        hasRetryableAudio={speech.hasRetryableAudio}
        onStart={speech.start}
        onStop={speech.stop}
        onRetryTranscription={speech.retryTranscription}
        onRecordAgain={speech.recordAgain}
        idleLabel={t("measure.speak")}
      />

      {transcript ? (
        <div className="space-y-2 rounded-md bg-surface-muted px-3 py-2 text-sm">
          <p className="text-foreground-muted">
            <Mic className="mr-1 inline size-3.5" aria-hidden />
            {transcript}
          </p>
          {preview ? (
            <>
              <p className="font-medium text-foreground">
                {t("measure.heard", { value: preview.bound.formula })}
              </p>
              <Button
                type="button"
                className="touch-target w-full"
                disabled={m.captureLineMeasurement.isPending}
                onClick={() => submit({ text: transcript, source: "spoken" })}
              >
                <Check className="mr-2 size-4" aria-hidden />
                {t("measure.confirm", { quantity: preview.bound.quantity })}
              </Button>
            </>
          ) : (
            <p className="text-foreground-muted">{t("measure.notUnderstood")}</p>
          )}
        </div>
      ) : null}

      {failed ? <WarningNotice title={t("measure.notUnderstood")} /> : null}

      <div className="space-y-1.5">
        <Label htmlFor={`typed-${lineId}`} className="text-xs text-foreground-muted">
          <Keyboard className="mr-1 inline size-3.5" aria-hidden />
          {t("measure.typedLabel", {
            unit: t(`units.${unitKey}`, { defaultValue: unitKey ?? "" }),
          })}
        </Label>
        <div className="flex gap-2">
          <Input
            id={`typed-${lineId}`}
            inputMode="decimal"
            className="touch-target"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="0"
          />
          <Button
            type="button"
            variant="secondary"
            className="touch-target"
            disabled={!typedValid || m.captureLineMeasurement.isPending}
            onClick={() => submit({ quantity: typedNumber, source: "typed" })}
          >
            {t("measure.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
