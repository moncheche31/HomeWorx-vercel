import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand/BrandMark";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import type { LegalDocument, LegalSection } from "@/domains/legal/documents";

/**
 * Public, mobile-readable legal document surface.
 *
 * Copy is owner-approved production draft wording carried in the `legal`
 * namespace and versioned in the document registry.
 */
export function LegalDocumentPage({ document }: { document: LegalDocument }) {
  const { t, i18n } = useTranslation(["legal", "common"]);
  const sections = t(document.sectionsKey, {
    ns: "legal",
    returnObjects: true,
  }) as unknown as LegalSection[];
  const list = Array.isArray(sections) ? sections : [];

  return (
    <main className="safe-top safe-bottom min-h-dvh bg-background px-5 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="text-sm text-foreground-muted hover:text-foreground">
            {t("common:actions.backHome")}
          </Link>
          <LanguageSwitcher variant="compact" />
        </div>
        <div className="mt-6">
          <BrandMark variant="compact" />
        </div>

        <header className="mt-6">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            {t(document.titleKey, { ns: "legal" })}
          </h1>
          <p className="mt-2 text-base leading-relaxed text-foreground-muted sm:text-sm">
            {t(document.summaryKey, { ns: "legal" })}
          </p>
          <p className="mt-2 text-xs text-foreground-muted">
            {t("legal:effectiveLabel", {
              date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(
                new Date(`${document.effectiveDate}T00:00:00Z`),
              ),
              version: document.version,
            })}
          </p>
        </header>

        <div className="mt-6 space-y-6 pb-12">
          {list.map((section, index) => (
            <section key={`${document.key}-${index}`} className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">{section.heading}</h2>
              <p className="text-base leading-relaxed text-foreground sm:text-sm">{section.body}</p>
            </section>
          ))}
          <p className="rounded-lg border border-border bg-surface-muted p-3 text-sm text-foreground-muted">
            {t("legal:contactNote")}
          </p>
        </div>
      </div>
    </main>
  );
}
