import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Camera, Mic, Ruler, Video, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MeasurementInput } from "@/components/inputs/MeasurementInput";
import { formatFeet, parseLengthToFeet } from "@/domains/measurement";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WarningNotice } from "@/components/feedback/Notice";
import { PhotoUploadDialog } from "@/features/project-workspace/components/PhotoUploadDialog";
import { useDictation } from "@/features/voice-capture/hooks/useDictation";
import { DictationControl } from "@/features/voice-capture/components/DictationControl";
import { useProjectDescriptionNote } from "@/features/voice-capture/hooks/useProjectDescriptionNote";
import type { CaptureLanguage } from "@/domains/walkthrough";

interface Props {
  projectId: string;
  projectName: string | null;
  captureLanguage: CaptureLanguage;
  description: string;
  onDescriptionChange: (value: string) => void;
  onAnalyze: () => void;
}

/**
 * Capture-first intake. A brand-new project starts HERE, never on a question
 * list: the contractor records or uploads a walkthrough video, speaks or types
 * what the job is, adds rough dimensions and photos. Only after analysing this
 * project's own evidence do we ask for clarifications.
 */
export function IntakeStep({
  projectId,
  projectName,
  captureLanguage,
  description,
  onDescriptionChange,
  onAnalyze,
}: Props) {
  const { t } = useTranslation("walkthrough");
  const [photoOpen, setPhotoOpen] = useState(false);
  const [dims, setDims] = useState({ length: "", width: "", height: "" });
  const [saving, setSaving] = useState(false);
  const note = useProjectDescriptionNote(projectId);
  const loadedFor = useRef<string | null>(null);

  const latest = useRef(description);
  latest.current = description;

  const dictation = useDictation({
    lang: captureLanguage,
    onFinalSegment: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      onDescriptionChange(latest.current ? `${latest.current.trim()} ${trimmed}` : trimmed);
    },
  });

  /* Reopening the project reloads its saved description — and only its own. */
  useEffect(() => {
    if (note.loading) return;
    if (loadedFor.current === projectId) return;
    loadedFor.current = projectId;
    if (note.text && !latest.current.trim()) onDescriptionChange(note.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, note.loading, note.text]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await note.save(description);
      toast.success(t("intake.saved"));
    } catch {
      // The typed/dictated text is never discarded on failure.
      toast.error(t("intake.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const addDimensions = () => {
    /* The fields hold contractor-formatted imperial text ("7' 10""), so the
       narrative line is built from the normalized reading — never by gluing
       " ft" onto whatever was typed. */
    const say = (raw: string, suffix: string) => {
      const feet = parseLengthToFeet(raw);
      return feet === null ? null : `${formatFeet(feet, { words: true })} ${suffix}`;
    };
    const parts = [
      say(dims.length, "long"),
      say(dims.width, "wide"),
      say(dims.height, "high"),
    ].filter(Boolean);
    if (parts.length === 0) return;
    const line = `${parts.join(", ")}.`;
    onDescriptionChange(description ? `${description.trim()} ${line}` : line);
    setDims({ length: "", width: "", height: "" });
  };


  const hasDescription = description.trim().length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-1 p-4">
          <p className="truncate text-sm font-semibold">{projectName ?? "—"}</p>
          <p className="text-sm text-foreground-muted">{t("intake.freshProject")}</p>
        </CardContent>
      </Card>

      {/* Video: record live or upload a prerecorded walkthrough. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Video className="size-4 text-primary" aria-hidden />
            {t("intake.video.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Button asChild className="min-h-12 w-full">
            <Link
              to="/app/remote-vision"
              search={{ projectId, projectName: projectName ?? undefined }}
            >
              {t("intake.video.record")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-12 w-full">
            <Link
              to="/app/remote-vision"
              search={{ projectId, projectName: projectName ?? undefined }}
            >
              {t("intake.video.upload")}
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Spoken or typed project description. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic className="size-4 text-primary" aria-hidden />
            {t("intake.describe.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-foreground-muted">{t("intake.describe.hint")}</p>

          <DictationControl
            status={dictation.status}
            errorCode={dictation.errorCode}
            interim={dictation.interim}
            elapsedMs={dictation.elapsedMs}
            audioLevel={dictation.audioLevel}
            hasRetryableAudio={dictation.hasRetryableAudio}
            idleLabel={t("intake.describe.record")}
            onStart={() => void dictation.start()}
            onStop={() => dictation.stop()}
            onRetryTranscription={() => dictation.retryTranscription()}
            onRecordAgain={() => dictation.recordAgain()}
          />

          <div className="space-y-2">
            <Label htmlFor="wt-intake-description" className="text-sm font-medium">
              {t("intake.describe.heard")}
            </Label>
            <Textarea
              id="wt-intake-description"
              value={description}
              rows={8}
              className="min-h-40 text-base"
              placeholder={t("intake.describe.placeholder")}
              onChange={(event) => onDescriptionChange(event.target.value)}
            />
          </div>

          <Button
            variant="outline"
            className="min-h-12 w-full"
            disabled={!hasDescription || saving}
            onClick={handleSave}
          >
            {saving ? t("intake.saving") : t("intake.save")}
          </Button>
        </CardContent>
      </Card>

      {/* Rough dimensions and photos. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Ruler className="size-4 text-primary" aria-hidden />
            {t("intake.measure.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(["length", "width", "height"] as const).map((field) => (
              <div key={field} className="space-y-1">
                <Label htmlFor={`wt-dim-${field}`} className="text-xs">
                  {t(`intake.measure.${field}`)}
                </Label>
                <MeasurementInput
                  id={`wt-dim-${field}`}
                  valueFt={parseLengthToFeet(dims[field])}
                  onChangeFt={(feet) =>
                    setDims((prev) => ({ ...prev, [field]: feet === null ? "" : formatFeet(feet) }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" className="min-h-12" onClick={addDimensions}>
              {t("intake.measure.add")}
            </Button>
            <Button variant="outline" className="min-h-12" onClick={() => setPhotoOpen(true)}>
              <Camera className="mr-2 size-4" aria-hidden />
              {t("intake.photos")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button className="min-h-14 w-full text-base" disabled={!hasDescription} onClick={onAnalyze}>
        <Wand2 className="mr-2 size-5" aria-hidden />
        {t("intake.analyze")}
      </Button>

      <PhotoUploadDialog
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        projectId={projectId}
        defaultRoomId={null}
      />
    </div>
  );
}
