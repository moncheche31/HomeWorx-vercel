import { useTranslation } from "react-i18next";
import type { ProposalDocument } from "@/domains/proposal";

/**
 * Shared pricing-integrity notices. Rendered identically by every proposal
 * template so the Ballpark / Detailed safeguards can never diverge per
 * template.
 */
export function ProposalPricingNotices({
  doc,
  currency,
}: {
  doc: ProposalDocument;
  currency: string;
}) {
  const { t } = useTranslation("proposal");
  const money = (n: number) =>
    new Intl.NumberFormat(doc.locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <>
      {doc.pricingSource?.kind === "detailed_incomplete" ? (
        <div
          className="space-y-2 rounded-md border border-warning/50 bg-warning/10 px-4 py-3"
          role="alert"
        >
          <p className="font-medium">{t("pricing.incompleteTitle")}</p>
          <p className="text-sm proposal-muted-text">{t("pricing.incompleteBody")}</p>
          {doc.pricingSource.ballpark ? (
            <p className="text-sm font-medium">
              {t("pricing.ballparkReference", {
                low: money(doc.pricingSource.ballpark.low),
                expected: money(doc.pricingSource.ballpark.expected),
                high: money(doc.pricingSource.ballpark.high),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {doc.pricingSource?.kind === "ballpark" ? (
        <div className="rounded-md border border-border bg-surface-muted px-4 py-3" role="status">
          <p className="font-medium">{t("pricing.ballparkTitle")}</p>
          <p className="mt-1 text-sm proposal-muted-text">{t("pricing.ballparkBody")}</p>
        </div>
      ) : null}
    </>
  );
}
