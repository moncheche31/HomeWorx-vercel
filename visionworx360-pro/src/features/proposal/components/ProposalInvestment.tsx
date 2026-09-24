import { useTranslation } from "react-i18next";
import { Check, Star } from "lucide-react";
import { useLocale, formatCurrency } from "@/i18n/format";
import { Button } from "@/components/ui/button";
import type { ProposalInvestmentOption, ProposalPricingPresentation } from "@/domains/proposal";

interface Props {
  options: ProposalInvestmentOption[];
  currency: string;
  selectedKey: string | null;
  onSelect?: (key: string) => void;
  /** Contractor-controlled pricing breakout. Null shows one price only. */
  pricing?: ProposalPricingPresentation | null;
}

/** Good / Better / Best presentation. Amounts come from the estimating engine. */
export function ProposalInvestment({ options, currency, selectedKey, onSelect, pricing }: Props) {
  const { t } = useTranslation("proposal");
  const locale = useLocale();

  return (
    <div className="space-y-4">
      <ul className="grid gap-4 md:grid-cols-3">
        {options.map((option) => {
          const selected = selectedKey === option.key;
          return (
            <li
              key={option.key}
              className={`proposal-card flex flex-col gap-3 p-4 ${
                option.recommended ? "ring-2 ring-[var(--proposal-accent)]" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="proposal-heading text-base">{option.label}</h3>
                {option.recommended ? (
                  <span className="proposal-accent-surface inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs">
                    <Star className="size-3" aria-hidden />
                    {t("investment.recommended")}
                  </span>
                ) : null}
              </div>

              <p className="text-2xl font-semibold tabular-nums">
                {option.amount === null
                  ? <span className="proposal-muted-text text-sm">{t("investment.pending")}</span>
                  : formatCurrency(option.amount, locale, currency)}
              </p>

              <p className="proposal-muted-text text-sm">{option.summary}</p>

              <div className="mt-auto space-y-2">
                <p className="text-xs uppercase tracking-wide proposal-muted-text">
                  {t("investment.includes")}
                </p>
                <ul className="space-y-1 text-sm">
                  {option.includes.map((line) => (
                    <li key={line} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 proposal-accent-text" aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                {onSelect ? (
                  <Button
                    type="button"
                    variant={selected ? "default" : "outline"}
                    className="min-h-11 w-full proposal-no-print"
                    onClick={() => onSelect(option.key)}
                    aria-pressed={selected}
                  >
                    {selected ? t("investment.selected") : t("investment.select")}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {pricing ? (
        <div data-testid="proposal-pricing-detail" className="proposal-card space-y-1 p-4 text-sm">
          <h3 className="proposal-heading text-base">{t("pricingDetail.title")}</h3>
          <div className="flex justify-between gap-2">
            <span>{t("pricingDetail.laborSell")}</span>
            <span className="tabular-nums">{formatCurrency(pricing.laborSell, locale, currency)}</span>
          </div>
          {pricing.handlingSell > 0 ? (
            <div className="flex justify-between gap-2">
              <span>{t("pricingDetail.handlingSell")}</span>
              <span className="tabular-nums">
                {formatCurrency(pricing.handlingSell, locale, currency)}
              </span>
            </div>
          ) : null}
          {pricing.materialSell > 0 ? (
            <div className="flex justify-between gap-2">
              <span>{t("pricingDetail.materialSell")}</span>
              <span className="tabular-nums">
                {formatCurrency(pricing.materialSell, locale, currency)}
              </span>
            </div>
          ) : null}
          {pricing.otherSell > 0 ? (
            <div className="flex justify-between gap-2">
              <span>{t("pricingDetail.otherSell")}</span>
              <span className="tabular-nums">
                {formatCurrency(pricing.otherSell, locale, currency)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between gap-2 font-semibold">
            <span>{t("pricingDetail.total")}</span>
            <span className="tabular-nums">{formatCurrency(pricing.total, locale, currency)}</span>
          </div>
          {pricing.ownerSuppliesMaterials ? (
            <>
              <p className="proposal-muted-text">{t("pricingDetail.ownerSuppliedNotice")}</p>
              {pricing.excludedMaterialSell > 0 ? (
                <p className="proposal-muted-text text-xs">
                  {t("pricingDetail.excludedMaterials", {
                    amount: formatCurrency(pricing.excludedMaterialSell, locale, currency),
                  })}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      <p className="proposal-muted-text text-xs">{t("investment.note")}</p>
    </div>
  );
}
