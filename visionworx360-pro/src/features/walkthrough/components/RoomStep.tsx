import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { useRoomsQuery } from "@/features/project-workspace/hooks/useProjectWorkspace";
import { RoomFormDialog } from "@/features/project-workspace/components/RoomFormDialog";

interface Props {
  projectId: string;
  selectedId: string | null;
  onSelect: (id: string, name: string) => void;
}

interface RoomRow {
  id: string;
  name: string;
  roomType?: string | null;
}

export function RoomStep({ projectId, selectedId, onSelect }: Props) {
  const { t } = useTranslation("walkthrough");
  const query = useRoomsQuery(projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const rooms = (query.data as RoomRow[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      {query.isLoading ? (
        <LoadingSpinner label={t("common.loading")} />
      ) : query.isError ? (
        <RetryPanel title={t("common.loadFailed")} onRetry={() => query.refetch()} />
      ) : rooms.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-center text-sm text-foreground-muted">
            {t("room.empty")}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {rooms.map((room) => (
            <li key={room.id}>
              <button
                type="button"
                onClick={() => onSelect(room.id, room.name)}
                aria-pressed={selectedId === room.id}
                className={`flex min-h-16 w-full items-center justify-center rounded-lg border px-3 text-center text-base font-medium transition-colors ${
                  selectedId === room.id
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:bg-secondary/60"
                }`}
              >
                <span className="line-clamp-2">{room.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" className="min-h-12 w-full" onClick={() => setCreateOpen(true)}>
        <Plus className="mr-2 size-4" aria-hidden />
        {t("room.create")}
      </Button>

      <RoomFormDialog open={createOpen} onOpenChange={setCreateOpen} projectId={projectId} />
    </div>
  );
}
