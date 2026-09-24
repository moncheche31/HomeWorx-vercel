import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatNumber, useLocale } from "@/i18n/format";
import {
  buildMaterialsBreakdown,
  type MaterialLineComponent,
} from "@/domains/estimating/materials";
import type { EngineLineResult, EstimateEngineTotals } from "@/domains/estimating";
import type { EstimateLineDTO } from "../types";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/**
 * INTERNAL materials visibility for the contractor — GENERAL, not per-trade.
 *
 * Every line in the current estimate is decomposed by the shared material
 * layer (`domains/estimating/materials`), which reads only that line's
 * assembly, trade, quantity and priced material money. Major materials are
 * separated from consumables, labor-only work says so explicitly, and lines
 * with no reliable material price are flagged for contractor entry instead of
 * being silently shown as $0.
 *
 * Contractor-only: never rendered in a proposal, print view or client portal.
 */
export function MaterialsPanel({
  lines,
  engineLines,
  totals,
  currency,
  pricingMode,
  readOnly,
  onSetLineMaterialCost,
}: {
  lines: readonly EstimateLineDTO[];
  engineLines: readonly EngineLineResult[];
  totals: EstimateEngineTotals;
  currency: string;
  pricingMode?: "total" | "labor_materials" | "labor_only";
  readOnly?: boolean;
  onSetLineMaterialCost?: (lineId: string, materialCost: number) => Promise<void> | void;
}) {
  const { t } = useTranslation("estimating");
  const { t: tScope } = useTranslation("scope");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const money = (v: number) => formatCurrency(v, locale, currency);
  const componentLabel = (key: string) =>
    t(`materials.components.${key}`, { defaultValue: key });

  const breakdown = useMemo(() => {
    const byId = new Map(engineLines.map((r) => [r.id, r]));
    return buildMaterialsBreakdown(
      lines.map((line) => {
        const r = byId.get(line.id);
        return {
          id: line.id,
          description: line.description,
          tradeKey: line.tradeKey,
          catalogItemKey: line.catalogItemKey,
          quantity: r?.quantity ?? line.quantity,
          unitKey: line.unitKey,
          materialCost: line.materialCost,
          materialTotal: r?.materialTotal ?? null,
          isPriceOverridden: line.isPriceOverridden,
          pricingSource: line.pricingSource,
        };
      }),
      { pricingMode },
    );
  }, [lines, engineLines, pricingMode]);

  const incidentalSubtotal = round2(
    totals.equipmentTotal + totals.subcontractorTotal + totals.otherTotal + totals.allowanceTotal,
  );
  const materialSubtotal = round2(totals.materialTotal + totals.productTotal);

  if (breakdown.lines.length === 0) return null;

  const renderComponent = (component: MaterialLineComponent, keyPrefix: string) => (
    <li key={`${keyPrefix}-${component.key}`} className="flex justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate">{componentLabel(component.key)}</span>
        <span className="block text-xs text-foreground-muted">
          {component.quantity != null
            ? t("materials.qtyUnitCost", {
                quantity: formatNumber(component.quantity, locale),
                unit: component.unitKey ? t(`materials.units.${component.unitKey}`, {
                  defaultValue: component.unitKey,
                }) : "",
                amount: component.unitCost != null ? money(component.unitCost) : "—",
              }).trim()
            : t(`materials.source.${component.source}`, {
                defaultValue: t("materials.source.allowance"),
              })}
        </span>
      </span>
      <span className="shrink-0 tabular-nums">{money(component.extendedCost)}</span>
    </li>
  );

  return (
    <section
      data-testid="materials-panel"
      data-audience="internal"
      className="proposal-no-print rounded-lg border border-border bg-card p-3"
      aria-label={t("materials.title")}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-(--control-min-h-sm) w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Package className="size-4 text-foreground-muted" aria-hidden />
          {t("materials.title")}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">{money(materialSubtotal)}</span>
          <ChevronDown
            className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </span>
      </button>
      <p className="mt-1 text-xs text-foreground-muted">{t("materials.internalOnly")}</p>

      {open ? (
        <div className="mt-3 space-y-4">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">{t("totals.labor")}</dt>
              <dd className="tabular-nums">{money(totals.laborTotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">{t("materials.major")}</dt>
              <dd className="tabular-nums">{money(breakdown.majorTotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">{t("materials.consumables")}</dt>
              <dd className="tabular-nums">{money(breakdown.consumableTotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">{t("materials.incidentals")}</dt>
              <dd className="tabular-nums">{money(incidentalSubtotal)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-1 font-medium">
              <dt>{t("totals.directCost")}</dt>
              <dd className="tabular-nums">{money(totals.directCost)}</dd>
            </div>
          </dl>

          {breakdown.majorComponents.length > 0 ? (
            <div className="space-y-2" data-testid="materials-major">
              <p className="text-xs uppercase tracking-wide text-foreground-muted">
                {t("materials.major")}
              </p>
              <ul className="space-y-2 text-sm">
                {breakdown.majorComponents.map((c) => renderComponent(c, "major"))}
              </ul>
            </div>
          ) : null}

          {breakdown.consumableComponents.length > 0 ? (
            <div className="space-y-2" data-testid="materials-consumables">
              <p className="text-xs uppercase tracking-wide text-foreground-muted">
                {t("materials.consumables")}
              </p>
              <ul className="space-y-2 text-sm">
                {breakdown.consumableComponents.map((c) => renderComponent(c, "consumable"))}
              </ul>
              <p className="text-xs text-foreground-muted">{t("materials.consumablesNotice")}</p>
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-foreground-muted">
              {t("materials.byLine")}
            </p>
            <ul className="space-y-3 text-sm">
              {breakdown.lines.map((row) => (
                <li key={row.lineId} className="space-y-1">
                  <div className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{row.description}</span>
                    <span className="shrink-0 tabular-nums">
                      {row.status === "pricing_needed"
                        ? t("materials.pricingNeeded")
                        : money(row.materialTotal)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground-muted">
                    {t("materials.qtyLine", {
                      quantity: formatNumber(row.quantity, locale),
                      unit: row.unitKey ? tScope(`units.${row.unitKey}`) : "",
                    }).trim()}
                    {row.materialTotal > 0
                      ? ` · ${t("materials.perUnit", { amount: money(row.perUnitCost) })}`
                      : ""}
                  </p>

                  {row.status === "no_material" && row.reason ? (
                    <p className="text-xs text-foreground-muted">
                      {t(`materials.reason.${row.reason}`)}
                    </p>
                  ) : null}

                  {row.status === "pricing_needed" ? (
                    <div className="space-y-1">
                      <p className="text-xs text-warning-foreground">
                        {t("materials.pricingNeededNotice")}
                      </p>
                      {!readOnly && onSetLineMaterialCost ? (
                        <div className="flex items-center gap-2">
                          <Input
                            inputMode="decimal"
                            aria-label={t("materials.enterUnitPrice")}
                            placeholder={t("materials.enterUnitPrice")}
                            value={drafts[row.lineId] ?? ""}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [row.lineId]: e.target.value }))
                            }
                            className="h-9 max-w-36"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              const value = Number(drafts[row.lineId]);
                              if (!Number.isFinite(value) || value < 0) return;
                              await onSetLineMaterialCost?.(row.lineId, value);
                              setDrafts((d) => ({ ...d, [row.lineId]: "" }));
                            }}
                          >
                            {t("materials.savePrice")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {row.status === "override" ? (
                    <p className="text-xs text-foreground-muted">
                      {t("materials.contractorPriced")}
                    </p>
                  ) : (
                    <ul className="space-y-1 border-l border-border pl-3 text-xs">
                      {row.components
                        .filter((c) => c.extendedCost > 0)
                        .map((c) => (
                          <li key={c.key} className="flex justify-between gap-3">
                            <span className="min-w-0 truncate">
                              {componentLabel(c.key)}
                              {c.tier === "consumable"
                                ? ` · ${t("materials.consumableTag")}`
                                : ""}
                            </span>
                            <span className="shrink-0 tabular-nums">{money(c.extendedCost)}</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-foreground-muted">{t("materials.allowanceNotice")}</p>
          {breakdown.pricingNeededCount > 0 ? (
            <p className="text-xs text-warning-foreground">
              {t("materials.unpricedNotice", { count: breakdown.pricingNeededCount })}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
