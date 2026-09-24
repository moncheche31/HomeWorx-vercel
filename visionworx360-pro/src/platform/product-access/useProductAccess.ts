import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listActiveOrganizationProducts } from "./productAccess.functions";
import {
  BOOTSTRAP_RESOLUTION_TIMEOUT_MS,
  isResolutionTimeout,
  withTimeout,
} from "@/lib/async/withTimeout";
import type { OrganizationProduct } from "../types";

export function useOrganizationProducts(organizationId: string | null, workspaceReady: boolean) {
  const fetchProducts = useServerFn(listActiveOrganizationProducts);
  return useQuery<OrganizationProduct[]>({
    queryKey: ["organization-products", organizationId ?? (workspaceReady ? "missing" : "workspace-loading")],
    // Bounded like the workspace read: product access gates the whole app, so a
    // request that never settles must fail into a retryable state, not hang.
    queryFn: () =>
      withTimeout(
        fetchProducts({ data: { organizationId: organizationId ?? "" } }),
        BOOTSTRAP_RESOLUTION_TIMEOUT_MS,
        "Product access resolution",
      ),
    enabled: workspaceReady && Boolean(organizationId),
    staleTime: 60_000,
    retry: (failureCount, error) => !isResolutionTimeout(error) && failureCount < 2,
  });
}
