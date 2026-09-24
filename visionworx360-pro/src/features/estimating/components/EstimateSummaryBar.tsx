import { useTranslation } from "react-i18next";
import { useLocale, formatCurrency } from "@/i18n/format";
import type { EstimateTotals } from "@/domains/estimating/calculations";

export function EstimateSummaryBar({
  totals,
  currency,
}: {
  totals: EstimateTotals;
  currency: string;
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();
  const money = (v: number) => formatCurrency(v, locale, currency);

  const rows: Array<[string, number]> = [
    [t("totals.labor"), totals.laborTotal],
    [t("totals.material"), totals.materialTotal],
    [t("totals.equipment"), totals.equipmentTotal],
    [t("totals.subcontractor"), totals.subcontractorTotal],
    [t("totals.other"), totals.otherTotal],
    [t("totals.directCost"), totals.directCost],
    [t("totals.overhead"), totals.overhead],
    [t("totals.profit"), totals.profit],
    [t("totals.contingency"), totals.contingency],
    [t("totals.tax"), totals.tax],
  ];

  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-lg md:border">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground-muted">
          {t("totals.grandTotal")}
        </span>
        <span className="text-xl font-semibold tabular-nums md:text-2xl">
          {money(totals.grandTotal)}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-foreground-muted sm:grid-cols-3 lg:grid-cols-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="truncate">{label}</dt>
            <dd className="tabular-nums">{money(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-xs text-foreground-muted">
        {t("totals.lines", { count: totals.lineCount })}
      </p>
    </div>
  );
}
