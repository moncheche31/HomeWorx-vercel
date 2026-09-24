import { useTranslation } from "react-i18next";
import {
  DEFAULT_PROPOSAL_TERMS,
  resolveProposalTermsClauses,
  type ProposalTermsConfig,
} from "@/domains/proposal/terms";

/**
 * Customer-facing estimate/proposal terms. Rendered on screen AND in the
 * print/PDF output (no `proposal-no-print` class), with centralized wording.
 */
export function ProposalTerms({
  preliminary,
  hasAcceptance,
  config = DEFAULT_PROPOSAL_TERMS,
}: {
  preliminary: boolean;
  hasAcceptance: boolean;
  config?: ProposalTermsConfig;
}) {
  const { t } = useTranslation("proposal");
  const clauses = resolveProposalTermsClauses(config, { preliminary, hasAcceptance });

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {clauses.map((clause) => (
          <li key={clause} className="text-sm leading-relaxed md:text-base">
            <span className="font-medium">{t(`terms.clause.${clause}.heading`)}: </span>
            <span>
              {t(`terms.clause.${clause}.body`, { days: config.validityDays })}
            </span>
          </li>
        ))}
      </ul>
      <p className="proposal-muted-text text-xs">
        {t("terms.reference", { version: config.version })}
      </p>
    </div>
  );
}
