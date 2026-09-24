import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { NetworkStatusProvider } from "@/lib/network/NetworkStatusProvider";
import { AppErrorBoundary } from "@/app/AppErrorBoundary";
import { appConfig } from "@/lib/config/env";
import { PublicConfigProvider, usePublicConfig } from "@/lib/config/PublicConfigProvider";
import { ConfigurationErrorPage } from "@/pages/ConfigurationErrorPage";
import { AuthLoadingPage } from "@/features/auth/pages/AuthLoadingPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { FullPageError } from "@/components/feedback/FullPageError";
import { generateReferenceId } from "@/lib/errors/AppError";
import { Toaster } from "sonner";
import { I18nProvider } from "@/i18n/I18nProvider";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import { logger } from "@/lib/logging/logger";
import { DisplayPreferencesProvider } from "@/features/settings/display/DisplayPreferencesProvider";

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const referenceId = generateReferenceId();
  const { t } = useTranslation(["errors", "common"]);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <FullPageError
      title={t("errors:route.title")}
      description={t("errors:route.description")}
      referenceId={referenceId}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t("common:actions.tryAgain")}
          </button>
          <a
            href="/"
            className="inline-flex min-h-[44px] items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground"
          >
            {t("common:actions.goHome")}
          </a>
        </div>
      }
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "VisionWorx360 Pro" },
      {
        name: "description",
        content: "Voice-first estimating for contractors — VisionWorx360 Pro.",
      },
      { name: "author", content: "VisionWorx360" },
      { property: "og:title", content: "VisionWorx360 Pro" },
      { property: "og:description", content: "Voice-first estimating for contractors." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-text-size="standard" data-density="comfortable" data-device-text="on">
      <head>
        <HeadContent />
      </head>
      <body data-env-build={appConfig.publicEnvFingerprint}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    logger.info("app_bootstrap", {
      event: "hydration completed",
      timestamp: new Date().toISOString(),
      visibility: document.visibilityState,
    });
    const onPageShow = (event: PageTransitionEvent) => {
      logger.info("app_bootstrap", {
        event: "pageshow",
        timestamp: new Date().toISOString(),
        persisted: event.persisted,
        visibility: document.visibilityState,
      });
    };
    const onVisibilityChange = () => {
      logger.info("app_bootstrap", {
        event: "visibilitychange",
        timestamp: new Date().toISOString(),
        visibility: document.visibilityState,
      });
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <AppErrorBoundary>
      <I18nProvider>
        <PublicConfigProvider>
          <ConfigurationGate queryClient={queryClient} />
        </PublicConfigProvider>
      </I18nProvider>
    </AppErrorBoundary>
  );
}

function ConfigurationGate({ queryClient }: { queryClient: QueryClient }) {
  const config = usePublicConfig();

  useEffect(() => {
    logger.info("app_bootstrap", {
      event: "config resolved",
      timestamp: new Date().toISOString(),
      state: config.state,
      fingerprint: config.fingerprint,
    });
  }, [config.fingerprint, config.state]);

  if (config.state === "loading") return <AuthLoadingPage stage="starting" />;
  if (config.state === "failed") return <ConfigurationErrorPage missing={config.missing} />;

  return (
    <QueryClientProvider client={queryClient}>
      <NetworkStatusProvider>
        <AuthProvider>
          <DisplayPreferencesProvider>
            <Outlet />
            <Toaster position="top-center" richColors />
          </DisplayPreferencesProvider>
        </AuthProvider>
      </NetworkStatusProvider>
    </QueryClientProvider>
  );
}
