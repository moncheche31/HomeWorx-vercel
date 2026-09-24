import { useTranslation } from "react-i18next";
import { Check, Merge, Scissors, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfidenceBadge } from "@/components/confidence/ConfidenceBadge";
import { SCOPE_UNITS } from "@/features/scope/catalog";
import type { VoiceDraftItem, VoiceRoomRef } from "@/domains/voiceCapture";
import { cn } from "@/lib/utils";

interface Props {
  draft: VoiceDraftItem;
  rooms: VoiceRoomRef[];
  onToggle: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onMerge: (id: string) => void;
  onSplit: (id: string) => void;
  onChange: (id: string, patch: Partial<VoiceDraftItem>) => void;
}

const NONE = "__none__";

export function DraftItemCard({
  draft,
  rooms,
  onToggle,
  onApprove,
  onReject,
  onMerge,
  onSplit,
  onChange,
}: Props) {
  const { t } = useTranslation("voice");
  const rejected = draft.status === "rejected";

  return (
    <Card className={cn(rejected && "opacity-60", draft.needsReview && "border-warning/50")}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={draft.selected}
            onCheckedChange={() => onToggle(draft.id)}
            aria-label={t("capture.review.select")}
            className="mt-1 size-6"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              value={draft.title}
              onChange={(e) => onChange(draft.id, { title: e.target.value })}
              placeholder={t("capture.review.titlePlaceholder")}
              className="min-h-11 text-base font-medium"
              aria-label={t("capture.review.titlePlaceholder")}
            />
            <div className="flex flex-wrap items-center gap-2">
              <ConfidenceBadge level={draft.confidence} />
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {draft.origin === "knowledge_base"
                  ? (draft.matches[0]?.workItem ?? t("capture.review.kbMatch"))
                  : t("capture.review.customItem")}
              </span>
              {draft.tradeKey ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{draft.tradeKey}</span>
              ) : null}
              {draft.measurements.map((m) => (
                <span key={m.raw} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {m.raw}
                </span>
              ))}
            </div>
          </div>
        </div>

        {draft.matches.length > 1 ? (
          <div className="space-y-1">
            <Label className="text-xs">{t("capture.review.assembly")}</Label>
            <Select
              value={draft.assemblyKey ?? NONE}
              onValueChange={(v) => {
                const match = draft.matches.find((m) => m.assemblyKey === v);
                onChange(draft.id, {
                  assemblyKey: v === NONE ? null : v,
                  origin: v === NONE ? "custom" : "knowledge_base",
                  tradeKey: match?.tradeKey ?? draft.tradeKey,
                  categoryKey: match?.categoryKey ?? draft.categoryKey,
                  subcategoryKey: match?.subcategoryKey ?? draft.subcategoryKey,
                  unitKey: draft.unitKey ?? match?.unitKey ?? null,
                  needsReview: false,
                });
              }}
            >
              <SelectTrigger className="min-h-11">
                <SelectValue placeholder={t("capture.review.assembly")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("capture.review.customItem")}</SelectItem>
                {draft.matches.map((m) => (
                  <SelectItem key={m.assemblyKey} value={m.assemblyKey}>
                    {m.workItem}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`qty-${draft.id}`}>
              {t("capture.review.quantity")}
            </Label>
            <Input
              id={`qty-${draft.id}`}
              type="number"
              inputMode="decimal"
              min={0}
              value={draft.quantity ?? ""}
              onChange={(e) =>
                onChange(draft.id, {
                  quantity: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="min-h-11"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("capture.review.unit")}</Label>
            <Select
              value={draft.unitKey ?? NONE}
              onValueChange={(v) => onChange(draft.id, { unitKey: v === NONE ? null : v })}
            >
              <SelectTrigger className="min-h-11">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {SCOPE_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <Label className="text-xs">{t("capture.review.room")}</Label>
            <Select
              value={draft.roomId ?? NONE}
              onValueChange={(v) =>
                onChange(draft.id, {
                  roomId: v === NONE ? null : v,
                  roomName: rooms.find((r) => r.id === v)?.name ?? null,
                })
              }
            >
              <SelectTrigger className="min-h-11">
                <SelectValue placeholder={t("capture.review.noRoom")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("capture.review.noRoom")}</SelectItem>
                {rooms
                  .filter((r) => r.id)
                  .map((r) => (
                    <SelectItem key={r.id!} value={r.id!}>
                      {r.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          “{draft.sourceText || t("capture.review.manualEntry")}”
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={draft.status === "approved" ? "default" : "outline"}
            className="min-h-11 flex-1"
            onClick={() => onApprove(draft.id)}
          >
            <Check aria-hidden className="size-4" />
            {t("capture.review.approve")}
          </Button>
          <Button
            size="sm"
            variant={rejected ? "destructive" : "outline"}
            className="min-h-11 flex-1"
            onClick={() => onReject(draft.id)}
          >
            <X aria-hidden className="size-4" />
            {t("capture.review.reject")}
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={() => onMerge(draft.id)}>
            <Merge aria-hidden className="size-4" />
            {t("capture.review.merge")}
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={() => onSplit(draft.id)}>
            <Scissors aria-hidden className="size-4" />
            {t("capture.review.split")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
