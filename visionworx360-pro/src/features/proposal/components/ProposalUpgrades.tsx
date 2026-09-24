import { useTranslation } from "react-i18next";
import type { ProposalUpgradeCard } from "@/domains/proposal";

/** Optional upgrades surfaced by the Copilot, in customer language. */
export function ProposalUpgrades({ upgrades }: { upgrades: ProposalUpgradeCard[] }) {
  const { t } = useTranslation("proposal");

  return (
    <div className="space-y-3">
      <ul className="grid gap-3 md:grid-cols-2">
        {upgrades.map((u) => (
          <li key={u.id} className="proposal-card p-4">
            <h3 className="proposal-heading text-base">{u.label}</h3>
            <p className="proposal-muted-text mt-1 text-sm">{u.description}</p>
            {u.priceLabel ? (
              <p className="mt-2 text-sm">
                <span className="proposal-muted-text">{t("upgrades.priceHint")}: </span>
                <span className="tabular-nums">{u.priceLabel}</span>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="proposal-muted-text text-xs">{t("upgrades.note")}</p>
    </div>
  );
}
