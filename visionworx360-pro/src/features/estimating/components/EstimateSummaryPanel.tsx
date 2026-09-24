import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { useLocale, formatCurrency, formatNumber } from "@/i18n/format";
import type { EstimateEngineTotals } from "@/domains/estimating";
import {
  presentPricing,
  type PricingMode,
} from "@/domains/estimating/pricingModes";
import { PriceBasisSplit } from "./PriceBasisSplit";


/**
 * Mobile-first estimate summary. Collapsed it shows the selling price; expanded
 * it breaks out every engine category (labor, material, product, equipment,
 * subcontractor, allowances, overhead, profit, contingency, tax).
 */
export function EstimateSummaryPanel({
  totals,
  currency,
  pricingMode = "total",
  seededPricingNotice,
}: {
  totals: EstimateEngineTotals;
  currency: string;
  /** How the job is sold. Presentation only — the engine totals never change. */
  pricingMode?: PricingMode;
  seededPricingNotice?: boolean;
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const money = (v: number) => formatCurrency(v, locale, currency);
  /*
   * The engine always calculates the COMPLETE job. The pricing mode only
   * decides which of those dollars the customer is charged for, so overhead,
   * profit and tax are pro-rated and nothing is ever counted twice.
   */
  const presented = presentPricing(totals, pricingMode);
  const showsSplit = pricingMode !== "total";
  const jobCost = Math.round(totals.jobCost || totals.directCost + totals.contingency);
  const sold = showsSplit ? presented.total : totals.grandTotal;
  const marginPct =
    jobCost > 0 && sold > jobCost ? Math.round(((sold - jobCost) / sold) * 100) : 0;


  const costRows: Array<[string, number]> = [
    [t("totals.labor"), totals.laborTotal],
    [t("totals.material"), totals.materialTotal],
    [t("totals.product"), totals.productTotal],
    [t("totals.equipment"), totals.equipmentTotal],
    [t("totals.subcontractor"), totals.subcontractorTotal],
    [t("totals.other"), totals.otherTotal],
    [t("totals.allowances"), totals.allowanceTotal],
    [t("totals.directCost"), totals.directCost],
  ];

  const markupRows: Array<[string, number]> = [
    [t("totals.overhead"), totals.overhead],
    [t("totals.profit"), totals.profit],
    [t("totals.contingency"), totals.contingency],
    [t("totals.subtotal"), totals.subtotal],
    [t("totals.tax"), totals.tax],
  ];

  return (
    <section
      className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-lg md:border"
      aria-label={t("totals.grandTotal")}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-(--control-min-h-sm) w-full items-baseline justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground-muted">
          {marginPct > 0
            ? t("priceBasis.sellPriceWithMargin", { pct: formatNumber(marginPct, locale) })
            : t("totals.sellingPrice")}
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </span>
        <span className="text-xl font-semibold tabular-nums md:text-2xl">
          {money(showsSplit ? presented.total : totals.grandTotal)}
        </span>
      </button>

      <p className="mt-1 text-xs text-foreground-muted">
        {t("totals.lines", { count: totals.lineCount })} ·{" "}
        {t("totals.laborHoursValue", { hours: formatNumber(totals.laborHours, locale) })} ·{" "}
        {t("totals.crewHoursValue", { hours: formatNumber(totals.crewHours, locale) })}
      </p>

      {/* Job cost and sell price are never blended into one unlabelled number. */}
      <PriceBasisSplit
        testId="estimate-price-basis"
        className="mt-2"
        currency={currency}
        jobCost={jobCost}
        sellPrice={showsSplit ? presented.total : totals.grandTotal}
        marginPct={marginPct}
      />


      {showsSplit ? (
        <div data-testid="pricing-mode-split" className="mt-2 space-y-1 text-xs text-foreground-muted">
          <p className="font-medium text-foreground">{t(`pricingMode.${pricingMode}`)}</p>
          <div className="flex justify-between gap-2">
            <span>{t("pricingMode.laborSell")}</span>
            <span className="tabular-nums">{money(presented.laborSell)}</span>
          </div>
          {presented.handlingSell > 0 ? (
            <div className="flex justify-between gap-2">
              <span>{t("pricingMode.handlingSell")}</span>
              <span className="tabular-nums">{money(presented.handlingSell)}</span>
            </div>
          ) : null}
          {presented.materialSell > 0 ? (
            <div className="flex justify-between gap-2">
              <span>{t("pricingMode.materialSell")}</span>
              <span className="tabular-nums">{money(presented.materialSell)}</span>
            </div>
          ) : null}
          {presented.otherSell > 0 ? (
            <div className="flex justify-between gap-2">
              <span>{t("pricingMode.otherSell")}</span>
              <span className="tabular-nums">{money(presented.otherSell)}</span>
            </div>
          ) : null}
          {presented.ownerSuppliesMaterials ? (
            <>
              <p>{t("pricingMode.ownerSuppliedNotice")}</p>
              {presented.excludedMaterialSell > 0 ? (
                <p>
                  {t("pricingMode.excludedMaterials", {
                    amount: money(presented.excludedMaterialSell),
                  })}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <dl className="space-y-1 text-xs text-foreground-muted">
            {costRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="truncate">{label}</dt>
                <dd className="tabular-nums">{money(value)}</dd>
              </div>
            ))}
          </dl>
          <dl className="space-y-1 text-xs text-foreground-muted">
            {markupRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="truncate">{label}</dt>
                <dd className="tabular-nums">{money(value)}</dd>
              </div>
            ))}
          </dl>
          {seededPricingNotice ? (
            <p className="sm:col-span-2 text-xs text-foreground-muted">
              {t("pricing.seededNotice")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
