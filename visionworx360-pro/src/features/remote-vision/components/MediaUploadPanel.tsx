import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignedImage } from "@/features/project-workspace/components/SignedImage";
import type { RemoteVisionMedia, RemoteVisionMediaKind } from "@/domains/remoteVision";
import type { MediaSaveState } from "../hooks/useRemoteVisionMedia";

interface Props {
  projectId: string | null;
  media: RemoteVisionMedia[];
  saveState: MediaSaveState;
  loading?: boolean;
  onUpload: (kind: RemoteVisionMediaKind, files: File[]) => void;
  onRemove: (id: string) => void;
}

const KINDS: RemoteVisionMediaKind[] = ["before_photo", "after_rendering", "floor_plan"];
const LABEL_KEY: Record<RemoteVisionMediaKind, string> = {
  before_photo: "media.before",
  after_rendering: "media.after",
  floor_plan: "media.plan",
  walkthrough_video: "video.title",
};

export function MediaUploadPanel({
  projectId,
  media,
  saveState,
  loading,
  onUpload,
  onRemove,
}: Props) {
  const { t } = useTranslation("remote-vision");
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("media.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!projectId ? (
          <p className="text-sm text-warning" role="status">
            {t("media.needsProject")}
          </p>
        ) : null}

        <p className="flex items-center gap-2 text-sm" aria-live="polite" data-testid="rv-media-save-state">
          {saveState === "saving" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span className="text-foreground-muted">{t("media.saving")}</span>
            </>
          ) : saveState === "error" ? (
            <>
              <AlertCircle className="size-4 text-destructive" aria-hidden />
              <span className="text-destructive">{t("media.error")}</span>
            </>
          ) : saveState === "saved" ? (
            <>
              <CheckCircle2 className="size-4 text-success" aria-hidden />
              <span className="text-foreground-muted">{t("media.saved")}</span>
            </>
          ) : loading ? (
            <span className="text-foreground-muted">{t("media.loading")}</span>
          ) : null}
        </p>

        {KINDS.map((kind) => {
          const items = media.filter((m) => m.kind === kind);
          return (
            <section key={kind} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{t(LABEL_KEY[kind])}</h3>
                <Badge variant="secondary">{t("media.count", { count: items.length })}</Badge>
              </div>

              <input
                ref={(el) => {
                  inputs.current[kind] = el;
                }}
                type="file"
                multiple
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  onUpload(kind, Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                className="min-h-12 w-full"
                disabled={!projectId || saveState === "saving"}
                onClick={() => inputs.current[kind]?.click()}
              >
                {saveState === "saving" ? (
                  <Loader2 className="mr-2 size-5 animate-spin" aria-hidden />
                ) : (
                  <ImagePlus className="mr-2 size-5" aria-hidden />
                )}
                {saveState === "saving" ? t("media.saving") : t("media.add")}
              </Button>


              {items.length === 0 ? (
                <p className="text-sm text-foreground-muted">{t("media.empty")}</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 rounded-md border border-border p-2"
                    >
                      {m.storagePath && projectId ? (
                        <SignedImage
                          projectId={projectId}
                          storagePath={m.storagePath}
                          alt={m.fileName}
                          className="size-12 shrink-0 rounded object-cover"
                        />
                      ) : m.previewUrl ? (
                        <img
                          src={m.previewUrl}
                          alt={m.fileName}
                          loading="lazy"
                          className="size-12 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="grid size-12 shrink-0 place-items-center rounded bg-muted text-xs">
                          {m.fileName.split(".").pop()?.toUpperCase() ?? "FILE"}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">{m.fileName}</span>
                      <Badge variant={m.storagePath ? "secondary" : "outline"}>
                        {m.storagePath ? t("media.savedBadge") : t("media.pendingBadge")}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11"
                        aria-label={`${t("media.remove")} ${m.fileName}`}
                        onClick={() => onRemove(m.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        <p className="text-xs text-foreground-muted">{t("media.hint")}</p>
      </CardContent>
    </Card>
  );
}
