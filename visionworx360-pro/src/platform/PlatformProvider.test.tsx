import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PlatformProvider, usePlatform } from "./PlatformProvider";

// Stub TanStack Start server-fn plumbing
vi.mock("@tanstack/react-start", () => {
  const chain: Record<string, unknown> = {};
  chain.middleware = () => chain;
  chain.inputValidator = () => chain;
  chain.handler = () => async () => null;
  return {
    useServerFn: () => async () => mockProducts,
    createServerFn: () => chain,
    createMiddleware: () => ({
      server: () => ({ client: () => ({}) }),
      client: () => ({ server: () => ({}) }),
    }),
  };
});

let mockProducts: Array<{ productKey: string; accessStatus: "active" | "revoked"; settings: Record<string, unknown> }> = [];

// Stub existing consumers
vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: () => ({ status: "authenticated", user: { id: "u1" } }),
}));

let mockWorkspace: { organization: { id: string; primaryBusinessType: string } | null; organizationStatus: string } = {
  organization: { id: "org1", primaryBusinessType: "GC" },
  organizationStatus: "ready",
};

vi.mock("@/features/workspace/providers/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    organization: mockWorkspace.organization,
    organizationStatus: mockWorkspace.organizationStatus,
    profile: { role: "owner" },
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <PlatformProvider>{children}</PlatformProvider>
    </QueryClientProvider>
  );
}

function Probe() {
  const p = usePlatform();
  return (
    <div>
      <span data-testid="org">{p.activeOrganizationId}</span>
      <span data-testid="role">{p.membershipRole}</span>
      <span data-testid="status">{p.productAccessStatus}</span>
      <span data-testid="keys">{p.enabledProductKeys.join(",")}</span>
      <span data-testid="has-contractor">{String(p.hasProductAccess("CONTRACTOR"))}</span>
      <span data-testid="has-realtor">{String(p.hasProductAccess("REALTOR"))}</span>
      <span data-testid="business">{p.businessProfile.primaryBusinessType ?? ""}</span>
    </div>
  );
}

describe("PlatformProvider", () => {
  beforeEach(() => {
    mockWorkspace = { organization: { id: "org1", primaryBusinessType: "GC" }, organizationStatus: "ready" };
  });

  it("never parks on a non-terminal status when workspace resolution fails", async () => {
    mockProducts = [];
    mockWorkspace = { organization: null, organizationStatus: "error" };
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
  });

  it("resolves to a terminal status when the user has no organization yet", async () => {
    mockProducts = [];
    mockWorkspace = { organization: null, organizationStatus: "missing" };
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
  });

  it("exposes single active org from WorkspaceProvider (no LIMIT-1 query)", async () => {
    mockProducts = [{ productKey: "CONTRACTOR", accessStatus: "active", settings: {} }];
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
    expect(screen.getByTestId("org").textContent).toBe("org1");
    expect(screen.getByTestId("role").textContent).toBe("owner");
    expect(screen.getByTestId("business").textContent).toBe("GC");
  });

  it("hasProductAccess reflects active rows only", async () => {
    mockProducts = [
      { productKey: "CONTRACTOR", accessStatus: "active", settings: {} },
      { productKey: "REALTOR", accessStatus: "revoked", settings: {} },
    ];
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
    expect(screen.getByTestId("has-contractor").textContent).toBe("true");
    expect(screen.getByTestId("has-realtor").textContent).toBe("false");
    expect(screen.getByTestId("keys").textContent).toBe("CONTRACTOR");
  });

  it("returns false for unknown product without throwing", async () => {
    mockProducts = [];
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
    expect(screen.getByTestId("has-contractor").textContent).toBe("false");
  });
});
