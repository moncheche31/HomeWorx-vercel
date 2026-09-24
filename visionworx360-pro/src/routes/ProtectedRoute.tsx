import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { AuthLoadingPage } from "@/features/auth/pages/AuthLoadingPage";
import { logger } from "@/lib/logging/logger";

/**
 * Guards a protected route subtree. Redirects unauthenticated users to /login
 * and preserves the intended destination in the `redirect` search param.
 *
 * NOTE: This is a UX-level guard only. Real authorization lives in Postgres
 * Row Level Security and server-side checks — never trust the client alone.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });

  useEffect(() => {
    logger.debug("auth_lifecycle", {
      event: "ProtectedRoute evaluated",
      timestamp: new Date().toISOString(),
      authStatus: status,
      destination: location.pathname,
    });
  }, [location.pathname, status]);

  useEffect(() => {
    if (status !== "unauthenticated" && status !== "error") return;
    // Guard against re-firing while the route is transitioning to /login: without
    // this, the effect nests the current /login URL into its own redirect param
    // and produces /login?redirect=/login?redirect=/login?... indefinitely.
    if (location.pathname === "/login" || location.pathname.startsWith("/login/")) return;
    const redirect = location.pathname + (location.searchStr ?? "");
    logger.debug("auth_lifecycle", {
      event: "redirect initiated",
      timestamp: new Date().toISOString(),
      destination: "/login",
      preservedRoute: redirect,
    });
    void navigate({
      to: "/login",
      search: { redirect },
      replace: true,
    });
  }, [status, navigate, location.pathname, location.searchStr]);

  if (status !== "authenticated") {
    // Session check in flight, or the redirect effect above is running.
    return <AuthLoadingPage />;
  }

  return <>{children}</>;
}
