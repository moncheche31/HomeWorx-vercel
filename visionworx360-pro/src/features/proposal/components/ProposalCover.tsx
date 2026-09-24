import { useTranslation } from "react-i18next";
import { useLocale, formatDate } from "@/i18n/format";
import { ProposalImage } from "./ProposalAssetProvider";
import type { ProposalDocument, ProposalThemeTokens } from "@/domains/proposal";

interface Props {
  doc: ProposalDocument;
  tokens: ProposalThemeTokens;
  coverMediaPath?: string | null;
}

/** Branded cover page — company identity, customer, property, proposal number. */
export function ProposalCover({ doc, tokens, coverMediaPath }: Props) {
  const { t } = useTranslation("proposal");
  const locale = useLocale();
  const split = tokens.coverLayout === "split";

  return (
    <section
      className="proposal-section proposal-cover-surface overflow-hidden"
      style={{ borderRadius: "var(--proposal-radius)" }}
      aria-label={t("cover.proposalNumber")}
    >
      <div className={split ? "grid gap-0 md:grid-cols-2" : ""}>
        {coverMediaPath ? (
          <div className={split ? "min-h-48 md:min-h-full" : "aspect-[16/9] w-full"}>
            <ProposalImage
              projectId={doc.projectId}
              storagePath={coverMediaPath}
              alt={doc.projectName}
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}

        <div className={`space-y-5 p-6 md:p-10 ${tokens.coverLayout === "centered" ? "text-center" : ""}`}>
          <div
            className={`flex items-center gap-3 ${tokens.coverLayout === "centered" ? "justify-center" : ""}`}
          >
            {doc.branding.logoUrl ? (
              <img
                src={doc.branding.logoUrl}
                alt={doc.branding.companyName}
                className="h-12 w-auto object-contain"
                // A logo that fails to load must never leave a broken-image icon
                // on a client-facing proposal.
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            ) : null}
            <span className="proposal-heading text-lg">{doc.branding.companyName}</span>
          </div>
          {doc.branding.tagline ? (
            <p className="-mt-3 text-sm opacity-80">{doc.branding.tagline}</p>
          ) : null}

          <div className="space-y-2">
            <h1 className="proposal-heading text-3xl leading-tight md:text-5xl">
              {doc.templateContent ? doc.templateContent.title : doc.projectName}
            </h1>
            {doc.templateContent ? (
              <p className="proposal-heading text-lg md:text-xl">{doc.projectName}</p>
            ) : null}
            <p className="text-sm opacity-80">
              {t("cover.proposalNumber")} {doc.proposalNumber} · {formatDate(doc.issuedAt, locale)}
            </p>
          </div>

          <dl
            className={`grid gap-4 text-sm sm:grid-cols-2 ${tokens.coverLayout === "centered" ? "sm:justify-items-center" : ""}`}
          >
            <div>
              <dt className="text-xs uppercase tracking-wide opacity-70">{t("cover.preparedFor")}</dt>
              <dd className="mt-1 font-medium">{doc.customer.name ?? "—"}</dd>
              {doc.customer.propertyAddress ? (
                <dd className="opacity-80">{doc.customer.propertyAddress}</dd>
              ) : null}
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide opacity-70">{t("cover.preparedBy")}</dt>
              <dd className="mt-1 font-medium">{doc.branding.companyName}</dd>
              {doc.branding.phone ? <dd className="opacity-80">{doc.branding.phone}</dd> : null}
              {doc.branding.email ? <dd className="opacity-80">{doc.branding.email}</dd> : null}
              {doc.branding.licenseNumber ? (
                <dd className="opacity-80">
                  {t("cover.license")} {doc.branding.licenseNumber}
                </dd>
              ) : null}
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
