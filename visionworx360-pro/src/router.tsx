import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { logger } from "@/lib/logging/logger";
import { workspaceDiagnostic } from "@/lib/diagnostics/workspaceDiagnostics";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  router.subscribe("onBeforeNavigate", (event) => {
    workspaceDiagnostic("navigation.start", {
      lifecycleStage: "navigation",
      destination: event.toLocation.pathname,
    });
    logger.debug("router_lifecycle", {
      event: "navigation started",
      timestamp: new Date().toISOString(),
      destination: event.toLocation.pathname,
    });
  });
  router.subscribe("onResolved", (event) => {
    workspaceDiagnostic("navigation.complete", {
      lifecycleStage: "navigation",
      destination: event.toLocation.pathname,
    });
    logger.debug("router_lifecycle", {
      event: "navigation completed",
      timestamp: new Date().toISOString(),
      destination: event.toLocation.pathname,
    });
  });

  return router;
};
