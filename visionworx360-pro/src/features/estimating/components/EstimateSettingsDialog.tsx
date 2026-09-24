import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, useLocale } from "@/i18n/format";
import {
  isValidTargetGrossMargin,
  pricingStrategyOf,
  sellingPriceFromTargetMargin,
  type PricingStrategy,
} from "@/domains/estimating/pricingStrategy";
import {
  companyDefaultStrategy,
  resolvePricingProvenance,
} from "@/domains/estimating/pricingProvenance";
import type { EstimateDTO } from "../types";
import { PricingStrategyFields } from "./PricingStrategyFields";
import { PricingConfirmationNotice } from "./PricingConfirmationNotice";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** Selling price preview for a candidate strategy. Never mutates anything. */
function previewSellingPrice(
  strategy: PricingStrategy,
  directCost: number,
  contingency: number,
): number {
  if (strategy.method === "target_gross_margin") {
    return sellingPriceFromTargetMargin(
      round2(directCost + contingency),
      strategy.targetGrossMarginPct,
    );
  }
  const overhead = round2((directCost * strategy.overheadPct) / 100);
  const profit = round2(((directCost + overhead) * strategy.profitPct) / 100);
  return round2(directCost + overhead + profit + contingency);
}

export function EstimateSettingsDialog({
  open, onOpenChange, estimate, onSave, saving, directCost = 0, contingency = 0,
  currentSellingPrice = 0, companyStrategy = null,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  estimate: EstimateDTO;
  /** Engine totals for the deliberate repricing preview (internal only). */
  directCost?: number;
  contingency?: number;
  currentSellingPrice?: number;
  /**
   * Company pricing defaults. Shown for comparison only: they are never
   * applied to a saved estimate unless the contractor asks for it.
   */
  companyStrategy?: PricingStrategy | null;
  onSave: (values: {
    title: string;
    notes: string | null;
    taxRate: number;
    defaultOverheadPct: number;
    defaultProfitPct: number;
    defaultContingencyPct: number;
    defaultLaborRate: number;
    pricingMethod: PricingStrategy["method"];
    targetGrossMarginPct: number;
  }) => void;
  saving: boolean;
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();
  const money = (v: number) => formatCurrency(v, locale, estimate.currency);

  const [form, setForm] = useState({
    title: estimate.title,
    notes: estimate.notes ?? "",
    taxRate: String(estimate.taxRate),
    defaultContingencyPct: String(estimate.defaultContingencyPct),
    defaultLaborRate: String(estimate.defaultLaborRate),
  });
  const [strategy, setStrategy] = useState<PricingStrategy>(() => pricingStrategyOf(estimate));

  useEffect(() => {
    if (!open) return;
    setForm({
      title: estimate.title,
      notes: estimate.notes ?? "",
      taxRate: String(estimate.taxRate),
      defaultContingencyPct: String(estimate.defaultContingencyPct),
      defaultLaborRate: String(estimate.defaultLaborRate),
    });
    setStrategy(pricingStrategyOf(estimate));
  }, [open, estimate]);

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const saved = useMemo(() => pricingStrategyOf(estimate), [estimate]);
  const provenance = useMemo(
    () => resolvePricingProvenance(saved, companyStrategy ?? saved),
    [saved, companyStrategy],
  );
  const changed =
    saved.method !== strategy.method ||
    saved.targetGrossMarginPct !== strategy.targetGrossMarginPct ||
    saved.overheadPct !== strategy.overheadPct ||
    saved.profitPct !== strategy.profitPct;

  const nextPrice = previewSellingPrice(strategy, directCost, contingency);
  const diff = round2(nextPrice - currentSellingPrice);

  const targetInvalid =
    strategy.method === "target_gross_margin" &&
    !isValidTargetGrossMargin(strategy.targetGrossMarginPct);

  const numeric: Array<[keyof typeof form, string]> = [
    ["taxRate", t("fields.taxRate")],
    ["defaultLaborRate", t("fields.laborRate")],
    ["defaultContingencyPct", t("fields.contingencyPct")],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("actions.settings")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label htmlFor="estimate-title">{t("fields.title")}</Label>
            <Input
              id="estimate-title"
              className="h-11"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          <section className="grid gap-2 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{t("pricingStrategy.title")}</p>
              <span
                data-testid="pricing-strategy-source"
                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground-muted"
              >
                {provenance.matchesCompanyDefault
                  ? t("pricingStrategy.sourceCompany")
                  : t("pricingStrategy.sourceOverride")}
              </span>
            </div>
            <p className="text-xs text-foreground-muted">
              {t("pricingStrategy.internalOnly")}
            </p>

            {companyStrategy && !provenance.matchesCompanyDefault ? (
              <div className="grid gap-2 rounded-md bg-surface p-2 text-xs">
                <p className="text-foreground-muted">
                  {provenance.methodDiffers
                    ? t("pricingStrategy.methodDiffersNote")
                    : t("pricingStrategy.percentagesDifferNote")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  data-testid="apply-company-pricing-defaults"
                  onClick={() => setStrategy(companyDefaultStrategy(companyStrategy))}
                >
                  {t("pricingStrategy.applyCompanyDefaults")}
                </Button>
              </div>
            ) : null}

            <PricingConfirmationNotice
              required={estimate.pricingConfirmationRequired}
              reason={estimate.pricingConfirmationReason}
              source={estimate.pricingSource}
            />

            <PricingStrategyFields
              value={strategy}
              onChange={setStrategy}
              idPrefix="estimate-pricing"
            />


            {changed && !targetInvalid ? (
              <div
                data-testid="pricing-strategy-preview"
                className="mt-1 grid gap-1 rounded-md bg-surface p-2 text-xs"
              >
                <p className="font-medium">{t("pricingStrategy.preview")}</p>
                <div className="flex justify-between gap-3">
                  <span className="text-foreground-muted">
                    {t("pricingStrategy.previewCurrent")}
                  </span>
                  <span className="tabular-nums">{money(currentSellingPrice)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-foreground-muted">
                    {t("pricingStrategy.previewNext")}
                  </span>
                  <span className="tabular-nums">{money(nextPrice)}</span>
                </div>
                <div className="flex justify-between gap-3 font-medium">
                  <span>{t("pricingStrategy.previewDifference")}</span>
                  <span className="tabular-nums">{money(diff)}</span>
                </div>
                <p className="text-foreground-muted">{t("pricingStrategy.previewHint")}</p>
              </div>
            ) : null}
          </section>

          <p className="text-xs font-medium text-foreground-muted">{t("fields.defaults")}</p>
          <div className="grid grid-cols-2 gap-3">
            {numeric.map(([key, label]) => (
              <div key={key}>
                <Label htmlFor={`estimate-${key}`} className="text-xs">{label}</Label>
                <Input
                  id={`estimate-${key}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  className="h-11 tabular-nums"
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div>
            <Label htmlFor="estimate-notes">{t("fields.notes")}</Label>
            <Textarea
              id="estimate-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={saving || targetInvalid || !form.title.trim()}
            onClick={() =>
              onSave({
                title: form.title.trim(),
                notes: form.notes.trim() || null,
                taxRate: num(form.taxRate),
                /* Only the selected method's inputs are ever persisted as active. */
                defaultOverheadPct: strategy.overheadPct,
                defaultProfitPct: strategy.profitPct,
                defaultContingencyPct: num(form.defaultContingencyPct),
                defaultLaborRate: num(form.defaultLaborRate),
                pricingMethod: strategy.method,
                targetGrossMarginPct: strategy.targetGrossMarginPct,
              })
            }
          >
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
