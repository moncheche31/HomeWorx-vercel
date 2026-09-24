import { useTranslation } from "react-i18next";
import { WarningNotice } from "@/components/feedback/Notice";
import type {
  ProposalDocument,
  ProposalTemplateContent,
  ProposalTemplateSection,
  ProposalThemeTokens,
} from "@/domains/proposal";
import { ProposalCover } from "./ProposalCover";
import { ProposalSectionShell } from "./ProposalSectionShell";
import { ProposalGallery } from "./ProposalGallery";
import { ProposalInvestment } from "./ProposalInvestment";
import { ProposalPricingNotices } from "./ProposalPricingNotices";
import { ProposalAsIllustratedBlock } from "./ProposalAsIllustrated";

interface Props {
  doc: ProposalDocument;
  content: ProposalTemplateContent;
  tokens: ProposalThemeTokens;
  currency: string;
  selectedLevel: string | null;
  onSelectLevel: (key: string) => void;
}

/**
 * Realtor-oriented presentation (buyer-facing transformation proposal and the
 * realtor internal opportunity brief). Presentation only — every value shown
 * comes from the same document the contractor template renders.
 */
export function ProposalTemplateView({
  doc,
  content,
  tokens,
  currency,
  selectedLevel,
  onSelectLevel,
}: Props) {
  const { t } = useTranslation("proposal");

  const before = doc.gallery.find((g) => g.kind === "before") ?? null;
  const after = doc.gallery.find((g) => g.kind === "rendering") ?? null;
  const inspiration = doc.gallery.find((g) => g.kind === "inspiration") ?? null;
  const coverMedia = after?.media[0] ?? before?.media[0] ?? null;

  const hasContent = (section: ProposalTemplateSection): boolean => {
    switch (section.render) {
      case "gallery_before":
        return !!before;
      case "gallery_after":
        return !!after || !!inspiration;
      case "gallery_pair":
        return !!before || !!after;
      case "investment":
        return doc.investment.length > 0 || !!doc.asIllustrated;
      default:
        return true;
    }
  };

  const renderBody = (section: ProposalTemplateSection) => {
    switch (section.render) {
      case "gallery_before":
        return before ? <ProposalGallery projectId={doc.projectId} groups={[before]} /> : null;
      case "gallery_after":
        return (
          <ProposalGallery
            projectId={doc.projectId}
            groups={[after, inspiration].filter(Boolean) as typeof doc.gallery}
          />
        );
      case "gallery_pair":
        return (
          <ProposalGallery
            projectId={doc.projectId}
            groups={[before, after].filter(Boolean) as typeof doc.gallery}
          />
        );
      case "investment":
        return (
          <div className="space-y-4">
            <ProposalPricingNotices doc={doc} currency={currency} />
            {doc.asIllustrated ? (
              <ProposalAsIllustratedBlock value={doc.asIllustrated} currency={currency} />
            ) : null}
            <ProposalInvestment
              options={doc.investment}
              currency={currency}
              pricing={doc.pricingPresentation}
              selectedKey={selectedLevel}
              onSelect={onSelectLevel}
            />
          </div>
        );
      case "notice":
        return null;
      default:
        return null;
    }
  };

  return (
    <div
      className={`proposal-doc ${tokens.className} space-y-5`}
      style={
        doc.branding.accentColor
          ? ({ "--proposal-accent": doc.branding.accentColor } as React.CSSProperties)
          : undefined
      }
    >
      {content.internalOnly ? (
        <div className="rounded-md border border-warning/50 bg-warning/10 px-4 py-3" role="note">
          <p className="text-sm font-medium">{t("template.internalBadge")}</p>
        </div>
      ) : null}

      {doc.awaitingApproval ? (
        <div className="proposal-no-print">
          <WarningNotice title={t("awaitingApproval")} />
        </div>
      ) : null}

      <ProposalCover doc={doc} tokens={tokens} coverMediaPath={coverMedia?.storagePath ?? null} />

      <ProposalSectionShell title={content.intro.heading}>
        <p className="text-base leading-relaxed md:text-lg">{content.intro.body}</p>
      </ProposalSectionShell>

      {content.sections.filter(hasContent).map((section) => (
        <ProposalSectionShell key={section.key} title={section.heading}>
          <div className="space-y-4">
            {section.body
              ? section.body.split("\n\n").map((paragraph, i) => (
                  <p
                    key={i}
                    className={
                      section.render === "notice"
                        ? "proposal-muted-text text-xs leading-relaxed md:text-sm"
                        : "text-sm leading-relaxed md:text-base"
                    }
                  >
                    {paragraph}
                  </p>
                ))
              : null}
            {renderBody(section)}
          </div>
        </ProposalSectionShell>
      ))}
    </div>
  );
}
