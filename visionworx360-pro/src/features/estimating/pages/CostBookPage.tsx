/**
 * Company Settings → Cost Book.
 *
 * Search the catalog by trade/category, see the VisionWorx baseline for a task,
 * and set the company's own baseline. Overrides apply to FUTURE estimates and to
 * editable estimates that the contractor explicitly reprices — never silently.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { LABOR_TRADES } from "@/domains/estimating/tradeTaxonomy";
import type { CostBookField, CostBookValues } from "@/domains/costBook";
import {
  useCostBookSearch,
  useResetCompanyOverride,
  useSaveCompanyOverride,
} from "../hooks/useCostBook";

const FIELDS: readonly CostBookField[] = [
  "hoursPerUnit",
  "setupHours",
  "minTaskHours",
  "materialUnitCost",
  "equipmentCost",
  "otherCost",
  "directUnitCost",
] as const;

export function CostBookPage() {
  const { t } = useTranslation("estimating");
  const [search, setSearch] = useState("");
  const [tradeKey, setTradeKey] = useState<string>("");
  const [customizedOnly, setCustomizedOnly] = useState(false);

  const { data: rows = [], isLoading } = useCostBookSearch({
    search: search.trim() || undefined,
    tradeKey: tradeKey || undefined,
    customizedOnly,
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">{t("costBook.pageTitle")}</h1>
          <p className="text-sm text-foreground-muted">{t("costBook.pageSubtitle")}</p>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("costBook.filters")}</CardTitle>
            <CardDescription>{t("costBook.filtersHelp")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
                aria-hidden
              />
              <Input
                aria-label={t("costBook.searchLabel")}
                className="h-11 pl-9"
                placeholder={t("costBook.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={tradeKey === "" ? "default" : "outline"}
                size="sm"
                className="min-h-(--control-min-h)"
                onClick={() => setTradeKey("")}
              >
                {t("costBook.allTrades")}
              </Button>
              {LABOR_TRADES.map((trade) => (
                <Button
                  key={trade}
                  variant={tradeKey === trade ? "default" : "outline"}
                  size="sm"
                  className="min-h-(--control-min-h)"
                  onClick={() => setTradeKey(trade)}
                >
                  {t(`trades.${trade}`, { ns: "scope", defaultValue: trade })}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="cost-book-customized"
                checked={customizedOnly}
                onCheckedChange={setCustomizedOnly}
              />
              <Label htmlFor="cost-book-customized" className="text-sm">
                {t("costBook.customizedOnly")}
              </Label>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-sm text-foreground-muted">{t("costBook.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-foreground-muted">{t("costBook.noTasks")}</p>
        ) : (
          <ul className="space-y-2" data-testid="cost-book-list">
            {rows.map((row) => (
              <li key={row.assemblyKey}>
                <CostBookRow row={row} />
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

type Row = NonNullable<ReturnType<typeof useCostBookSearch>["data"]>[number];

function CostBookRow({ row }: { row: Row }) {
  const { t } = useTranslation("estimating");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = useSaveCompanyOverride();
  const reset = useResetCompanyOverride();

  const values = (): CostBookValues => {
    const out: Record<string, number | null> = {};
    for (const field of FIELDS) {
      const raw = draft[field];
      if (raw === undefined) continue;
      const trimmed = raw.trim();
      if (trimmed === "") {
        out[field] = null;
        continue;
      }
      const n = Number(trimmed);
      if (Number.isFinite(n) && n >= 0) out[field] = n;
    }
    return out as CostBookValues;
  };

  const show = (v: number | null | undefined) =>
    v === null || v === undefined ? "—" : String(v);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-border bg-card"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-(--control-min-h) w-full items-start justify-between gap-3 p-3 text-left"
          data-testid={`cost-book-task-${row.assemblyKey}`}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {row.workItem ?? row.assemblyKey}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
              {row.tradeKey ? (
                <Badge variant="outline" className="font-normal">
                  {t(`trades.${row.tradeKey}`, { ns: "scope", defaultValue: row.tradeKey })}
                </Badge>
              ) : null}
              {row.unitKey ? <span>{row.unitKey}</span> : null}
              {row.isCustomized ? (
                <Badge variant="outline" className="border-primary/40 font-normal text-primary">
                  {t("costBook.customized")}
                </Badge>
              ) : null}
            </span>
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-border p-3">
        {/* Baseline stays visible next to the company value at all times. */}
        <table className="w-full text-xs">
          <thead className="text-foreground-muted">
            <tr className="text-left">
              <th className="py-1 pr-2 font-medium">{t("costBook.field.label")}</th>
              <th className="py-1 pr-2 font-medium">{t("costBook.source.catalog_baseline")}</th>
              <th className="py-1 pr-2 font-medium">{t("costBook.source.company_override")}</th>
              <th className="py-1 font-medium">{t("costBook.newValue")}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {FIELDS.map((field) => (
              <tr key={field} className="border-t border-border">
                <td className="py-1 pr-2">{t(`costBook.field.${field}`)}</td>
                <td className="py-1 pr-2">{show(row.baseline[field])}</td>
                <td className="py-1 pr-2">{show(row.company?.[field] ?? null)}</td>
                <td className="py-1">
                  <Input
                    aria-label={`${row.assemblyKey} ${field}`}
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-11 w-24 tabular-nums"
                    value={draft[field] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            className="min-h-(--control-min-h)"
            disabled={Object.keys(draft).length === 0 || save.isPending}
            onClick={() =>
              save.mutate(
                { assemblyKey: row.assemblyKey, values: values() },
                { onSuccess: () => setDraft({}) },
              )
            }
            data-testid={`cost-book-save-${row.assemblyKey}`}
          >
            {t("costBook.saveCompanyDefault")}
          </Button>
          {row.isCustomized ? (
            <Button
              variant="ghost"
              className="min-h-(--control-min-h)"
              disabled={reset.isPending}
              onClick={() => reset.mutate(row.assemblyKey)}
              data-testid={`cost-book-reset-${row.assemblyKey}`}
            >
              <RotateCcw className="mr-1 size-4" aria-hidden />
              {t("costBook.resetToBaseline")}
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-foreground-muted">{t("costBook.futureOnly")}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
