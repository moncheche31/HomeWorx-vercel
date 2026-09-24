import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { Button } from "@/components/ui/button";

/**
 * Post-authentication bootstrap screen.
 *
 * Once auth is settled, a stall belongs to the WORKSPACE, not the session:
 * showing "Checking your session…" there is both wrong and alarming, and the
 * only recovery it offered was a full document reload back into the same
 * unbounded query. This screen states what is actually pending and retries the
 * failed query in place — no reload, no token clearing.
 */
export function WorkspaceStatusScreen({
  variant,
  onRetry,
}: {
  variant: "loading" | "error";
  onRetry: () => void;
}) {
  const { t } = useTranslation(["workspace"]);
  const isError = variant === "error";
  return (
    <main
      role="status"
      aria-live="polite"
      data-testid="workspace-status-screen"
      data-variant={variant}
      className="flex min-h-dvh items-center justify-center bg-background px-5 py-safe"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {!isError ? <LoadingSpinner /> : null}
        <p className="text-sm text-foreground-muted">
          {isError ? t("workspace:resolution.failed") : t("workspace:resolution.loading")}
        </p>
        {isError ? (
          <Button className="h-11" onClick={onRetry}>
            {t("workspace:resolution.retry")}
          </Button>
        ) : null}
      </div>
    </main>
  );
}
