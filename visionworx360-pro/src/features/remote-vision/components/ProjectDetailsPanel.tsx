import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MeasurementInput } from "@/components/inputs/MeasurementInput";
import { useDictation } from "@/features/voice-capture/hooks/useDictation";
import { DictationControl } from "@/features/voice-capture/components/DictationControl";
import { emptyDimensions, type RemoteVisionDimensions } from "@/domains/remoteVision";
import { MeasurementsPanel } from "./MeasurementsPanel";

interface Props {
  locale: "en-US" | "es-US";
  /** When linked, measurements become a durable multi-input workflow. */
  projectId?: string | null;
  voiceTranscript: string;
  typedNotes: string;
  dimensions: RemoteVisionDimensions[];
  onVoiceTranscriptChange: (text: string) => void;
  onTypedNotesChange: (text: string) => void;
  onDimensionsChange: (dimensions: RemoteVisionDimensions[]) => void;
}

type NumericField = "lengthFt" | "widthFt" | "ceilingHeightFt";
const NUMERIC_FIELDS: NumericField[] = ["lengthFt", "widthFt", "ceilingHeightFt"];


/**
 * "Add project details" — everything the contractor adds AFTER the media is
 * uploaded: a spoken note, typed notes, and simple measurements. These are
 * contractor facts and are labelled as such; media stays evidence-only.
 */
export function ProjectDetailsPanel({
  locale,
  projectId,
  voiceTranscript,
  typedNotes,
  dimensions,
  onVoiceTranscriptChange,
  onTypedNotesChange,
  onDimensionsChange,
}: Props) {
  const { t } = useTranslation("remote-vision");
  const speech = useDictation({
    lang: locale,
    onFinalSegment: (segment) =>
      onVoiceTranscriptChange(`${voiceTranscript ? `${voiceTranscript} ` : ""}${segment}`.trim()),
  });

  const patch = (id: string, next: Partial<RemoteVisionDimensions>) =>
    onDimensionsChange(dimensions.map((d) => (d.id === id ? { ...d, ...next } : d)));

  return (
    <Card data-testid="remote-vision-details">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("details.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-foreground-muted">{t("details.hint")}</p>

        {/* Voice note */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium">{t("details.voice.title")}</h3>
          <DictationControl
            status={speech.status}
            errorCode={speech.errorCode}
            interim={speech.interim}
            elapsedMs={speech.elapsedMs}
            audioLevel={speech.audioLevel}
            hasRetryableAudio={speech.hasRetryableAudio}
            idleLabel={t("details.voice.record")}
            onStart={() => void speech.start()}
            onStop={() => speech.stop()}
            onRetryTranscription={() => speech.retryTranscription()}
            onRecordAgain={() => speech.recordAgain()}
          />
          <Label htmlFor="rv-transcript">{t("details.voice.transcript")}</Label>
          <Textarea
            id="rv-transcript"
            className="min-h-32 text-base leading-relaxed"
            placeholder={t("details.voice.placeholder")}
            value={voiceTranscript}
            onChange={(e) => onVoiceTranscriptChange(e.target.value)}
          />
        </section>

        {/* Typed notes */}
        <section className="space-y-2">
          <Label htmlFor="rv-notes">{t("details.notes.title")}</Label>
          <Textarea
            id="rv-notes"
            className="min-h-32 text-base leading-relaxed"
            placeholder={t("details.notes.placeholder")}
            value={typedNotes}
            onChange={(e) => onTypedNotesChange(e.target.value)}
          />
        </section>

        {/* Measurements — durable multi-input capture once a project is linked. */}
        {projectId ? <MeasurementsPanel projectId={projectId} locale={locale} /> : null}

        <section className="space-y-3" hidden={!!projectId}>
          <h3 className="text-sm font-medium">{t("details.dimensions.title")}</h3>
          <p className="text-sm text-foreground-muted">{t("details.dimensions.hint")}</p>

          {dimensions.map((d, index) => (
            <div key={d.id} className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor={`rv-room-${d.id}`}>{t("details.dimensions.room")}</Label>
                  <Input
                    id={`rv-room-${d.id}`}
                    className="min-h-12"
                    placeholder={t("details.dimensions.roomPlaceholder")}
                    value={d.roomLabel}
                    onChange={(e) => patch(d.id, { roomLabel: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11"
                  aria-label={`${t("details.dimensions.remove")} ${index + 1}`}
                  onClick={() => onDimensionsChange(dimensions.filter((x) => x.id !== d.id))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {NUMERIC_FIELDS.map((field) => (
                  <div key={field} className="space-y-1">
                    <Label htmlFor={`rv-${field}-${d.id}`}>
                      {t(`details.dimensions.${field}`)}
                    </Label>
                    <MeasurementInput
                      id={`rv-${field}-${d.id}`}
                      valueFt={d[field] ?? null}
                      onChangeFt={(feet) => patch(d.id, { [field]: feet })}
                    />

                  </div>
                ))}
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            className="min-h-12 w-full"
            onClick={() =>
              onDimensionsChange([...dimensions, emptyDimensions(crypto.randomUUID())])
            }
          >
            <Plus className="mr-2 size-4" aria-hidden />
            {t("details.dimensions.add")}
          </Button>
        </section>

        <p className="text-xs text-foreground-muted">{t("details.saved")}</p>
      </CardContent>
    </Card>
  );
}
