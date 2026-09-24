import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Film, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  VIDEO_MIME_TYPES,
  validateVideoFile,
  type RemoteVisionMedia,
} from "@/domains/remoteVision";
import { extractKeyframes } from "../services/videoKeyframes";
import { useRemoteVisionVideoUpload } from "../hooks/useRemoteVisionVideoUpload";

interface Props {
  projectId: string | null;
  media: RemoteVisionMedia[];
  onAdd: (media: RemoteVisionMedia[]) => void;
  onUpdate: (id: string, patch: Partial<RemoteVisionMedia>) => void;
  onRemove: (id: string) => void;
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clock(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Prerecorded walkthrough video intake. The contractor records on site with
 * whatever camera they already use, then uploads later from the office.
 */
export function VideoUploadPanel({ projectId, media, onAdd, onUpdate, onRemove }: Props) {
  const { t } = useTranslation("remote-vision");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { upload, canUpload } = useRemoteVisionVideoUpload(projectId);
  const videos = media.filter((m) => m.kind === "walkthrough_video");

  const handleFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;

    const preError = validateVideoFile({ mimeType: file.type, sizeBytes: file.size });
    if (preError) {
      setError(
        t(`video.errors.${preError}`, {
          maxMb: Math.round(MAX_VIDEO_BYTES / (1024 * 1024)),
          maxMinutes: Math.round(MAX_VIDEO_SECONDS / 60),
        }),
      );
      return;
    }

    const id = `walkthrough_video-${crypto.randomUUID()}`;
    const item: RemoteVisionMedia = {
      id,
      kind: "walkthrough_video",
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      previewUrl: URL.createObjectURL(file),
      storagePath: null,
      roomHint: null,
      createdAt: new Date().toISOString(),
      durationSeconds: null,
      keyframeCount: 0,
      keyframePreviews: [],
      uploadState: canUpload ? "uploading" : "local",
      uploadError: null,
    };
    onAdd([item]);

    // Representative frames — deterministic, no AI, no measurements.
    const { durationSeconds, frames } = await extractKeyframes(file);
    const durationError = validateVideoFile({
      mimeType: file.type,
      sizeBytes: file.size,
      durationSeconds,
    });
    if (durationError === "too_long") {
      onUpdate(id, {
        uploadState: "error",
        uploadError: t("video.errors.too_long", {
          maxMinutes: Math.round(MAX_VIDEO_SECONDS / 60),
        }),
        durationSeconds,
      });
      return;
    }
    onUpdate(id, {
      durationSeconds,
      keyframeCount: frames.length,
      keyframePreviews: frames,
    });

    if (!canUpload) {
      onUpdate(id, { uploadState: "local" });
      return;
    }
    try {
      const { storagePath } = await upload(file);
      onUpdate(id, { uploadState: "uploaded", storagePath, uploadError: null });
    } catch {
      onUpdate(id, { uploadState: "error", uploadError: t("video.errors.upload") });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("video.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground-muted">{t("video.hint")}</p>

        <input
          ref={inputRef}
          type="file"
          accept={VIDEO_MIME_TYPES.join(",")}
          data-testid="remote-vision-video-input"
          aria-label={t("video.add")}
          className="sr-only"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          className="min-h-14 w-full text-base"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-2 size-5" aria-hidden />
          {t("video.add")}
        </Button>

        {!canUpload ? <p className="text-sm text-warning">{t("video.noProject")}</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {videos.length === 0 ? (
          <p className="text-sm text-foreground-muted">{t("video.empty")}</p>
        ) : (
          <ul className="space-y-3">
            {videos.map((v) => (
              <li key={v.id} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-start gap-3">
                  <Film className="mt-1 size-5 shrink-0 text-foreground-muted" aria-hidden />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-medium">{v.fileName}</p>
                    <p className="text-xs text-foreground-muted">
                      {mb(v.sizeBytes)} · {clock(v.durationSeconds)} · {v.mimeType}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant={v.uploadState === "error" ? "destructive" : "secondary"}
                        data-testid={`video-state-${v.id}`}
                      >
                        {t(`video.state.${v.uploadState ?? "local"}`)}
                      </Badge>
                      <Badge variant="outline">
                        {t("video.frames", { count: v.keyframeCount ?? 0 })}
                      </Badge>
                    </div>
                    {v.uploadError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {v.uploadError}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11"
                    aria-label={`${t("video.remove")} ${v.fileName}`}
                    onClick={() => onRemove(v.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>

                {v.keyframePreviews?.length ? (
                  <ul className="flex gap-2 overflow-x-auto">
                    {v.keyframePreviews.map((src, i) => (
                      <li key={`${v.id}-frame-${i}`}>
                        <img
                          src={src}
                          alt={t("video.frameAlt", { index: i + 1, name: v.fileName })}
                          loading="lazy"
                          className="h-16 w-24 rounded object-cover"
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-foreground-muted">
          {t("video.limits", {
            maxMb: Math.round(MAX_VIDEO_BYTES / (1024 * 1024)),
            maxMinutes: Math.round(MAX_VIDEO_SECONDS / 60),
          })}
        </p>
        <p className="text-xs text-foreground-muted">{t("video.evidence")}</p>
      </CardContent>
    </Card>
  );
}
