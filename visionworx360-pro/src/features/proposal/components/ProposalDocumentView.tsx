import { useTranslation } from "react-i18next";
import { WarningNotice } from "@/components/feedback/Notice";
import type { ProposalDocument, ProposalThemeTokens } from "@/domains/proposal";
import { ProposalCover } from "./ProposalCover";
import { ProposalSectionShell } from "./ProposalSectionShell";
import { ProposalScopeList } from "./ProposalScopeList";
import { ProposalGallery } from "./ProposalGallery";
import { ProposalInvestment } from "./ProposalInvestment";
import { ProposalUpgrades } from "./ProposalUpgrades";
import { ProposalSchedule } from "./ProposalSchedule";
import { ProposalAcceptance } from "./ProposalAcceptance";
import { ProposalTerms } from "./ProposalTerms";
import { ProposalPricingNotices } from "./ProposalPricingNotices";
import { ProposalTemplateView } from "./ProposalTemplateView";

interface Props {
  doc: ProposalDocument;
  tokens: ProposalThemeTokens;
  currency: string;
  selectedLevel: string | null;
  onSelectLevel: (key: string) => void;
  onAccept: (name: string) => void;
  onResetAcceptance: () => void;
  /**
   * Client portal rendering. The client reviews and requests changes; they
   * never sign or mutate the contractor's record, so acceptance is hidden.
   */
  readOnly?: boolean;
}

/** Renders the assembled proposal in the selected theme. */
export function ProposalDocumentView({
  doc,
  tokens,
  currency,
  selectedLevel,
  onSelectLevel,
  onAccept,
  onResetAcceptance,
  readOnly = false,
}: Props) {
  const { t } = useTranslation("proposal");
  if (doc.templateContent) {
    return (
      <ProposalTemplateView
        doc={doc}
        content={doc.templateContent}
        tokens={tokens}
        currency={currency}
        selectedLevel={selectedLevel}
        onSelectLevel={onSelectLevel}
      />
    );
  }
  const has = (key: (typeof doc.sections)[number]) => doc.sections.includes(key);
  const coverMedia =
    doc.gallery.find((g) => g.kind === "rendering")?.media[0] ??
    doc.gallery.find((g) => g.kind === "before")?.media[0] ??
    null;

  return (
    <div
      className={`proposal-doc ${tokens.className} space-y-5`}
      style={
        doc.branding.accentColor
          ? ({ "--proposal-accent": doc.branding.accentColor } as React.CSSProperties)
          : undefined
      }
    >
      {doc.awaitingApproval ? (
        <div className="proposal-no-print">
          <WarningNotice title={t("awaitingApproval")} />
        </div>
      ) : null}

      <ProposalPricingNotices doc={doc} currency={currency} />

      {doc.audience === "contractor" ? (
        <p className="proposal-no-print proposal-muted-text text-xs">{t("contractorOnly")}</p>
      ) : null}

      <ProposalCover doc={doc} tokens={tokens} coverMediaPath={coverMedia?.storagePath ?? null} />

      {has("vision") ? (
        <ProposalSectionShell title={t("sections.vision")}>
          <p className="text-base leading-relaxed md:text-lg">{doc.vision}</p>
        </ProposalSectionShell>
      ) : null}

      {has("scope") ? (
        <ProposalSectionShell title={t("sections.scope")}>
          <ProposalScopeList sections={doc.scopeSections} intro={doc.scopeIntro} />
        </ProposalSectionShell>
      ) : null}

      {has("gallery") ? (
        <ProposalSectionShell title={t("sections.gallery")}>
          <ProposalGallery projectId={doc.projectId} groups={doc.gallery} />
        </ProposalSectionShell>
      ) : null}

      {has("investment") ? (
        <ProposalSectionShell title={t("sections.investment")}>
          <ProposalInvestment
            options={doc.investment}
            currency={currency}
            pricing={doc.pricingPresentation}
            selectedKey={selectedLevel}
            onSelect={onSelectLevel}
          />
        </ProposalSectionShell>
      ) : null}

      {has("upgrades") ? (
        <ProposalSectionShell title={t("sections.upgrades")}>
          <ProposalUpgrades upgrades={doc.upgrades} />
        </ProposalSectionShell>
      ) : null}

      {has("schedule") ? (
        <ProposalSectionShell title={t("sections.schedule")}>
          <ProposalSchedule phases={doc.schedule} />
        </ProposalSectionShell>
      ) : null}

      {has("warranty") ? (
        <ProposalSectionShell title={t("sections.warranty")}>
          <p className="text-sm leading-relaxed md:text-base">{doc.warranty}</p>
        </ProposalSectionShell>
      ) : null}

      {has("acceptance") && !readOnly ? (
        <ProposalSectionShell title={t("sections.acceptance")}>
          <ProposalAcceptance
            acceptance={doc.acceptance}
            onAccept={onAccept}
            onReset={onResetAcceptance}
            disabled={!doc.canFinalize}
          />
        </ProposalSectionShell>
      ) : null}

      {/* Always rendered, on screen and in print/PDF. */}
      <ProposalSectionShell title={t("sections.terms")}>
        <ProposalTerms
          preliminary={doc.pricingSource?.kind === "ballpark" || !doc.canFinalize || doc.awaitingApproval || doc.investment.every((o) => o.amount == null)}
          hasAcceptance={has("acceptance") && !readOnly}
        />
      </ProposalSectionShell>
    </div>
  );
}
