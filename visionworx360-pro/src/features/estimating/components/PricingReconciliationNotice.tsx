import { useTranslation } from "react-i18next";
import { Scale } from "lucide-react";

import { formatCurrency, formatNumber, useLocale } from "@/i18n/format";
import type { PricingReconciliation } from "@/domains/estimating";

/**
 * CONTRACTOR-ONLY reconciliation between the preliminary estimate and the
 * final selling price.
 *
 * The invariant is that identical scope, quantities and pricing settings
 * produce the same number in both places. When they differ, the difference is
 * stated with whatever explains it — a silent drift is a defect, not a
 * presentation detail. `proposal-no-print` keeps it out of client paths.
 */
export function PricingReconciliationNotice({
  reconciliation,
  currency,
  className = "",
}: {
  reconciliation: PricingReconciliation;
  currency: string;
  className?: string;
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();

  if (reconciliation.reconciles) return null;
  if (reconciliation.reasons.some((r) => r.code === "no_preliminary")) return null;

  const money = (v: number) => formatCurrency(v, locale, currency);
  const pct = (v: number) => formatNumber(v, locale);

  return (
    <div
      data-testid="pricing-reconciliation-notice"
      role="status"
      className={`proposal-no-print flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs ${className}`}
    >
      <Scale className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="grid gap-1">
        <p className="font-medium">{t("reconciliation.title")}</p>
        <p className="text-foreground-muted">
          {t("reconciliation.summary", {
            preliminary: money(reconciliation.preliminary ?? 0),
            final: money(reconciliation.final ?? 0),
            delta: money(Math.abs(reconciliation.delta)),
            pct: pct(Math.abs(reconciliation.deltaPct)),
          })}
        </p>
        <ul className="list-disc pl-4 text-foreground-muted">
          {reconciliation.reasons.map((reason, index) => (
            <li key={`${reason.code}-${index}`} data-testid="pricing-reconciliation-reason">
              {t(`reconciliation.reasons.${reason.code}`, {
                ...(reason as unknown as Record<string, unknown>),
              })}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
