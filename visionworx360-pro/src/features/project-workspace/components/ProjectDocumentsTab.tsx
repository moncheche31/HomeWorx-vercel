import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Archive, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import {
  useDocumentsQuery,
  useDocumentMutations,
  useDownloadUrl,
} from "../hooks/useProjectWorkspace";
import { DocumentUploadDialog } from "./DocumentUploadDialog";

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ProjectDocumentsTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation("pw");
  const q = useDocumentsQuery(projectId);
  const { archive } = useDocumentMutations(projectId);
  const download = useDownloadUrl();
  const [open, setOpen] = useState(false);

  const handleDownload = async (storagePath: string) => {
    try {
      const { url } = await download.mutateAsync({ projectId, storagePath });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error((err as Error).message || t("errors.generic"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 size-4" aria-hidden />
          {t("documents.add")}
        </Button>
      </div>
      {q.isLoading ? (
        <LoadingSpinner label="" />
      ) : q.isError ? (
        <RetryPanel title={t("errors.generic")} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title={t("documents.empty")} description={t("documents.emptyDescription")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {q.data.map((d) => (
            <li key={d.id}>
              <Card>
                <CardContent className="flex items-start gap-3 p-4">
                  <FileText className="size-8 shrink-0 text-foreground-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={d.fileName}>
                      {d.fileName}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {t(`documents.types.${d.documentType}`)} · {bytes(d.fileSize)}
                    </p>
                    {d.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-foreground-muted">
                        {d.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("documents.download")}
                      onClick={() => handleDownload(d.storagePath)}
                    >
                      <Download className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("actions.delete")}
                      onClick={async () => {
                        await archive.mutateAsync({ projectId, id: d.id });
                        toast.success(t("documents.toasts.archived"));
                      }}
                    >
                      <Archive className="size-4" aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <DocumentUploadDialog open={open} onOpenChange={setOpen} projectId={projectId} />
    </div>
  );
}
