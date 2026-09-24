import { useTranslation } from "react-i18next";
import { Building2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { WorkspaceResolution } from "../hooks/useWorkspaceResolution";

/**
 * Renders the correct non-empty state for an unresolved workspace.
 * Returns null when the workspace is `ready` — callers then own the real
 * loading / error / empty states of their own query.
 */
export function WorkspaceStateNotice({
  state,
  onRetry,
}: {
  state: WorkspaceResolution;
  onRetry: () => void;
}) {
  const { t } = useTranslation("workspace");
  const { signOut } = useAuth();

  if (state === "ready") return null;

  if (state === "loading" || state === "unauthenticated") {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner label={t("workspaceState.authLoading")} />
        <span className="ml-2 text-sm text-foreground-muted">
          {t("workspaceState.authLoading")}
        </span>
      </div>
    );
  }

  if (state === "org-loading") {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner label={t("workspaceState.loading")} />
        <span className="ml-2 text-sm text-foreground-muted">{t("workspaceState.loading")}</span>
      </div>
    );
  }

  if (state === "org-missing") {
    return (
      <EmptyState
        icon={Building2}
        title={t("workspaceState.setupTitle")}
        description={t("workspaceState.setupDescription")}
        action={
          <Button asChild className="min-h-11">
            <Link to="/app/organization">{t("workspaceState.setupAction")}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-8 text-center"
    >
      <h3 className="text-base font-semibold text-foreground">{t("workspaceState.errorTitle")}</h3>
      <p className="max-w-sm text-sm text-foreground-muted">
        {t("workspaceState.errorDescription")}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button className="min-h-11" onClick={onRetry}>
          {t("workspaceState.retry")}
        </Button>
        <Button variant="outline" className="min-h-11" onClick={() => void signOut()}>
          {t("workspaceState.signOut")}
        </Button>
      </div>
    </div>
  );
}
