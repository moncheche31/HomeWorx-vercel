import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useAuth } from "../hooks/useAuth";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { Button } from "@/components/ui/button";

interface Props {
  titleKey: string;
  descriptionKey: string;
}

export function ProtectedPlaceholderPage({ titleKey, descriptionKey }: Props) {
  const { t } = useTranslation(["auth", "common"]);
  const { signOut, status } = useAuth();

  return (
    <main className="safe-top safe-bottom min-h-dvh bg-background px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <Link to="/app" className="text-sm text-muted-foreground hover:text-foreground">
            {t("auth:protected.backToApp")}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="compact" />
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => void signOut()}
              disabled={status === "signing_out"}
            >
              {t("common:actions.signOut")}
            </Button>
          </div>
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-foreground">{t(titleKey)}</h1>
        <p className="mt-3 text-sm text-foreground-muted">{t(descriptionKey)}</p>
        <p className="mt-6 rounded-md border border-border bg-card p-4 text-xs text-foreground-muted">
          {t("auth:protected.deferredNotice")}
        </p>
      </div>
    </main>
  );
}
