import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { usePlatform } from "../PlatformProvider";
import { useWorkspace } from "@/features/workspace/providers/WorkspaceProvider";
import { WorkspaceStatusScreen } from "@/features/workspace/components/WorkspaceStatusScreen";
import type { ProductKey } from "../types";
import { workspaceDiagnostic } from "@/lib/diagnostics/workspaceDiagnostics";

/**
 * Client-side guard: waits for auth + org + product-access resolution, then
 * redirects to /no-access if the required product is missing. This is a UX
 * gate — server functions and RLS remain the authoritative boundary.
 *
 * /no-access lives OUTSIDE the Contractor-gated tree so users can see it.
 */
export function ProductAccessGuard({
  productKey,
  children,
}: {
  productKey: ProductKey | string;
  children: ReactNode;
}) {
  const { productAccessStatus, hasProductAccess, activeOrganizationId } = usePlatform();
  const { refreshOrganization } = useWorkspace();
  const navigate = useNavigate();
  const allowed = hasProductAccess(productKey);
  workspaceDiagnostic("platform.product-guard", {
    lifecycleStage: "product-access-guard",
    organizationIdPresent: Boolean(activeOrganizationId),
    workspaceState: productAccessStatus,
    queryEnabledReason: activeOrganizationId ? `access-${productAccessStatus}` : "workspace-unresolved",
  });

  useEffect(() => {
    if (productAccessStatus !== "ready") return;
    if (!activeOrganizationId) return; // WorkspaceProvider handles onboarding
    if (!allowed) {
      void navigate({ to: "/no-access", search: { product: productKey }, replace: true });
    }
  }, [productAccessStatus, allowed, activeOrganizationId, navigate, productKey]);

  const retry = () => {
    // Re-runs the failed workspace/product-access queries in place. Never a
    // document reload: that re-enters the same bootstrap from zero.
    void refreshOrganization();
  };

  /*
   * Auth has already settled by the time this guard renders, so these are
   * WORKSPACE states, not session states. Both are bounded by the resolution
   * budget in the queries themselves, and the error state offers retry.
   */
  if (productAccessStatus === "error") {
    return <WorkspaceStatusScreen variant="error" onRetry={retry} />;
  }
  if (productAccessStatus === "loading" || productAccessStatus === "idle") {
    return <WorkspaceStatusScreen variant="loading" onRetry={retry} />;
  }
  if (productAccessStatus === "ready" && activeOrganizationId && !allowed) {
    return <WorkspaceStatusScreen variant="loading" onRetry={retry} />;
  }
  return <>{children}</>;
}
