import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function NotFoundPage() {
  const { t } = useTranslation("foundation");
  const linkRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    document.title = t("notFound.docTitle");
    linkRef.current?.focus();
  }, [t]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {t("notFound.code")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">{t("notFound.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("notFound.description")}</p>
        <Link
          ref={linkRef}
          to="/"
          className="mt-6 inline-flex min-h-[44px] items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          {t("notFound.return")}
        </Link>
      </div>
    </main>
  );
}
