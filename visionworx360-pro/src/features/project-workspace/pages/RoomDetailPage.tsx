import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Archive } from "lucide-react";
import {
  WorkspaceBackFooter,
  workspaceBackLinkClass,
} from "@/components/navigation/workspaceBack";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import {
  useRoomsQuery,
  useRoomMutations,
  usePhotosQuery,
  useDocumentsQuery,
} from "../hooks/useProjectWorkspace";
import { RoomFormDialog } from "../components/RoomFormDialog";
import { ProjectNotesSection } from "../components/ProjectNotesSection";
import { SignedImage } from "../components/SignedImage";
import { RoomScopeSection } from "@/features/scope/components/RoomScopeSection";

export function RoomDetailPage({
  projectId,
  roomId,
}: {
  projectId: string;
  roomId: string;
}) {
  const { t } = useTranslation("pw");
  const roomsQ = useRoomsQuery(projectId, true);
  const photosQ = usePhotosQuery(projectId);
  const docsQ = useDocumentsQuery(projectId);
  const { archive } = useRoomMutations(projectId);
  const [editOpen, setEditOpen] = useState(false);

  if (roomsQ.isLoading) return <LoadingSpinner label="" />;
  if (roomsQ.isError)
    return <RetryPanel title={t("errors.generic")} onRetry={() => roomsQ.refetch()} />;
  const room = roomsQ.data?.find((r) => r.id === roomId);
  if (!room)
    return (
      <div className="p-8">
        <EmptyState title={t("rooms.empty")} description={t("rooms.emptyDescription")} />
      </div>
    );

  const roomPhotos = (photosQ.data ?? []).filter((p) => p.roomId === roomId);
  const roomDocs = (docsQ.data ?? []).filter((d) => d.roomId === roomId);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <Link
        to="/app/projects/$projectId"
        params={{ projectId }}
        aria-label={t("nav.backToProject")}
        className={workspaceBackLinkClass("top", "mb-4")}
      >
        <ArrowLeft className="size-5 shrink-0" aria-hidden />
        <span>{t("nav.backToProject")}</span>
      </Link>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">{room.name}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {t(`rooms.types.${room.roomType}`)}
            {room.floorLevel ? ` · ${room.floorLevel}` : ""}
          </p>
          {room.description ? (
            <p className="mt-2 max-w-2xl text-sm text-foreground-muted whitespace-pre-wrap">
              {room.description}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 size-4" aria-hidden />
            {t("rooms.edit")}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await archive.mutateAsync({ projectId, id: room.id });
              toast.success(t("rooms.toasts.archived"));
            }}
          >
            <Archive className="mr-1 size-4" aria-hidden />
            {t("actions.delete")}
          </Button>
        </div>
      </header>

      <div className="space-y-8">
        <ProjectNotesSection projectId={projectId} roomId={roomId} />

        <RoomScopeSection projectId={projectId} roomId={roomId} />


        <section aria-labelledby="room-photos" className="space-y-3">
          <h2 id="room-photos" className="text-lg font-semibold">
            {t("photos.title")}
          </h2>
          {roomPhotos.length === 0 ? (
            <EmptyState title={t("photos.empty")} description={t("photos.emptyDescription")} />
          ) : (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {roomPhotos.map((p) => (
                <li key={p.id}>
                  <SignedImage
                    projectId={projectId}
                    storagePath={p.storagePath}
                    alt={p.altText ?? p.caption ?? p.fileName}
                    className="aspect-square w-full rounded-md object-cover"
                  />
                  <p className="mt-1 truncate text-xs text-foreground-muted" title={p.fileName}>
                    {p.caption || p.fileName}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="room-docs" className="space-y-3">
          <h2 id="room-docs" className="text-lg font-semibold">
            {t("documents.title")}
          </h2>
          {roomDocs.length === 0 ? (
            <EmptyState
              title={t("documents.empty")}
              description={t("documents.emptyDescription")}
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {roomDocs.map((d) => (
                <li key={d.id}>
                  <Card>
                    <CardContent className="p-4">
                      <p className="truncate font-medium" title={d.fileName}>
                        {d.fileName}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {t(`documents.types.${d.documentType}`)}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <RoomFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        projectId={projectId}
        room={room}
      />

      <WorkspaceBackFooter>
        <Link
          to="/app/projects/$projectId"
          params={{ projectId }}
          aria-label={t("nav.backToProject")}
          className={workspaceBackLinkClass("bottom")}
        >
          <ArrowLeft className="size-5 shrink-0" aria-hidden />
          <span>{t("nav.backToProject")}</span>
        </Link>
      </WorkspaceBackFooter>
    </div>
  );
}
