import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useWorkspace } from "@/features/workspace/providers/WorkspaceProvider";
import { useOrganizationProducts } from "./product-access/useProductAccess";
import type { MembershipRole, ProductKey } from "./types";
import { workspaceDiagnostic } from "@/lib/diagnostics/workspaceDiagnostics";

interface PlatformContextValue {
  activeOrganizationId: string | null;
  membershipRole: MembershipRole | null;
  enabledProductKeys: string[];
  locale: string;
  businessProfile: {
    primaryBusinessType: string | null;
    primaryTrade: string | null;
  };
  productAccessStatus: "idle" | "loading" | "ready" | "error";
  hasProductAccess: (key: ProductKey | string) => boolean;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

/**
 * PlatformProvider composes existing sources. It does NOT independently resolve
 * the active organization, membership role, or locale — those come from
 * AuthProvider, WorkspaceProvider, and i18n. Authorization decisions must still
 * be verified server-side; hasProductAccess is a UI convenience only.
 */
export function PlatformProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const workspace = useWorkspace();
  const workspaceReady = workspace.organizationStatus === "ready" && Boolean(workspace.organization?.id);
  const products = useOrganizationProducts(workspace.organization?.id ?? null, workspaceReady);
  workspaceDiagnostic("platform.workspace-consumption", {
    lifecycleStage: "platform-provider",
    organizationIdPresent: Boolean(workspace.organization?.id),
    workspaceState: workspace.organizationStatus,
    queryEnabledReason: workspaceReady ? "verified-workspace" : `workspace-${workspace.organizationStatus}`,
  });

  useEffect(() => {
    if (!workspaceReady) return;
    workspaceDiagnostic("platform.product-access:lifecycle", {
      lifecycleStage: products.isPending ? "product-access-resolution-started" : "product-access-resolution-completed",
      organizationIdPresent: Boolean(workspace.organization?.id),
      workspaceState: products.isError ? "error" : products.isSuccess ? "ready" : "loading",
    });
  }, [products.isError, products.isPending, products.isSuccess, workspace.organization?.id, workspaceReady]);

  const enabledProductKeys = useMemo(() => {
    const rows = products.data ?? [];
    return rows.filter((p) => p.accessStatus === "active").map((p) => p.productKey);
  }, [products.data]);

  const value = useMemo<PlatformContextValue>(() => {
    const orgId = workspace.organization?.id ?? null;
    return {
      activeOrganizationId: orgId,
      membershipRole: (workspace.profile.role as MembershipRole) ?? null,
      enabledProductKeys,
      locale: i18n.language ?? "en-US",
      businessProfile: {
        primaryBusinessType: workspace.organization?.primaryBusinessType ?? null,
        primaryTrade: null,
      },
      // The products query is DISABLED until the workspace resolves. A disabled
      // TanStack query reports isLoading=false/data=undefined forever, which
      // previously mapped to "idle" and parked ProductAccessGuard on the
      // loading screen with no pending promise left to resolve. Terminal
      // workspace states must therefore produce terminal access states.
      productAccessStatus: !workspaceReady
        ? workspace.organizationStatus === "loading"
          ? "loading"
          : workspace.organizationStatus === "error"
            ? "error"
            : "ready" // "missing" → onboarding owns the screen, nothing to gate
        : products.isLoading
          ? "loading"
          : products.isError
            ? "error"
            : products.data
              ? "ready"
              : "loading",
      hasProductAccess: (key) => enabledProductKeys.includes(key),
    };
  }, [workspace, enabledProductKeys, i18n.language, products.isLoading, products.isError, products.data]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("usePlatform must be used inside <PlatformProvider>");
  return ctx;
}
