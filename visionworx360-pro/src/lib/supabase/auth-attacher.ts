import { createMiddleware } from "@tanstack/react-start";
import { PublicEnvConfigurationError } from "@/lib/config/env";
import { appConfig } from "@/lib/config/env";
import { getSupabase } from "./client";
import { workspaceDiagnostic, workspaceDiagnosticError } from "@/lib/diagnostics/workspaceDiagnostics";

/** Backend rejects tokens whose `iat`/`exp` fall outside its own clock window. */
function isClockSkewAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /JWT issued at future|JWT expired|issued in the future|token used before issued|invalid JWT/i.test(
    message,
  );
}

export const attachConfiguredAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | undefined;

    try {
      workspaceDiagnostic("serverFn.authAttacher:start", {
        lifecycleStage: "bearer-attachment",
        authReady: false,
        configFingerprint: appConfig.publicEnvFingerprint,
      });
      const { data } = await getSupabase().auth.getSession();
      token = data.session?.access_token;
      workspaceDiagnostic("serverFn.authAttacher:session", {
        lifecycleStage: "bearer-attachment",
        authReady: Boolean(data.session),
        userPresent: Boolean(data.session?.user),
        bearerAttached: Boolean(token),
        configFingerprint: appConfig.publicEnvFingerprint,
      });
    } catch (error) {
      workspaceDiagnosticError("serverFn.authAttacher:error", error);
      if (!(error instanceof PublicEnvConfigurationError)) throw error;
    }

    try {
      return await next({
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (error) {
      if (!token || !isClockSkewAuthError(error)) throw error;

      // Clock skew between the device and the backend: mint a fresh token once and retry.
      workspaceDiagnosticError("serverFn.authAttacher:clockSkewRetry", error);
      const { data, error: refreshError } = await getSupabase().auth.refreshSession();
      const refreshed = data.session?.access_token;
      if (refreshError || !refreshed) throw error;

      return await next({ headers: { Authorization: `Bearer ${refreshed}` } });
    }
  },
);
