import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Calculator } from "lucide-react";

import { formatCurrency, formatNumber, useLocale } from "@/i18n/format";
import type { EstimateEngineTotals } from "@/domains/estimating";
import {
  DEFAULT_PRICING_STRATEGY,
  type PricingStrategy,
} from "@/domains/estimating/pricingStrategy";
import { strategiesEqual } from "@/domains/estimating/pricingProvenance";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/**
 * INTERNAL contractor financial summary.
 *
 * Reads the SAME engine totals the estimate is priced from, so the numbers can
 * never disagree with the line items. Overhead and profit are real engine
 * fields (overhead is a % of direct cost; profit is a % of direct cost +
 * overhead), so the effective percentages shown here are derived from the
 * money actually charged rather than a UI-only guess.
 *
 * Contractor-only: `proposal-no-print` keeps it out of every print/PDF path,
 * and no proposal, share snapshot or client portal renders this component.
 */
export function FinancialSummaryPanel({
  totals,
  currency,
  strategy = DEFAULT_PRICING_STRATEGY,
  companyStrategy = null,
  sourceLabel = null,
  costBasisUnavailable = false,
}: {
  totals: EstimateEngineTotals;
  currency: string;
  /** Pricing method actually in force for this estimate. */
  strategy?: PricingStrategy;
  /** Company defaults, shown only to label this estimate as default or override. */
  companyStrategy?: PricingStrategy | null;
  /**
   * Overrides the panel heading so a preliminary figure is never presented as
   * a final detailed estimate (e.g. "Selected ballpark selling price").
   */
  sourceLabel?: string | null;
  /**
   * True when the saved preliminary snapshot predates cost capture. The cost
   * breakdown is then withheld rather than reverse-derived from the price.
   */
  costBasisUnavailable?: boolean;
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();
  const [open, setOpen] = useState(true);
  const money = (v: number) => formatCurrency(v, locale, currency);
  const pctOf = (amount: number, base: number) =>
    base > 0 ? round2((amount / base) * 100) : 0;

  const overheadBase = round2(totals.directCost);
  const profitBase = round2(totals.directCost + totals.overhead);
  const contingencyBase = round2(totals.directCost + totals.overhead + totals.profit);

  const overheadPct = pctOf(totals.overhead, overheadBase);
  const profitPct = pctOf(totals.profit, profitBase);
  const contingencyPct = pctOf(totals.contingency, contingencyBase);
  const markup = round2(totals.overhead + totals.profit + totals.contingency);
  const isTargetMargin = strategy.method === "target_gross_margin";
  const jobCost = round2(totals.jobCost || totals.directCost + totals.contingency);
  const grossProfit = round2(
    totals.grossProfit || Math.max(0, totals.subtotal - jobCost),
  );
  const realizedMarginPct = round2(
    totals.grossMarginPct || pctOf(grossProfit, round2(totals.subtotal)),
  );

  const costRows: Array<[string, number]> = [
    [t("totals.labor"), totals.laborTotal],
    [t("totals.material"), round2(totals.materialTotal + totals.productTotal)],
    [
      t("financial.otherIncidentals"),
      round2(
        totals.equipmentTotal +
          totals.subcontractorTotal +
          totals.otherTotal +
          totals.allowanceTotal,
      ),
    ],
  ];

  const num = (v: number) => formatNumber(v, locale);

  return (
    <section
      data-testid="financial-summary-panel"
      className="proposal-no-print rounded-lg border border-border bg-card p-3"
      aria-label={t("financial.title")}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-(--control-min-h-sm) w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Calculator className="size-4 text-foreground-muted" aria-hidden />
          {sourceLabel ?? t("financial.title")}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-base font-semibold tabular-nums">
            {money(totals.grandTotal)}
          </span>
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </span>
      </button>

      <p className="mt-1 text-xs text-foreground-muted">{t("financial.internalOnly")}</p>
      <p className="mt-1 text-xs" data-testid="financial-method">
        <span className="text-foreground-muted">{t("financial.methodLabel")}: </span>
        {isTargetMargin
          ? t("financial.targetMarginLabel", { pct: num(strategy.targetGrossMarginPct) })
          : t("financial.methodOverheadProfit")}
        {companyStrategy ? (
          <span
            data-testid="financial-method-source"
            className="ml-2 rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground-muted"
          >
            {strategiesEqual(strategy, companyStrategy)
              ? t("pricingStrategy.sourceCompany")
              : t("pricingStrategy.sourceOverride")}
          </span>
        ) : null}
      </p>


      {costBasisUnavailable ? (
        <p
          data-testid="financial-cost-basis-provisional"
          className="mt-2 rounded-md border border-border bg-surface-muted px-2 py-1.5 text-xs text-foreground-muted"
        >
          {t("financial.costBasisUnavailable")}
        </p>
      ) : null}

      {open && !costBasisUnavailable ? (
        <dl className="mt-3 space-y-1 text-sm">
          {costRows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-foreground-muted">{label}</dt>
              <dd className="tabular-nums">{money(value)}</dd>
            </div>
          ))}

          <div className="flex justify-between gap-3 border-t border-border pt-1 font-medium">
            <dt>{t("totals.directCost")}</dt>
            <dd className="tabular-nums">{money(totals.directCost)}</dd>
          </div>

          <div className="flex justify-between gap-3 border-t border-border pt-1 font-medium">
            <dt>{t("financial.jobCost")}</dt>
            <dd data-testid="financial-job-cost" className="tabular-nums">{money(jobCost)}</dd>
          </div>
          <p className="text-xs text-foreground-muted">{t("financial.contingencyCostNote")}</p>

          {isTargetMargin ? (
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">
                {t("financial.grossProfit", { pct: num(realizedMarginPct) })}
                <span className="block text-xs">
                  {t("financial.grossProfitBase", {
                    price: money(totals.subtotal),
                    cost: money(jobCost),
                  })}
                </span>
              </dt>
              <dd data-testid="financial-gross-profit" className="tabular-nums">
                {money(grossProfit)}
              </dd>
            </div>
          ) : null}
          {isTargetMargin ? (
            <p
              data-testid="financial-target-vs-realized"
              className="text-xs text-foreground-muted"
            >
              {t("financial.targetVsRealized", {
                target: num(strategy.targetGrossMarginPct),
                realized: num(realizedMarginPct),
              })}
            </p>
          ) : (
            <>
          <div className="flex justify-between gap-3 pt-1">
            <dt className="text-foreground-muted">
              {t("financial.overheadLabel", { pct: num(overheadPct) })}
              <span className="block text-xs">
                {t("financial.overheadBase", { base: money(overheadBase) })}
              </span>
            </dt>
            <dd data-testid="financial-overhead" className="tabular-nums">
              {money(totals.overhead)}
            </dd>
          </div>

          <div className="flex justify-between gap-3">
            <dt className="text-foreground-muted">
              {t("financial.profitLabel", { pct: num(profitPct) })}
              <span className="block text-xs">
                {t("financial.profitBase", { base: money(profitBase) })}
              </span>
            </dt>
            <dd data-testid="financial-profit" className="tabular-nums">
              {money(totals.profit)}
            </dd>
          </div>

          {totals.contingency > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">
                {t("financial.contingencyLabel", { pct: num(contingencyPct) })}
                <span className="block text-xs">
                  {t("financial.contingencyBase", { base: money(contingencyBase) })}
                </span>
              </dt>
              <dd className="tabular-nums">{money(totals.contingency)}</dd>
            </div>
          ) : null}

          <div className="flex justify-between gap-3">
            <dt className="text-foreground-muted">{t("financial.markup")}</dt>
            <dd data-testid="financial-markup" className="tabular-nums">
              {money(markup)}
            </dd>
          </div>

            </>
          )}

          <div className="flex justify-between gap-3 border-t border-border pt-1">
            <dt className="text-foreground-muted">{t("totals.subtotal")}</dt>
            <dd className="tabular-nums">{money(totals.subtotal)}</dd>
          </div>

          {totals.tax > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">{t("totals.tax")}</dt>
              <dd className="tabular-nums">{money(totals.tax)}</dd>
            </div>
          ) : null}

          <div className="flex justify-between gap-3 border-t border-border pt-1 text-base font-semibold">
            <dt>{t("financial.sellingPrice")}</dt>
            <dd data-testid="financial-selling-price" className="tabular-nums">
              {money(totals.grandTotal)}
            </dd>
          </div>

          {overheadBase > 0 && totals.overhead === 0 && totals.profit === 0 ? (
            <p className="pt-1 text-xs text-foreground-muted">{t("financial.noMarkupNotice")}</p>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
