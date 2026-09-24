import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { AuthLoadingPage } from "@/features/auth/pages/AuthLoadingPage";
import { readLastAppRoute } from "@/lib/session/lastRoute";
import { logger } from "@/lib/logging/logger";

/**
 * Cold-start router for `/`.
 *
 * The previous implementation rendered a static marketing/logo page for
 * unauthenticated visitors and never initiated navigation, so a cold open of
 * the preview (which always lands on `/`) stalled on that page until the user
 * manually changed the route. This component always resolves the first
 * navigation from the single AuthProvider state source:
 *
 *   authenticated   -> last valid /app route, else /app/dashboard
 *   unauthenticated -> /login (also for the terminal `error` state)
 *   in-flight       -> neutral loading screen (which has its own recovery)
 *
 * No new timers, no reloads, no second auth source.
 */
export function RootRedirect() {
  const { status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "initializing" || status === "signing_in" || status === "refreshing") return;

    const target =
      status === "authenticated" ? (readLastAppRoute() ?? "/app/dashboard") : "/login";

    logger.debug("auth_lifecycle", {
      event: "cold start route resolved",
      timestamp: new Date().toISOString(),
      authStatus: status,
      destination: target,
    });

    void navigate({ to: target, replace: true });
  }, [status, navigate]);

  return <AuthLoadingPage />;
}
