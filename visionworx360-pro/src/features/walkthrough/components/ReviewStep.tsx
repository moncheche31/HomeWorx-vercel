import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

interface Props {
  drafts: VoiceDraftItem[];
  rooms: VoiceRoomRef[];
  committing: boolean;
  unresolvedCount: number;
  onApprove: (id: string) => void;
  onDelete: (id: string) => void;
  onNeedsReview: (id: string) => void;
  onChange: (id: string, patch: Partial<VoiceDraftItem>) => void;
  onApproveAllHigh: () => void;
  onReviewUncertain: () => void;
  onCommit: () => void;
}

const NO_ROOM = "__none__";

function groupByRoom(drafts: VoiceDraftItem[]) {
  const map = new Map<string, { name: string; items: VoiceDraftItem[] }>();
  for (const draft of drafts) {
    const key = draft.roomId ?? NO_ROOM;
    const entry = map.get(key) ?? { name: draft.roomName ?? "", items: [] };
    entry.items.push(draft);
    map.set(key, entry);
  }
  return [...map.entries()];
}

export function ReviewStep({
  drafts,
  rooms,
  committing,
  unresolvedCount,
  onApprove,
  onDelete,
  onNeedsReview,
  onChange,
  onApproveAllHigh,
  onReviewUncertain,
  onCommit,
}: Props) {
  const { t } = useTranslation("walkthrough");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const approved = drafts.filter((d) => d.status === "approved" && d.selected);
  const groups = groupByRoom(drafts);

  return (
    <div className="space-y-4 pb-40">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" className="min-h-12" onClick={onApproveAllHigh}>
          <Check className="mr-2 size-4" aria-hidden />
          {t("review.approveAllHigh")}
        </Button>
        <Button variant="outline" className="min-h-12" onClick={onReviewUncertain}>
          <AlertTriangle className="mr-2 size-4" aria-hidden />
          {t("review.reviewUncertain", { count: unresolvedCount })}
        </Button>
      </div>

      {drafts.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-foreground-muted">
            {t("review.empty")}
          </CardContent>
        </Card>
      ) : (
        groups.map(([key, group]) => (
          <section key={key} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
              {group.name || t("review.noRoom")}
            </h2>
            <ul className="space-y-2">
              {group.items.map((draft) => {
                const open = expanded[draft.id];
                return (
                  <li key={draft.id}>
                    <Card className={draft.needsReview ? "border-warning/50" : undefined}>
                      <CardContent className="space-y-3 p-4">
                        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
                          <span className="mt-1 shrink-0" aria-hidden>
                            {draft.status === "approved" ? (
                              <Check className="size-5 text-success" />
                            ) : (
                              <AlertTriangle className="size-5 text-warning" />
                            )}
                          </span>
                          <div className="min-w-0 space-y-1">
                            <p className="text-base font-medium leading-snug">{draft.title}</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <ConfidenceBadge level={draft.confidence} />
                              {draft.quantity ? (
                                <span className="text-xs text-foreground-muted">
                                  {draft.quantity} {draft.unitKey ?? ""}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            variant={draft.status === "approved" ? "secondary" : "default"}
                            className="min-h-11"
                            onClick={() => onApprove(draft.id)}
                          >
                            {t("review.approve")}
                          </Button>
                          <Button
                            variant="outline"
                            className="min-h-11"
                            onClick={() =>
                              setExpanded((prev) => ({ ...prev, [draft.id]: !prev[draft.id] }))
                            }
                            aria-expanded={Boolean(open)}
                          >
                            <Pencil className="mr-1 size-4" aria-hidden />
                            {t("review.edit")}
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-11 text-danger"
                            onClick={() => onDelete(draft.id)}
                          >
                            <Trash2 className="mr-1 size-4" aria-hidden />
                            {t("review.delete")}
                          </Button>
                        </div>

                        <Button
                          variant="ghost"
                          className="min-h-11 w-full justify-start text-xs"
                          onClick={() => onNeedsReview(draft.id)}
                        >
                          <ChevronDown className="mr-1 size-4" aria-hidden />
                          {t("review.markNeedsReview")}
                        </Button>

                        {open ? (
                          <div className="space-y-3 rounded-lg border border-border p-3">
                            <div className="space-y-1">
                              <Label htmlFor={`t-${draft.id}`}>{t("review.fields.title")}</Label>
                              <Input
                                id={`t-${draft.id}`}
                                value={draft.title}
                                onChange={(e) => onChange(draft.id, { title: e.target.value })}
                                className="min-h-11 text-base"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label htmlFor={`q-${draft.id}`}>
                                  {t("review.fields.quantity")}
                                </Label>
                                <Input
                                  id={`q-${draft.id}`}
                                  inputMode="decimal"
                                  value={draft.quantity ?? ""}
                                  onChange={(e) =>
                                    onChange(draft.id, {
                                      quantity: e.target.value ? Number(e.target.value) : null,
                                    })
                                  }
                                  className="min-h-11 text-base"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`u-${draft.id}`}>{t("review.fields.unit")}</Label>
                                <Select
                                  value={draft.unitKey ?? NO_ROOM}
                                  onValueChange={(v) =>
                                    onChange(draft.id, { unitKey: v === NO_ROOM ? null : v })
                                  }
                                >
                                  <SelectTrigger id={`u-${draft.id}`} className="min-h-11">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={NO_ROOM}>
                                      {t("review.fields.none")}
                                    </SelectItem>
                                    {SCOPE_UNITS.map((u) => (
                                      <SelectItem key={u} value={u}>
                                        {u}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`r-${draft.id}`}>{t("review.fields.room")}</Label>
                              <Select
                                value={draft.roomId ?? NO_ROOM}
                                onValueChange={(v) =>
                                  onChange(draft.id, {
                                    roomId: v === NO_ROOM ? null : v,
                                    roomName: rooms.find((r) => r.id === v)?.name ?? draft.roomName,
                                  })
                                }
                              >
                                <SelectTrigger id={`r-${draft.id}`} className="min-h-11">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NO_ROOM}>{t("review.noRoom")}</SelectItem>
                                  {rooms
                                    .filter((r) => r.id)
                                    .map((r) => (
                                      <SelectItem key={r.id as string} value={r.id as string}>
                                        {r.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <Button
            className="min-h-14 w-full text-base"
            disabled={approved.length === 0 || committing}
            onClick={onCommit}
          >
            {committing ? t("review.adding") : t("review.addApproved", { count: approved.length })}
          </Button>
        </div>
      </div>
    </div>
  );
}
