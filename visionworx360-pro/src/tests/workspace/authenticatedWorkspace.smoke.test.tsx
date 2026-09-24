/**
 * Authenticated workspace smoke test.
 *
 * Guards the end-to-end path that the duplicate-auth-middleware regression
 * kept breaking:
 *   bearer token attached -> organization resolves -> projects load ->
 *   "Garage Conversion" is visible -> no false workspace-error state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "i18next";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import type { AuthProviderAdapter } from "@/features/auth/services/supabaseAuthAdapter";
import { WorkspaceProvider } from "@/features/workspace/providers/WorkspaceProvider";
import { ProjectsListPage } from "@/features/crm/pages/ProjectsListPage";

const getSessionMock = vi.fn();
const hoisted = vi.hoisted(() => ({
  clientMiddlewares: [] as Array<(ctx: unknown) => unknown>,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({ auth: { getSession: getSessionMock } }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => (
    <a href={to ?? "#"}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  // List controls read their state from the route search params.
  useSearch: () => ({}),
  useRouterState: () => ({ location: { pathname: "/app/projects", searchStr: "" } }),
}));

const ORGANIZATION = {
  id: "org-1",
  organizationName: "Cadorette Construction",
};

const GARAGE_PROJECT = {
  id: "proj-1",
  name: "Garage Conversion",
  status: "estimate_in_progress",
  priority: "normal",
  clientName: "Existing Client",
  budgetAmount: 42000,
  updatedAt: new Date().toISOString(),
};

const serverCalls: string[] = [];

vi.mock("@tanstack/react-start", () => {
  const chain = {
    middleware: () => chain,
    inputValidator: () => chain,
    handler: () => async () => null,
  };
  return {
    createServerFn: () => chain,
    createMiddleware: () => {
      const mw = {
        server: () => mw,
        client: (fn: (ctx: unknown) => unknown) => {
          hoisted.clientMiddlewares.push(fn);
          return mw;
        },
      };
      return mw;
    },
    useServerFn: (fn: { __name?: string }) => async () => {
      serverCalls.push(fn?.__name ?? "unknown");
      if (fn?.__name === "getMyOrganization") {
        return {
          organization: ORGANIZATION,
          trace: {
            profileLookupStatus: "found",
            organizationIdPresent: true,
            membershipStatus: "verified",
            organizationLookupStatus: "found",
          },
        };
      }
      if (fn?.__name === "listProjects") {
        return { items: [GARAGE_PROJECT], total: 1 };
      }
      return null;
    },
  };
});

vi.mock("@/features/workspace/services/organization.functions", () => ({
  getMyOrganization: { __name: "getMyOrganization" },
  saveOrganization: { __name: "saveOrganization" },
}));

vi.mock("@/features/crm/services/crm.functions", () => ({
  listProjects: { __name: "listProjects" },
  createProject: { __name: "createProject" },
  updateProject: { __name: "updateProject" },
  archiveProject: { __name: "archiveProject" },
  restoreProject: { __name: "restoreProject" },
  getProject: { __name: "getProject" },
  listClients: { __name: "listClients" },
  getClient: { __name: "getClient" },
  createClient: { __name: "createClient" },
  updateClient: { __name: "updateClient" },
  archiveClient: { __name: "archiveClient" },
  restoreClient: { __name: "restoreClient" },
  listProperties: { __name: "listProperties" },
  listPropertyRecords: { __name: "listPropertyRecords" },
  listCrmFilterOptions: { __name: "listCrmFilterOptions" },
  getProperty: { __name: "getProperty" },
  createProperty: { __name: "createProperty" },
  updateProperty: { __name: "updateProperty" },
  archiveProperty: { __name: "archiveProperty" },
  restoreProperty: { __name: "restoreProperty" },
  auditProjectDeletion: { __name: "auditProjectDeletion" },
  auditClientDeletion: { __name: "auditClientDeletion" },
  deleteProjectPermanently: { __name: "deleteProjectPermanently" },
  deleteClientPermanently: { __name: "deleteClientPermanently" },
}));

vi.mock("@/features/crm/components/ProjectFormDialog", () => ({ ProjectFormDialog: () => null }));
vi.mock("@/features/crm/components/ProjectThumbnail", () => ({ ProjectThumbnail: () => null }));

function authAdapter(): AuthProviderAdapter {
  return {
    getSession: vi.fn().mockResolvedValue({
      user: {
        id: "u-1",
        email: "michael@example.com",
        firstName: "Michael",
        lastName: "Cadorette",
        preferredLocale: "en-US",
      },
      session: { userId: "u-1", expiresAt: null },
    }),
    signInWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
    resendConfirmation: vi.fn(),
    updateEmail: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn(),
    signOut: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  };
}

describe("authenticated workspace smoke", () => {
  beforeEach(async () => {
    serverCalls.length = 0;
    getSessionMock.mockReset();
    await i18n.changeLanguage("en-US");
  });

  it("attaches the Supabase bearer token to server functions via attachConfiguredAuth", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-abc" } } });
    hoisted.clientMiddlewares.length = 0;
    await import("@/lib/supabase/auth-attacher");
    const clientFn = hoisted.clientMiddlewares.at(-1);
    expect(clientFn, "attachConfiguredAuth must register a client middleware").toBeTruthy();
    let received: unknown;
    await clientFn!({
      next: (arg: unknown) => {
        received = arg;
        return arg;
      },
    });
    expect(received).toEqual({ headers: { Authorization: "Bearer token-abc" } });
  });

  it("resolves the organization, loads projects and shows Garage Conversion", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider adapter={authAdapter()}>
          <WorkspaceProvider>
            <ProjectsListPage />
          </WorkspaceProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(serverCalls).toContain("getMyOrganization"));
    await waitFor(() => expect(screen.getByText("Garage Conversion")).toBeInTheDocument());
    expect(serverCalls).toContain("listProjects");

    // No false workspace failure state.
    expect(document.body.textContent).not.toMatch(/couldn.t load your workspace/i);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/No projects yet/i)).toBeNull();
  });
});
