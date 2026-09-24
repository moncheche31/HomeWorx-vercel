import { useTranslation } from "react-i18next";
import { useLocale, formatCurrency } from "@/i18n/format";
import type { ProposalAsIllustrated as AsIllustrated } from "@/domains/proposal";

interface Props {
  value: AsIllustrated;
  currency: string;
}

/**
 * Buyer / realtor facing pricing block: the overall planning range stays
 * visible, and the "Project as Illustrated" figure is presented as a separate
 * estimate tied to the illustrated finish/design level — never a contract
 * price. Renders identically on screen and in Print / Save as PDF.
 */
export function ProposalAsIllustratedBlock({ value, currency }: Props) {
  const { t } = useTranslation("proposal");
  const locale = useLocale();
  const money = (n: number) => formatCurrency(n, locale, currency);

  return (
    <section
      className="proposal-card space-y-3 p-4"
      aria-label={t("asIllustrated.rangeTitle")}
      data-testid="proposal-as-illustrated"
    >
      <div>
        <p className="text-xs uppercase tracking-wide proposal-muted-text">
          {t("asIllustrated.rangeTitle")}
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {money(value.band.low)} – {money(value.band.high)}
        </p>
      </div>

      <div>
        <p className="text-base font-medium">
          {t("asIllustrated.amount", { amount: money(value.amount) })}
        </p>
        <p className="mt-1 text-sm proposal-muted-text">{t("asIllustrated.note")}</p>
      </div>

      {value.assumed ? (
        <p className="text-xs proposal-muted-text">{t("asIllustrated.assumed")}</p>
      ) : null}
    </section>
  );
}
