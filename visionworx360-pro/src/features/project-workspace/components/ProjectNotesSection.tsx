import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Archive, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { useNotesQuery, useNoteMutations } from "../hooks/useProjectWorkspace";
import { NoteFormDialog } from "./NoteFormDialog";
import { useLocale } from "@/i18n/format";
import type { NoteDTO } from "../types";

export function ProjectNotesSection({
  projectId,
  roomId = null,
}: {
  projectId: string;
  roomId?: string | null;
}) {
  const { t } = useTranslation("pw");
  const locale = useLocale();
  const q = useNotesQuery(projectId, { roomId });
  const { archive } = useNoteMutations(projectId);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NoteDTO | undefined>();

  return (
    <section aria-labelledby="notes-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="notes-heading" className="text-lg font-semibold">
          {t("notes.title")}
        </h2>
        <Button
          size="sm"
          onClick={() => {
            setEditing(undefined);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 size-4" aria-hidden />
          {t("notes.add")}
        </Button>
      </div>
      {q.isLoading ? (
        <LoadingSpinner label="" />
      ) : q.isError ? (
        <RetryPanel title={t("errors.generic")} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title={t("notes.empty")} description={t("notes.emptyDescription")} />
      ) : (
        <ul className="space-y-2">
          {q.data.map((n) => (
            <li key={n.id}>
              <Card>
                <CardContent className="p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="secondary">{t(`notes.types.${n.noteType}`)}</Badge>
                    {n.isInternal ? <Badge>{t("notes.isInternal")}</Badge> : null}
                    <time className="ml-auto text-xs text-foreground-muted" dateTime={n.createdAt}>
                      {new Date(n.createdAt).toLocaleString(locale)}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                  <div className="mt-2 flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("notes.edit")}
                      onClick={() => {
                        setEditing(n);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("actions.delete")}
                      onClick={async () => {
                        await archive.mutateAsync({ projectId, id: n.id });
                        toast.success(t("notes.toasts.archived"));
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
      <NoteFormDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        roomId={roomId}
        note={editing}
      />
    </section>
  );
}
