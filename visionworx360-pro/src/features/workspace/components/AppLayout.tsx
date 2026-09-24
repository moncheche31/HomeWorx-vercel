import { useEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { WorkspaceProvider } from "../providers/WorkspaceProvider";
import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";
import { MobileBottomNav } from "./MobileBottomNav";
import { saveLastAppRoute } from "@/lib/session/lastRoute";
import { PlatformProvider } from "@/platform/PlatformProvider";
import { ProductAccessGuard } from "@/platform/product-access/ProductAccessGuard";
import { PRODUCT_KEYS } from "@/platform/types";
import { usePendingLegalAcceptance } from "@/features/legal/acceptance";

function LastRouteTracker() {
  const location = useRouterState({ select: (s) => s.location });
  useEffect(() => {
    saveLastAppRoute(location.pathname + (location.searchStr ?? ""));
  }, [location.pathname, location.searchStr]);
  return null;
}

/** Persists the signup legal acceptance once a session exists. Idempotent. */
function LegalAcceptanceFlusher() {
  usePendingLegalAcceptance(true);
  return null;
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <PlatformProvider>
        <ProductAccessGuard productKey={PRODUCT_KEYS.CONTRACTOR}>
          <LastRouteTracker />
          <LegalAcceptanceFlusher />
          <div className="flex min-h-dvh w-full bg-background">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <AppTopBar />
              <main className="flex-1 pb-24 md:pb-8">{children}</main>
            </div>
            <MobileBottomNav />
          </div>
        </ProductAccessGuard>
      </PlatformProvider>
    </WorkspaceProvider>
  );
}
