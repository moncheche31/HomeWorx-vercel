import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pencil, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEstimateMutations } from "../hooks/useEstimating";
import type { BallparkAssumptionView } from "../services/ballparkSummary";

interface Props {
  projectId: string;
  estimateId: string;
  assumption: BallparkAssumptionView;
  readOnly?: boolean;
}

/**
 * One disclosed ballpark assumption, and the refinement control for it.
 *
 * The ballpark never waits for an answer: it infers, prices, and then shows the
 * contractor exactly what it assumed. This row is the correction half of that
 * loop — a single field-friendly number the contractor can adjust when an
 * assumption is materially wrong, which re-prices the band immediately and is
 * never re-inferred afterwards. Corrections can also be reverted.
 */
export function BallparkAssumptionRow({ projectId, estimateId, assumption, readOnly }: Props) {
  const { t } = useTranslation("estimating");
  const { refineBallparkAssumption } = useEstimateMutations(projectId, estimateId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(assumption.quantity));

  const unit = t(`geometry.unit.${assumption.unitKey}`, { defaultValue: assumption.unitKey });
  const busy = refineBallparkAssumption.isPending;
  const canRefine = !readOnly && assumption.itemKey.length > 0;

  const save = () => {
    const quantity = Number(value.replace(",", "."));
    if (!Number.isFinite(quantity) || quantity < 0) return;
    refineBallparkAssumption.mutate(
      { estimateId, itemId: assumption.itemId, itemKey: assumption.itemKey, quantity },
      { onSuccess: () => setEditing(false) },
    );
  };

  const revert = () =>
    refineBallparkAssumption.mutate({
      estimateId,
      itemId: assumption.itemId,
      itemKey: assumption.itemKey,
      quantity: null,
    });

  return (
    <li data-testid="ballpark-assumption-row" className="rounded-md border border-border p-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-foreground">{assumption.title}</span> —{" "}
          {t("ballparkCard.assumptionQuantity", { quantity: assumption.quantity, unit })}
          <span className="ml-2 align-middle">
            <Badge variant={assumption.corrected ? "default" : "secondary"}>
              {assumption.corrected
                ? t("ballparkCard.sourceBadge.contractor")
                : assumption.source === "geometry"
                  ? t("ballparkCard.sourceBadge.geometry")
                  : t("ballparkCard.sourceBadge.assumed")}
            </Badge>
          </span>
          <span className="block text-xs text-foreground-muted">
            {t(`ballparkCard.basis.${assumption.basisKey}`, {
              ...assumption.basisValues,
              defaultValue: t("ballparkCard.basis.unknown"),
            })}
          </span>
          {assumption.corrected && assumption.inferredQuantity != null ? (
            <span className="block text-xs text-foreground-muted">
              {t("ballparkCard.wasAssumed", { quantity: assumption.inferredQuantity, unit })}
            </span>
          ) : null}
          {assumption.provisional ? (
            <span className="block text-xs text-warning-foreground">
              {t("ballparkCard.provisionalNote")}
            </span>
          ) : null}
          {assumption.rolledUp.length > 0 ? (
            <span className="block text-xs text-foreground-muted">
              {t("ballparkCard.rolledUp", {
                titles: assumption.rolledUp.map((r) => r.title).join(", "),
              })}
            </span>
          ) : null}
        </div>

        {canRefine && !editing ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-11"
              disabled={busy}
              onClick={() => {
                setValue(String(assumption.quantity));
                setEditing(true);
              }}
            >
              <Pencil className="mr-1 size-4" aria-hidden />
              {t("ballparkCard.refine")}
            </Button>
            {assumption.corrected ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-11"
                disabled={busy}
                onClick={revert}
                aria-label={t("ballparkCard.revert")}
              >
                <RotateCcw className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`refine-${assumption.itemId}-${assumption.itemKey}`}>
            {t("ballparkCard.refineLabel", { title: assumption.title })}
          </label>
          <Input
            id={`refine-${assumption.itemId}-${assumption.itemKey}`}
            inputMode="decimal"
            className="h-11 w-32"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <span className="text-xs text-foreground-muted">{unit}</span>
          <Button size="sm" className="h-11" disabled={busy} onClick={save}>
            <Check className="mr-1 size-4" aria-hidden />
            {t("ballparkCard.refineSave")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-11"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            {t("ballparkCard.refineCancel")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
