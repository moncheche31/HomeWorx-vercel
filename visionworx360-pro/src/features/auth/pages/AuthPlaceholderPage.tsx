import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

interface Props {
  titleKey: string;
  descriptionKey: string;
}

export function AuthPlaceholderPage({ titleKey, descriptionKey }: Props) {
  const { t } = useTranslation(["auth", "common"]);
  return (
    <main className="safe-top safe-bottom min-h-dvh bg-background px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            {t("common:actions.backHome")}
          </Link>
          <LanguageSwitcher variant="compact" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-foreground">{t(titleKey)}</h1>
        <p className="mt-3 text-sm text-foreground-muted">{t(descriptionKey)}</p>
        <p className="mt-6 rounded-md border border-border bg-card p-4 text-xs text-foreground-muted">
          {t("auth:placeholder.deferredNotice")}
        </p>
      </div>
    </main>
  );
}
