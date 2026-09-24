import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { appConfig } from "@/lib/config/env";
import { checkSupabaseConnectivity, type SupabaseStatus } from "@/lib/supabase/client";
import { useNetworkStatus } from "@/lib/network/NetworkStatusProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useAuth } from "@/features/auth/hooks/useAuth";

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground text-right break-words">{value}</dd>
    </div>
  );
}

export function SystemStatusPage() {
  const { t } = useTranslation(["status", "common", "auth"]);
  const [supabase, setSupabase] = useState<SupabaseStatus>({ status: "not_configured" });
  const { status: network } = useNetworkStatus();
  const { status: authStatus, session } = useAuth();

  useEffect(() => {
    let mounted = true;
    checkSupabaseConnectivity().then((s) => {
      if (mounted) setSupabase(s);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const supabaseLabel =
    supabase.status === "connected"
      ? t("values.connected")
      : supabase.status === "not_configured"
        ? t("values.notConfigured")
        : t("values.unavailable");

  const authServiceLabel =
    supabase.status === "connected"
      ? t("auth:status.operational")
      : supabase.status === "not_configured"
        ? t("values.notConfigured")
        : t("auth:status.unavailable");

  const authStateLabel =
    authStatus === "authenticated"
      ? t("auth:status.authenticated")
      : authStatus === "initializing"
        ? t("common:status.loading")
        : t("auth:status.unauthenticated");

  const sessionLabel = session ? t("auth:status.yes") : t("auth:status.no");

  return (
    <main className="min-h-screen bg-background px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            {t("common:actions.backHome")}
          </Link>
          <LanguageSwitcher variant="compact" />
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>

        <dl className="mt-8 rounded-lg border border-border bg-card p-5">
          <StatusRow label={t("rows.application")} value={t("common:app.name")} />
          <StatusRow label={t("rows.version")} value={appConfig.version} />
          <StatusRow label={t("rows.environment")} value={appConfig.env} />
          <StatusRow label={t("rows.frontend")} value={t("values.operational")} />
          <StatusRow label={t("rows.backend")} value={supabaseLabel} />
          <StatusRow label={t("auth:status.authService")} value={authServiceLabel} />
          <StatusRow label={t("auth:status.currentAuthState")} value={authStateLabel} />
          <StatusRow label={t("auth:status.sessionPresent")} value={sessionLabel} />
          <StatusRow label={t("rows.network")} value={t(`network.${network}` as const)} />
          {appConfig.buildTimestamp && (
            <StatusRow label={t("rows.build")} value={appConfig.buildTimestamp} />
          )}
        </dl>
      </div>
    </main>
  );
}
