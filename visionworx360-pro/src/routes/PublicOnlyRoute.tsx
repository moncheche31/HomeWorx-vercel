import { useEffect, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { AuthLoadingPage } from "@/features/auth/pages/AuthLoadingPage";
import { sanitizeRedirect } from "@/lib/auth/safeRedirect";

/**
 * Guards routes intended for unauthenticated visitors (login, register, etc.).
 * Redirects authenticated users to the sanitized intended destination or /app.
 */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { redirect?: string };

  useEffect(() => {
    if (status === "authenticated") {
      const target = sanitizeRedirect(search?.redirect, "/app");
      void navigate({ to: target, replace: true });
    }
  }, [status, navigate, search?.redirect]);

  if (status === "initializing") return <AuthLoadingPage />;
  if (status === "authenticated") return <AuthLoadingPage stage="redirecting" />;

  return <>{children}</>;
}
