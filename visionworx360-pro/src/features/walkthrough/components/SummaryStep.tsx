import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { WalkthroughRoomProgress } from "@/domains/walkthrough";
import { trackWalkthroughEvent } from "../analytics";
import { EstimateCommitActions } from "@/features/estimating/components/EstimateCommitActions";

interface Props {
  projectId: string;
  completedRooms: WalkthroughRoomProgress[];
  onAnotherRoom: () => void;
  onFinish: () => void;
}

export function SummaryStep({ projectId, completedRooms, onAnotherRoom, onFinish }: Props) {
  const { t } = useTranslation("walkthrough");
  const total = completedRooms.reduce((sum, r) => sum + r.approvedCount, 0);

  return (
    <div className="space-y-4">
      <Card className="border-success/40">
        <CardContent className="space-y-2 p-5 text-center">
          <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden />
          <p className="text-base font-semibold">{t("summary.added", { count: total })}</p>
          <p className="text-sm text-foreground-muted">{t("summary.hint")}</p>
        </CardContent>
      </Card>

      {/* Same next actions as every other intake mode. */}
      <EstimateCommitActions projectId={projectId} />

      {completedRooms.length > 0 ? (
        <ul className="space-y-2">
          {completedRooms.map((room, index) => (
            <li
              key={`${room.roomId ?? "none"}-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border p-4"
            >
              <span className="truncate text-sm font-medium">
                {room.roomName || t("review.noRoom")}
              </span>
              <span className="shrink-0 text-xs text-foreground-muted">
                {t("summary.itemCount", { count: room.approvedCount })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Button className="min-h-14 w-full text-base" onClick={onAnotherRoom}>
        <Plus className="mr-2 size-5" aria-hidden />
        {t("summary.anotherRoom")}
      </Button>

      <Button asChild variant="outline" className="min-h-12 w-full" onClick={onFinish}>
        <Link to="/app/projects/$projectId" params={{ projectId }}>
          {t("summary.finish")}
        </Link>
      </Button>

      <Button
        asChild
        variant="ghost"
        className="min-h-12 w-full"
        onClick={() => trackWalkthroughEvent("advanced_edit_opened", {})}
      >
        <Link to="/app/projects/$projectId" params={{ projectId }}>
          <Settings2 className="mr-2 size-4" aria-hidden />
          {t("summary.advancedEdit")}
        </Link>
      </Button>
    </div>
  );
}
