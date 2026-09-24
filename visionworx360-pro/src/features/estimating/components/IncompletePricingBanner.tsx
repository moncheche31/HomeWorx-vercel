import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { useLocale, formatCurrency } from "@/i18n/format";
import type { DetailedIntegrity } from "@/domains/estimating";
import type { BallparkSummary } from "../services/ballparkSummary";

/**
 * Shown when a detailed estimate is materially incomplete — typically right
 * after Ballpark -> Detailed conversion, while most scope lines still carry no
 * price. The partial total must never read as a credible final number, so the
 * original ballpark band stays on screen as the reference.
 */
export function IncompletePricingBanner({
  integrity,
  ballpark,
  currency,
}: {
  integrity: DetailedIntegrity;
  ballpark: BallparkSummary | null;
  currency: string;
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();
  if (!integrity.isIncomplete) return null;
  const money = (v: number) => formatCurrency(v, locale, ballpark?.currency ?? currency);

  return (
    <section
      role="status"
      aria-label={t("integrity.title")}
      data-testid="detailed-pricing-incomplete"
      className="space-y-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-3 text-sm"
    >
      <p className="flex items-center gap-2 font-medium text-foreground">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        {t("integrity.title")}
      </p>
      <p className="text-foreground-muted">
        {integrity.totalLines === 0
          ? t("integrity.noLines")
          : t("integrity.unpriced", {
              unpriced: integrity.unpricedLines,
              total: integrity.totalLines,
            })}
      </p>
      {ballpark ? (
        <p className="text-foreground-muted">
          {t("integrity.ballparkReference", {
            low: money(ballpark.low),
            expected: money(ballpark.expected),
            high: money(ballpark.high),
          })}
        </p>
      ) : null}
      <p className="text-foreground-muted">{t("integrity.notFinal")}</p>
    </section>
  );
}
