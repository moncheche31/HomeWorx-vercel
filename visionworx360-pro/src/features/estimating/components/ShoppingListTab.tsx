/**
 * MATERIALS / SHOPPING LIST — a separate document, not estimate detail.
 *
 * An estimate (ballpark or detailed) is priced ONE LINE PER SCOPE ITEM. This
 * screen answers a different question: "what do I buy for this job?" It reads
 * the same assembly component data that already rolls into the estimate lines,
 * and presents it as a purchase list — item, quantity, unit — with no pricing
 * framing and no suggestion that it makes the estimate more accurate.
 *
 * Generated on demand: nothing is computed or shown until the contractor asks
 * for it, per job or per trade.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ClipboardList, Copy, Download, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";

import { useEstimateLinesQuery, useEstimatesQuery } from "../hooks/useEstimating";
import type { EstimateLineDTO } from "../types";

const ALL_TRADES = "__all__";

export interface ShoppingListItem {
  key: string;
  /** What to buy. */
  name: string;
  quantity: number;
  unitKey: string | null;
  tradeKey: string;
  /** Scope lines this material is being bought for. */
  forScope: string[];
  /** True when any contributing quantity rests on an unconfirmed size. */
  isEstimatedQuantity: boolean;
}

/**
 * Roll the estimate's assembly components into a purchase list: same material
 * bought for two scope lines is ONE row with the quantities added, so the
 * contractor buys it once.
 */
export function buildShoppingList(lines: EstimateLineDTO[]): ShoppingListItem[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const items = new Map<string, ShoppingListItem>();

  for (const line of lines) {
    if (!line.parentLineId) continue; // components only — never a scope line
    const parent = byId.get(line.parentLineId) ?? null;
    const quantity = Number(line.quantity ?? 0);
    if (!(quantity > 0)) continue; // nothing to buy

    const name = line.description.trim();
    const key = `${name.toLowerCase()}|${line.unitKey ?? ""}`;
    const existing = items.get(key);
    const scope = parent?.description?.trim();

    if (existing) {
      existing.quantity += quantity;
      if (scope && !existing.forScope.includes(scope)) existing.forScope.push(scope);
      existing.isEstimatedQuantity ||= line.isQuantityPlaceholder === true;
      continue;
    }

    items.set(key, {
      key,
      name,
      quantity,
      unitKey: line.unitKey ?? null,
      tradeKey: line.tradeKey || parent?.tradeKey || "other",
      forScope: scope ? [scope] : [],
      isEstimatedQuantity: line.isQuantityPlaceholder === true,
    });
  }

  return [...items.values()].sort(
    (a, b) => a.tradeKey.localeCompare(b.tradeKey) || a.name.localeCompare(b.name),
  );
}

/** Round up: you cannot buy 3.4 sheets of plywood. */
const purchaseQty = (n: number) => (Number.isInteger(n) ? n : Math.ceil(n * 10) / 10);

export function ShoppingListTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation("estimating");
  const { t: tScope } = useTranslation("scope");
  const estimatesQ = useEstimatesQuery(projectId);
  const estimates = estimatesQ.data ?? [];
  const active = estimates[0] ?? null;
  const linesQ = useEstimateLinesQuery(active?.id);

  /* On demand only. A shopping list is something the contractor asks for when
     they are heading to the supply house — never a passive estimate panel. */
  const [generated, setGenerated] = useState(false);
  const [trade, setTrade] = useState<string>(ALL_TRADES);

  const all = useMemo(() => buildShoppingList(linesQ.data ?? []), [linesQ.data]);
  const trades = useMemo(() => [...new Set(all.map((i) => i.tradeKey))].sort(), [all]);
  const items = useMemo(
    () => (trade === ALL_TRADES ? all : all.filter((i) => i.tradeKey === trade)),
    [all, trade],
  );

  const unitLabel = (unitKey: string | null) =>
    unitKey ? tScope(`units.${unitKey}`, { defaultValue: unitKey }) : "";

  const asText = () =>
    items
      .map((i) => `${purchaseQty(i.quantity)} ${unitLabel(i.unitKey)} — ${i.name}`.trim())
      .join("\n");

  const copy = async () => {
    await navigator.clipboard.writeText(asText());
    toast.success(t("shoppingList.copied", { defaultValue: "Shopping list copied" }));
  };

  const downloadCsv = () => {
    const rows = [
      ["item", "quantity", "unit", "trade", "for"],
      ...items.map((i) => [
        i.name,
        String(purchaseQty(i.quantity)),
        unitLabel(i.unitKey),
        i.tradeKey,
        i.forScope.join("; "),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "shopping-list.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (estimatesQ.isLoading || (active && linesQ.isLoading)) return <LoadingSpinner />;

  if (!active) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title={t("shoppingList.noEstimateTitle", { defaultValue: "No estimate yet" })}
        description={t("shoppingList.noEstimateBody", {
          defaultValue:
            "A shopping list is built from this job's estimate. Create the estimate first.",
        })}
      />
    );
  }

  if (!generated) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <div>
            <h2 className="text-base font-semibold">
              {t("shoppingList.title", { defaultValue: "Materials / shopping list" })}
            </h2>
            <p className="mt-1 max-w-prose text-sm text-foreground-muted">
              {t("shoppingList.intro", {
                defaultValue:
                  "What to buy for this job — item, quantity, unit. This is a purchase document, separate from the estimate; the estimate stays one line per scope item.",
              })}
            </p>
          </div>
          <Button data-testid="generate-shopping-list" onClick={() => setGenerated(true)}>
            <ClipboardList className="mr-1 size-4" aria-hidden />
            {t("shoppingList.generate", { defaultValue: "Generate shopping list for this job" })}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="shopping-list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">
            {t("shoppingList.title", { defaultValue: "Materials / shopping list" })}
          </h2>
          <p className="text-sm text-foreground-muted">
            {t("shoppingList.subtitle", {
              defaultValue: "What to buy for this job. Not a pricing breakdown.",
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={trade} onValueChange={setTrade}>
            <SelectTrigger className="w-48" data-testid="shopping-list-trade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TRADES}>
                {t("shoppingList.allTrades", { defaultValue: "All trades" })}
              </SelectItem>
              {trades.map((key) => (
                <SelectItem key={key} value={key}>
                  {tScope(`trades.${key}`, { defaultValue: key })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={copy} disabled={items.length === 0}>
            <Copy className="mr-1 size-4" aria-hidden />
            {t("shoppingList.copy", { defaultValue: "Copy" })}
          </Button>
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={items.length === 0}>
            <Download className="mr-1 size-4" aria-hidden />
            {t("shoppingList.export", { defaultValue: "Export CSV" })}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={t("shoppingList.emptyTitle", { defaultValue: "Nothing to buy yet" })}
          description={t("shoppingList.emptyBody", {
            defaultValue:
              "This job's scope lines have no material components worked out yet. Review the assemblies on the estimate to build them out.",
          })}
        />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((i) => (
            <li
              key={i.key}
              data-testid="shopping-list-item"
              className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block font-medium">{i.name}</span>
                <span className="text-xs text-foreground-muted">
                  {tScope(`trades.${i.tradeKey}`, { defaultValue: i.tradeKey })}
                  {i.forScope.length > 0 ? ` · ${i.forScope.join(", ")}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {/* An assumed size must stay visible on the buying document too. */}
                {i.isEstimatedQuantity ? (
                  <Badge
                    variant="outline"
                    className="border-warning/40 font-normal text-warning"
                    data-testid="shopping-list-estimated"
                    title="Quantity comes from an unconfirmed size — verify before buying."
                  >
                    {t("shoppingList.estimatedQty", { defaultValue: "Estimated qty" })}
                  </Badge>
                ) : null}
                <span className="tabular-nums">
                  {purchaseQty(i.quantity)} {unitLabel(i.unitKey)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
