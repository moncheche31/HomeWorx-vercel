import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { appConfig } from "@/lib/config/env";

export function LandingPage() {
  const { t } = useTranslation(["foundation", "common"]);
  return (
    <main className="safe-top safe-bottom min-h-dvh bg-background px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-6">
        <div className="flex w-full items-center justify-between gap-3">
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-foreground-muted">
            {t("landing.envBadge", { env: appConfig.env, version: appConfig.version })}
          </span>
          <LanguageSwitcher variant="compact" />
        </div>
        <BrandMark variant="full" className="max-w-full sm:max-w-lg" />
        <h1 className="sr-only">{t("landing.srTitle")}</h1>
        <p className="text-lg text-foreground-muted">{t("common:app.tagline")}</p>
        <p className="text-sm text-foreground-muted">{t("landing.description")}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11">
            <Link to="/design-system">{t("landing.viewDesignSystem")}</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/system-status">{t("landing.systemStatus")}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
