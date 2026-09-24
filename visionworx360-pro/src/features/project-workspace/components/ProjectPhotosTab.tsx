import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Archive, Star, StarOff, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { usePhotosQuery, usePhotoMutations } from "../hooks/useProjectWorkspace";
import { useProjectQuery } from "@/features/crm/hooks/useCrm";
import { PhotoUploadDialog } from "./PhotoUploadDialog";
import { SignedImage } from "./SignedImage";
import { cn } from "@/lib/utils";

export function ProjectPhotosTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation("pw");
  const q = usePhotosQuery(projectId);
  const projQ = useProjectQuery(projectId);
  const { archive, setCover, clearCover } = usePhotoMutations(projectId);
  const [open, setOpen] = useState(false);
  const currentCoverId = projQ.data?.coverPhotoId ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold text-foreground">{t("analysis.title")}</h2>
          <p className="text-sm text-foreground-muted">{t("analysis.description")}</p>
        </div>
        <Button
          asChild
          variant="secondary"
          data-testid="view-photo-analysis"
          className="min-h-(--control-min-h) w-full shrink-0 text-base sm:w-auto"
        >
          <Link
            to="/app/remote-vision"
            search={{ projectId, projectName: projQ.data?.name }}
          >
            <ScanSearch className="mr-2 size-5 shrink-0" aria-hidden />
            {t("analysis.open")}
          </Link>
        </Button>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 size-4" aria-hidden />
          {t("photos.add")}
        </Button>
      </div>

      {q.isLoading ? (
        <LoadingSpinner label="" />
      ) : q.isError ? (
        <RetryPanel title={t("errors.generic")} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title={t("photos.empty")} description={t("photos.emptyDescription")} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.map((p) => {
            const isCover = currentCoverId === p.id;
            return (
              <li
                key={p.id}
                className={cn(
                  "flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm",
                  isCover && "ring-2 ring-accent",
                )}
              >
                <div className="relative">
                  <SignedImage
                    projectId={projectId}
                    storagePath={p.storagePath}
                    alt={p.altText ?? p.caption ?? p.fileName}
                    className="aspect-square w-full object-cover"
                    width={400}
                    height={400}
                  />
                  {isCover && (
                    <div
                      className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-foreground shadow-md"
                      aria-label={t("cover.isCover")}
                    >
                      <Star className="size-3 fill-current" aria-hidden />
                      {t("cover.badge")}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={p.fileName}>
                      {p.caption || p.fileName}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-foreground-muted">
                      {t(`photos.types.${p.photoType}`)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                    {isCover ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11 flex-1"
                        onClick={async () => {
                          await clearCover.mutateAsync({ projectId });
                          toast.success(t("cover.toastRemoved"));
                        }}
                      >
                        <StarOff className="mr-1 size-4" aria-hidden />
                        {t("cover.remove")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-11 flex-1"
                        onClick={async () => {
                          await setCover.mutateAsync({ projectId, photoId: p.id });
                          toast.success(t("cover.toastUpdated"));
                        }}
                      >
                        <Star className="mr-1 size-4" aria-hidden />
                        {t("cover.set")}
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("actions.delete")}
                      className="min-h-11 min-w-11"
                      onClick={async () => {
                        await archive.mutateAsync({ projectId, id: p.id });
                        toast.success(t("photos.toasts.archived"));
                      }}
                    >
                      <Archive className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PhotoUploadDialog open={open} onOpenChange={setOpen} projectId={projectId} />
    </div>
  );
}
