import { useTranslation } from "react-i18next";
import { formatCurrency, formatNumber, useLocale } from "@/i18n/format";
import { cn } from "@/lib/utils";

/**
 * TRUST RULE — job cost and sell price are NEVER blended into one unlabeled
 * number. Wherever a markup/margin is applied, both sides are shown side by
 * side with the applied margin stated, so a contractor can always tell which
 * number they are looking at.
 *
 * Presentation only: it never computes pricing, it only labels values the
 * engine already produced.
 */
export function PriceBasisSplit({
  jobCost,
  sellPrice,
  marginPct,
  currency,
  className,
  testId = "price-basis-split",
}: {
  jobCost: number;
  sellPrice: number;
  /** Target/realized gross margin applied to reach the sell price. 0 = none. */
  marginPct?: number | null;
  currency: string;
  className?: string;
  testId?: string;
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();
  const money = (v: number) => formatCurrency(v, locale, currency);
  const pct = Number(marginPct ?? 0);
  const hasMargin = Number.isFinite(pct) && pct > 0;

  return (
    <div
      data-testid={testId}
      className={cn("rounded-md border border-border bg-surface-muted p-3", className)}
    >
      <dl className="space-y-1 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-foreground-muted">{t("priceBasis.jobCost")}</dt>
          <dd data-testid={`${testId}-job-cost`} className="font-medium tabular-nums">
            {money(jobCost)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-foreground-muted">
            {hasMargin
              ? t("priceBasis.sellPriceWithMargin", { pct: formatNumber(pct, locale) })
              : t("priceBasis.sellPriceNoMargin")}
          </dt>
          <dd data-testid={`${testId}-sell-price`} className="font-semibold tabular-nums">
            {money(sellPrice)}
          </dd>
        </div>
      </dl>
      <p className="mt-1 text-xs text-foreground-muted">
        {hasMargin
          ? t("priceBasis.explainMargin", { pct: formatNumber(pct, locale) })
          : t("priceBasis.explainNoMargin")}
      </p>
    </div>
  );
}
