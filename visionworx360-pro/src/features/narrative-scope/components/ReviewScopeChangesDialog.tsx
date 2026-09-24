import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, MinusCircle, PencilLine, PlusCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProposedScopeChange } from "@/domains/scopeInterpretation";

interface Props {
  open: boolean;
  changes: readonly ProposedScopeChange[];
  pending?: boolean;
  onCancel: () => void;
  onApply: (changes: ProposedScopeChange[]) => void;
}

const ICONS = {
  add: PlusCircle,
  update: PencilLine,
  remove: MinusCircle,
} as const;

/**
 * "Review Scope Changes" — the contractor confirms what the narrative edit
 * means before it touches priced work. Every proposed change, removals
 * included, starts selected so an intentional narrative removal actually gets
 * applied; nothing happens until "Apply changes" is pressed, and a removal only
 * ever excludes the scope item — it is never deleted and its pricing survives.
 */
export function ReviewScopeChangesDialog({ open, changes, pending, onCancel, onApply }: Props) {
  const { t } = useTranslation("narrative");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    setSelected(Object.fromEntries(changes.map((c) => [c.id, true])));
  }, [open, changes]);

  const chosen = useMemo(
    () => changes.filter((c) => selected[c.id]),
    [changes, selected],
  );

  const groups: Array<{ kind: ProposedScopeChange["kind"]; label: string }> = [
    { kind: "add", label: t("review.added") },
    { kind: "update", label: t("review.changed") },
    { kind: "remove", label: t("review.removed") },
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="review-scope-changes">
        <DialogHeader>
          <DialogTitle>{t("review.title")}</DialogTitle>
          <DialogDescription>{t("review.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {groups.map((group) => {
            const rows = changes.filter((c) => c.kind === group.kind);
            if (rows.length === 0) return null;
            const Icon = ICONS[group.kind];
            return (
              <section key={group.kind} className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
                  <Icon className="size-4" aria-hidden />
                  {group.label}
                </h3>
                {group.kind === "remove" ? (
                  <p data-testid="removal-safety-note" className="text-xs text-foreground-muted">{t("review.removedNote")}</p>
                ) : null}
                <ul className="space-y-2">
                  {rows.map((change) => (
                    <li
                      key={change.id}
                      data-testid={`scope-change-${change.kind}`}
                      className="flex items-start gap-3 rounded-lg border border-border p-3"
                    >
                      <Checkbox
                        className="mt-1"
                        checked={!!selected[change.id]}
                        aria-label={change.title}
                        onCheckedChange={(v) =>
                          setSelected((s) => ({ ...s, [change.id]: v === true }))
                        }
                      />
                      <div className="min-w-0 space-y-1">
                        <p className="text-base font-medium text-foreground">{change.title}</p>
                        <p className="text-sm text-foreground-muted">{change.sourceText}</p>
                        <div className="flex flex-wrap gap-2">
                          {change.quantity != null ? (
                            <Badge variant="secondary">
                              {change.quantity}
                              {change.unitKey ? ` ${change.unitKey}` : ""}
                            </Badge>
                          ) : null}
                          {change.needsPricing ? (
                            <Badge variant="outline" className="text-warning">
                              <AlertTriangle className="mr-1 size-3" aria-hidden />
                              {t("review.needsPricing")}
                            </Badge>
                          ) : null}
                          {change.kind === "remove" ? (
                            <Badge variant="outline">{t("review.removeHint")}</Badge>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" className="min-h-(--control-min-h)" onClick={onCancel}>
            {t("review.cancel")}
          </Button>
          <Button
            data-testid="apply-scope-changes"
            className="min-h-(--control-min-h)"
            disabled={pending || chosen.length === 0}
            onClick={() => onApply(chosen)}
          >
            {t("review.apply", { count: chosen.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
