import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, FileUp, Keyboard, Loader2, Mic, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MeasurementInput } from "@/components/inputs/MeasurementInput";
import { DictationControl } from "@/features/voice-capture/components/DictationControl";
import { useDictation } from "@/features/voice-capture/hooks/useDictation";
import { inchesFromFeet } from "@/domains/measurement";
import type { MeasurementItem } from "@/domains/measurementCapture";
import { useMeasurementCapture } from "../hooks/useMeasurementCapture";

interface Props {
  projectId: string;
  locale: "en-US" | "es-US";
}

/**
 * Measurements as a first-class multi-input workflow: speak a whole sheet,
 * type it in bulk, or upload a plan. Everything lands in one reviewable list
 * with its source, and only contractor-confirmed items become facts.
 */
export function MeasurementsPanel({ projectId, locale }: Props) {
  const { t } = useTranslation("remote-vision");
  const capture = useMeasurementCapture(projectId);
  const [transcript, setTranscript] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const speech = useDictation({
    lang: locale,
    onFinalSegment: (segment) =>
      setTranscript((prev) => `${prev ? `${prev} ` : ""}${segment}`.trim()),
  });

  const submit = async (text: string, source: "spoken" | "typed", clear: () => void) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await capture.addFromText(text, source);
      clear();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4" data-testid="rv-measurements">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t("measurements.title")}</h3>
        <p className="text-sm text-foreground-muted">{t("measurements.hint")}</p>
      </div>

      <Tabs defaultValue="speak">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="speak" className="min-h-11">
            <Mic className="mr-2 size-4" aria-hidden />
            {t("measurements.tabs.speak")}
          </TabsTrigger>
          <TabsTrigger value="type" className="min-h-11">
            <Keyboard className="mr-2 size-4" aria-hidden />
            {t("measurements.tabs.type")}
          </TabsTrigger>
          <TabsTrigger value="plan" className="min-h-11">
            <FileUp className="mr-2 size-4" aria-hidden />
            {t("measurements.tabs.plan")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="speak" className="space-y-3 pt-4">
          <DictationControl
            status={speech.status}
            errorCode={speech.errorCode}
            interim={speech.interim}
            elapsedMs={speech.elapsedMs}
            audioLevel={speech.audioLevel}
            hasRetryableAudio={speech.hasRetryableAudio}
            idleLabel={t("measurements.speak.record")}
            onStart={() => void speech.start()}
            onStop={() => speech.stop()}
            onRetryTranscription={() => speech.retryTranscription()}
            onRecordAgain={() => speech.recordAgain()}
          />
          <Label htmlFor="rv-measure-transcript">{t("measurements.speak.transcript")}</Label>
          <Textarea
            id="rv-measure-transcript"
            className="min-h-32 text-base leading-relaxed"
            placeholder={t("measurements.speak.placeholder")}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
          <Button
            className="min-h-12 w-full"
            disabled={!transcript.trim() || busy}
            onClick={() => void submit(transcript, "spoken", () => setTranscript(""))}
          >
            {t("measurements.speak.add")}
          </Button>
        </TabsContent>

        <TabsContent value="type" className="space-y-3 pt-4">
          <Label htmlFor="rv-measure-typed">{t("measurements.type.title")}</Label>
          <Textarea
            id="rv-measure-typed"
            className="min-h-32 text-base leading-relaxed"
            placeholder={t("measurements.type.placeholder")}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <Button
            className="min-h-12 w-full"
            disabled={!typed.trim() || busy}
            onClick={() => void submit(typed, "typed", () => setTyped(""))}
          >
            {t("measurements.type.add")}
          </Button>
        </TabsContent>

        <TabsContent value="plan" className="space-y-3 pt-4">
          <p className="text-sm text-foreground-muted">{t("measurements.plan.hint")}</p>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void capture.uploadPlan(file);
            }}
          />
          <Button
            variant="outline"
            className="min-h-12 w-full"
            disabled={capture.planState === "uploading" || capture.planState === "reading"}
            onClick={() => fileRef.current?.click()}
          >
            {capture.planState === "uploading" || capture.planState === "reading" ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <FileUp className="mr-2 size-4" aria-hidden />
            )}
            {capture.planState === "reading"
              ? t("measurements.plan.reading")
              : t("measurements.plan.upload")}
          </Button>
          {capture.planError ? (
            <p className="text-sm text-destructive">
              {t(`measurements.plan.errors.${capture.planError}`, {
                defaultValue: t("measurements.plan.errors.extraction_failed"),
              })}
            </p>
          ) : null}
          <p className="text-xs text-foreground-muted">{t("measurements.plan.reviewNote")}</p>
        </TabsContent>
      </Tabs>

      <CapturedList
        items={capture.items}
        onUpdate={(input) => capture.updateItem.mutate(input)}
        onDelete={(id) => capture.deleteItem.mutate(id)}
      />
    </section>
  );
}

function sourceLabelKey(source: MeasurementItem["source"]) {
  return `measurements.source.${source}`;
}

function CapturedList({
  items,
  onUpdate,
  onDelete,
}: {
  items: MeasurementItem[];
  onUpdate: (input: {
    id: string;
    label?: string;
    inches?: number;
    status?: MeasurementItem["status"];
    overridden?: boolean;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("remote-vision");
  if (items.length === 0) {
    return <p className="text-sm text-foreground-muted">{t("measurements.list.empty")}</p>;
  }
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">{t("measurements.list.title")}</h4>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            data-testid="rv-measurement-item"
            data-status={item.status}
            data-source={item.source}
            className="space-y-2 rounded-md border border-border p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t(sourceLabelKey(item.source))}</Badge>
              {item.status === "confirmed" ? (
                <Badge>{t("measurements.status.confirmed")}</Badge>
              ) : (
                <Badge variant="secondary">
                  {t(
                    item.status === "ambiguous"
                      ? "measurements.status.ambiguous"
                      : "measurements.status.candidate",
                  )}
                </Badge>
              )}
              <span className="text-sm font-medium">{item.display}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`rv-m-label-${item.id}`}>{t("measurements.list.label")}</Label>
                <Input
                  id={`rv-m-label-${item.id}`}
                  className="min-h-12"
                  defaultValue={item.label}
                  onBlur={(e) =>
                    e.target.value.trim() && e.target.value !== item.label
                      ? onUpdate({ id: item.id, label: e.target.value.trim(), overridden: true })
                      : undefined
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`rv-m-value-${item.id}`}>{t("measurements.list.value")}</Label>
                <MeasurementInput
                  id={`rv-m-value-${item.id}`}
                  valueFt={item.inches / 12}
                  onChangeFt={(feet) =>
                    feet === null
                      ? undefined
                      : onUpdate({ id: item.id, inches: inchesFromFeet(feet), overridden: true })
                  }
                />
              </div>
            </div>
            {item.rawText ? (
              <p className="text-xs text-foreground-muted">“{item.rawText}”</p>
            ) : null}
            <div className="flex gap-2">
              {item.status !== "confirmed" ? (
                <Button
                  size="sm"
                  className="min-h-11"
                  onClick={() => onUpdate({ id: item.id, status: "confirmed" })}
                >
                  <Check className="mr-2 size-4" aria-hidden />
                  {t("measurements.list.confirm")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11"
                aria-label={`${t("measurements.list.remove")} ${item.label}`}
                onClick={() => onDelete(item.id)}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
