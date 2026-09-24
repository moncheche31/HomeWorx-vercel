import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Archive, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { useRoomsQuery, useRoomMutations } from "../hooks/useProjectWorkspace";
import { RoomFormDialog } from "./RoomFormDialog";
import type { RoomDTO } from "../types";

export function ProjectRoomsTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation("pw");
  const q = useRoomsQuery(projectId);
  const { archive } = useRoomMutations(projectId);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RoomDTO | undefined>();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(undefined);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 size-4" aria-hidden />
          {t("rooms.add")}
        </Button>
      </div>
      {q.isLoading ? (
        <LoadingSpinner label="" />
      ) : q.isError ? (
        <RetryPanel title={t("errors.generic")} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title={t("rooms.empty")} description={t("rooms.emptyDescription")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {q.data.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Link
                      to="/app/projects/$projectId/rooms/$roomId"
                      params={{ projectId, roomId: r.id }}
                      className="block truncate font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {t(`rooms.types.${r.roomType}`)}
                      {r.floorLevel ? ` · ${r.floorLevel}` : ""}
                    </p>
                    {r.description ? (
                      <p className="mt-2 line-clamp-2 text-sm text-foreground-muted">
                        {r.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("rooms.edit")}
                      onClick={() => {
                        setEditing(r);
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
                        await archive.mutateAsync({ projectId, id: r.id });
                        toast.success(t("rooms.toasts.archived"));
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
      <RoomFormDialog open={open} onOpenChange={setOpen} projectId={projectId} room={editing} />
    </div>
  );
}
