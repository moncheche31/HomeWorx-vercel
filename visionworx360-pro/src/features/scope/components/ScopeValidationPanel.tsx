import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EstimatingMode } from "@/domains/estimating/modes";
import { LABOR_TRADES } from "@/domains/estimating/tradeTaxonomy";
import type { ScopeFinding } from "@/domains/scopeValidation";
import { useScopeMutations } from "../hooks/useScope";
import type { ScopeItemDTO } from "../types";

interface Props {
  projectId: string;
  items: readonly ScopeItemDTO[];
  /** Findings the CURRENT mode reviews. */
  findings: readonly ScopeFinding[];
  /**
   * Findings postponed to the detailed estimate (trade assignment, labor
   * treatment). Shown as optional, collapsed, non-blocking information so a
   * preliminary ballpark is never gated on production detail.
   */
  deferredFindings?: readonly ScopeFinding[];
  /** Which estimating level the contractor is working at. */
  mode?: EstimatingMode;
  /** Subjects the contractor has already answered (durable, from the server). */
  decidedSubjectKeys: readonly string[];
  isSaving?: boolean;
  onDecide: (
    finding: ScopeFinding,
    decision: "kept" | "reassigned" | "dismissed",
    decidedTradeKey?: string | null,
  ) => Promise<void> | void;
  onDecideAll: () => Promise<void> | void;
}

const ICON = {
  blocker: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
} as const;

/**
 * "Review these items before approval." A guardrail, not an interview: nothing
 * is rewritten silently. The contractor keeps, reclassifies or removes each
 * flagged item, and blockers must get a decision before the scope is approved.
 */
export function ScopeValidationPanel({
  projectId, items, findings, deferredFindings = [], mode = "detailed",
  decidedSubjectKeys, isSaving, onDecide, onDecideAll,
}: Props) {
  const { t } = useTranslation("scope");
  const m = useScopeMutations(projectId);
  const byId = new Map(items.map((i) => [i.id, i]));
  const isDecided = (f: ScopeFinding) => decidedSubjectKeys.includes(f.subjectKey);
  const open = findings.filter((f) => !isDecided(f));
  const [pickerFindingId, setPickerFindingId] = useState<string | null>(null);
  const [showDeferred, setShowDeferred] = useState(false);
  /* One in-flight decision at a time: a double tap must not fire two writes. */
  const [pendingSubject, setPendingSubject] = useState<string | null>(null);
  const busy = pendingSubject !== null || !!isSaving;

  /** Every contractor answer funnels through here so it is always recorded. */
  const runDecision = async (
    finding: ScopeFinding,
    work: () => Promise<void>,
  ) => {
    if (busy) return;
    setPendingSubject(finding.subjectKey);
    try {
      await work();
    } finally {
      setPendingSubject(null);
    }
  };

  if (findings.length === 0 && deferredFindings.length === 0) return null;

  const itemPayload = (item: ScopeItemDTO) => ({
    id: item.id,
    projectId,
    sectionId: item.sectionId,
    roomId: item.roomId,
    title: item.title,
    scopeItemKey: item.scopeItemKey ?? undefined,
    tradeKey: item.tradeKey ?? undefined,
    categoryKey: item.categoryKey ?? undefined,
    subcategoryKey: item.subcategoryKey ?? undefined,
    actionKey: item.actionKey,
    description: item.description ?? undefined,
    quantity: item.quantity,
    unitKey: item.unitKey,
    materialSelection: item.materialSelection ?? undefined,
    finishSelection: item.finishSelection ?? undefined,
    laborNotes: item.laborNotes ?? undefined,
    customerNotes: item.customerNotes ?? undefined,
    internalNotes: item.internalNotes ?? undefined,
    assumptions: item.assumptions ?? undefined,
    exclusions: item.exclusions ?? undefined,
    isIncluded: item.isIncluded,
    isCustomerSelection: item.isCustomerSelection,
    isClientVisible: item.isClientVisible,
    priority: item.priority,
    confidenceStatus: item.confidenceStatus,
    completionStatus: item.completionStatus,
  });

  /** Localized trade name for a key, falling back to the explicit "Unassigned" label. */
  const tradeLabel = (tradeKey: string | null | undefined) =>
    t(`validation.trades.${tradeKey || "unassigned"}`, {
      defaultValue: tradeKey || t("validation.trades.unassigned"),
    });

  /** The item's CURRENT assignment — never the suggestion. */
  const currentTradeKey = (finding: ScopeFinding) =>
    byId.get(finding.itemIds[0] ?? "")?.tradeKey ?? null;

  const isTradeFinding = (finding: ScopeFinding) =>
    finding.kind === "suspicious_trade" || Boolean(finding.suggestedTradeKey);

  /**
   * The single authoritative assignment path. The AI suggestion and the
   * contractor's own pick both go through here — contractor authority wins.
   */
  const applyTrade = async (finding: ScopeFinding, tradeKey?: string | null) => {
    const item = byId.get(finding.itemIds[0]);
    const nextTrade = tradeKey ?? finding.suggestedTradeKey;
    if (!item || !nextTrade) return;
    await runDecision(finding, async () => {
      try {
        await m.updateItem.mutateAsync({
          ...itemPayload(item),
          tradeKey: nextTrade,
        });
        /*
         * Record the contractor's pick, not the suggestion. A manual choice
         * that disagrees with the suggestion still closes the question.
         */
        await onDecide(finding, "reassigned", nextTrade);
        setPickerFindingId(null);
        toast.success(t("validation.toast.tradeFixed"));
      } catch (e) {
        toast.error((e as Error).message || t("errors.generic"));
      }
    });
  };

  const removeItems = async (finding: ScopeFinding, ids: string[]) => {
    if (ids.length === 0) return;
    await runDecision(finding, async () => {
      try {
        await m.bulkInclusion.mutateAsync({ projectId, itemIds: ids, isIncluded: false });
        await onDecide(finding, "dismissed");
        toast.success(t("validation.toast.removed", { count: ids.length }));
      } catch (e) {
        toast.error((e as Error).message || t("errors.generic"));
      }
    });
  };

  return (
    <Card data-testid="scope-validation-panel" className="border-warning">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{t("validation.title")}</h3>
          <Badge variant="outline">{t("validation.count", { count: open.length })}</Badge>
          <div className="flex-1" />
          {open.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              data-testid="scope-validation-keep-all"
              disabled={busy}
              onClick={() => void onDecideAll()}
            >
              {t("validation.actions.keepAll")}
            </Button>
          )}
        </div>
        <p className="text-sm text-foreground-muted">
          {mode === "ballpark" ? t("validation.subtitleBallpark") : t("validation.subtitle")}
        </p>


        <ul className="space-y-2">
          {findings.map((f) => {
            const Icon = ICON[f.severity];
            const done = isDecided(f);
            const names = f.itemIds
              .map((id) => byId.get(id)?.title)
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={f.id}
                data-testid={`scope-finding-${f.kind}`}
                className="rounded-md border border-border p-3"
              >
                <div className="flex items-start gap-2">
                  {done ? (
                    <CheckCircle2 className="mt-0.5 size-4 text-success" aria-hidden />
                  ) : (
                    <Icon
                      className={
                        f.severity === "blocker"
                          ? "mt-0.5 size-4 text-destructive"
                          : "mt-0.5 size-4 text-warning"
                      }
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium">
                      {t(`validation.rules.${f.kind}`, f.params ?? {})}
                    </p>
                    {names ? (
                      <p className="truncate text-sm text-foreground-muted">{names}</p>
                    ) : null}
                    {!done && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          data-testid={`scope-finding-keep-${f.id}`}
                          className="h-auto min-h-11 whitespace-normal border border-border py-2 text-left font-medium shadow-sm transition-colors hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
                          disabled={busy}
                          onClick={() =>
                            void runDecision(f, async () => {
                              try {
                                await onDecide(f, "kept");
                              } catch (e) {
                                toast.error((e as Error).message || t("errors.generic"));
                              }
                            })
                          }
                        >
                          {isTradeFinding(f)
                            ? t("validation.actions.keepTrade", {
                                trade: tradeLabel(currentTradeKey(f)),
                              })
                            : t("validation.actions.keep")}
                        </Button>
                        {f.suggestedTradeKey ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-auto min-h-11 whitespace-normal py-2 text-left"
                            data-testid={`scope-finding-fix-${f.id}`}
                            disabled={busy}
                            onClick={() => void applyTrade(f)}
                          >
                            {t("validation.actions.fixTrade", {
                              trade: tradeLabel(f.suggestedTradeKey),
                            })}
                          </Button>
                        ) : null}
                        {isTradeFinding(f) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`scope-finding-other-trade-${f.id}`}
                            disabled={busy}
                            className="h-auto min-h-11 whitespace-normal py-2 text-left"
                            onClick={() => setPickerFindingId(f.id)}
                          >
                            {t("validation.actions.chooseTrade")}
                          </Button>
                        ) : null}
                        {f.kind === "duplicate" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void removeItems(f, f.itemIds.slice(1))}
                          >
                            {t("validation.actions.removeDuplicate")}
                          </Button>
                        ) : null}
                        {f.kind === "unrelated_scope" || f.kind === "foreign_context" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void removeItems(f, [...f.itemIds])}
                          >
                            {t("validation.actions.remove")}
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {f.severity === "blocker" && !done ? (
                    <Badge variant="destructive">{t("validation.severity.blocker")}</Badge>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        {deferredFindings.length > 0 ? (
          <div
            data-testid="scope-deferred-findings"
            className="rounded-md border border-border bg-surface-muted p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Info className="size-4 text-foreground-muted" aria-hidden />
              <span className="text-sm font-medium">
                {t("validation.deferred.title", { count: deferredFindings.length })}
              </span>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11"
                aria-expanded={showDeferred}
                data-testid="scope-deferred-toggle"
                onClick={() => setShowDeferred((v) => !v)}
              >
                {showDeferred ? t("validation.deferred.hide") : t("validation.deferred.show")}
              </Button>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">
              {t("validation.deferred.body")}
            </p>
            {showDeferred ? (
              <ul className="mt-2 space-y-1">
                {deferredFindings.map((f) => (
                  <li key={f.id} className="text-sm text-foreground-muted">
                    {t(`validation.rules.${f.kind}`, { ...(f.params ?? {}) })}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
      <Dialog
        open={pickerFindingId !== null}
        onOpenChange={(next) => !next && setPickerFindingId(null)}
      >
        <DialogContent data-testid="scope-trade-picker" className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("validation.actions.chooseTradeTitle")}</DialogTitle>
            <DialogDescription>{t("validation.actions.chooseTradeHint")}</DialogDescription>
          </DialogHeader>
          {(() => {
            const finding = findings.find((f) => f.id === pickerFindingId);
            if (!finding) return null;
            const current = currentTradeKey(finding);
            return (
              <div role="radiogroup" aria-label={t("validation.actions.chooseTradeTitle")} className="grid gap-2">
                {LABOR_TRADES.map((trade) => {
                  const selected = current === trade;
                  return (
                    <Button
                      key={trade}
                      role="radio"
                      aria-checked={selected}
                      variant={selected ? "secondary" : "outline"}
                      data-testid={`scope-trade-option-${trade}`}
                      className="h-auto min-h-11 w-full justify-between whitespace-normal py-2 text-left"
                      disabled={busy}
                      onClick={() => void applyTrade(finding, trade)}
                    >
                      <span>{tradeLabel(trade)}</span>
                      {trade === finding.suggestedTradeKey ? (
                        <Badge variant="outline">{t("validation.actions.suggested")}</Badge>
                      ) : selected ? (
                        <Badge variant="outline">{t("validation.actions.currentTrade")}</Badge>
                      ) : null}
                    </Button>
                  );
                })}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
