import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DraftItemCard } from "./DraftItemCard";
import type { VoiceDraftItem, VoiceRoomRef } from "@/domains/voiceCapture";

interface Props {
  drafts: VoiceDraftItem[];
  rooms: VoiceRoomRef[];
  committing: boolean;
  onToggle: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onMerge: (id: string) => void;
  onSplit: (id: string) => void;
  onChange: (id: string, patch: Partial<VoiceDraftItem>) => void;
  onAddCustom: () => void;
  onBack: () => void;
  onCommit: () => void;
}

export function DraftReviewList({
  drafts,
  rooms,
  committing,
  onToggle,
  onApprove,
  onReject,
  onMerge,
  onSplit,
  onChange,
  onAddCustom,
  onBack,
  onCommit,
}: Props) {
  const { t } = useTranslation("voice");
  const selected = drafts.filter((d) => d.selected && d.status !== "rejected");
  const reviewed = drafts.filter((d) => d.status !== "pending").length;
  const progress = drafts.length ? Math.round((reviewed / drafts.length) * 100) : 0;

  return (
    <div className="space-y-4 pb-28">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {t("capture.review.progress", { reviewed, total: drafts.length })}
          </span>
          <span className="text-muted-foreground">
            {t("capture.review.selected", { count: selected.length })}
          </span>
        </div>
        <Progress value={progress} aria-label={t("capture.review.progressLabel")} />
      </div>

      {drafts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("capture.review.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <DraftItemCard
              key={draft.id}
              draft={draft}
              rooms={rooms}
              onToggle={onToggle}
              onApprove={onApprove}
              onReject={onReject}
              onMerge={onMerge}
              onSplit={onSplit}
              onChange={onChange}
            />
          ))}
        </div>
      )}

      <Button variant="outline" className="min-h-12 w-full" onClick={onAddCustom}>
        {t("capture.review.addCustom")}
      </Button>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-3">
          <Button variant="outline" className="min-h-14 flex-1" onClick={onBack}>
            {t("capture.review.back")}
          </Button>
          <Button
            className="min-h-14 flex-[2] text-base"
            disabled={selected.length === 0 || committing}
            onClick={onCommit}
          >
            {committing
              ? t("capture.review.confirming")
              : t("capture.review.confirm", { count: selected.length })}
          </Button>
        </div>
      </div>
    </div>
  );
}
