import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProjectsListPage } from "./ProjectsListPage";
import enWorkspace from "@/i18n/locales/en-US/workspace.json";
import esWorkspace from "@/i18n/locales/es-US/workspace.json";

const authState = { status: "authenticated" as string, signOut: vi.fn() };
const workspaceState = {
  organization: { id: "org-1" } as { id: string } | null,
  organizationStatus: "ready" as string,
  refreshOrganization: vi.fn(),
};
const projectsQuery = {
  data: undefined as unknown,
  isPending: false,
  isLoading: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
};

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => (
    <a href={to ?? "#"}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  // List controls read their state from the route search params.
  useSearch: () => ({}),
  useRouterState: () => ({ location: { pathname: "/app/projects", searchStr: "" } }),
}));

vi.mock("@/features/auth/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/features/workspace/providers/WorkspaceProvider", () => ({
  useWorkspace: () => workspaceState,
  useOptionalWorkspace: () => ({ ...workspaceState, profile: { role: "owner" } }),
}));
vi.mock("../hooks/useCrm", () => ({
  useProjectsQuery: () => projectsQuery,
  useCrmFilterOptionsQuery: () => ({ data: { clientCities: [], propertyCities: [] } }),
  useClientsQuery: () => ({ data: { items: [], total: 0 } }),
  useActiveOrgId: () => workspaceState.organization?.id ?? null,
  useClientMutations: () => ({
    orgId: workspaceState.organization?.id ?? null,
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    archive: { mutateAsync: vi.fn(), isPending: false },
    restore: { mutateAsync: vi.fn(), isPending: false },
    deletePermanently: { mutateAsync: vi.fn(), isPending: false },
  }),
  useProjectMutations: () => ({
    orgId: workspaceState.organization?.id ?? null,
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    archive: { mutateAsync: vi.fn(), isPending: false },
    restore: { mutateAsync: vi.fn(), isPending: false },
    deletePermanently: { mutateAsync: vi.fn(), isPending: false },
  }),
  useProjectDeletionAudit: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useClientDeletionAudit: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("../components/ProjectFormDialog", () => ({ ProjectFormDialog: () => null }));
vi.mock("../components/ClientFormDialog", () => ({ ClientFormDialog: () => null }));
vi.mock("../components/PropertyFormDialog", () => ({ PropertyFormDialog: () => null }));
vi.mock("../components/ProjectThumbnail", () => ({ ProjectThumbnail: () => null }));

function reset() {
  authState.status = "authenticated";
  workspaceState.organization = { id: "org-1" };
  workspaceState.organizationStatus = "ready";
  projectsQuery.data = { items: [], total: 0 };
  projectsQuery.isPending = false;
  projectsQuery.isLoading = false;
  projectsQuery.isError = false;
  projectsQuery.isSuccess = true;
}

const EMPTY = /No projects yet|Sin proyectos|empty\.projects\.title/i;

describe("ProjectsListPage state handling", () => {
  beforeEach(reset);

  it("does not show the empty state while auth is initializing", () => {
    authState.status = "initializing";
    render(<ProjectsListPage />);
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("does not show the empty state when unauthenticated (redirect is handled by the guard)", () => {
    authState.status = "unauthenticated";
    render(<ProjectsListPage />);
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("does not show the empty state while the organization is loading", () => {
    workspaceState.organizationStatus = "loading";
    workspaceState.organization = null;
    render(<ProjectsListPage />);
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("shows a retry + sign out error when the organization fails to resolve", () => {
    workspaceState.organizationStatus = "error";
    workspaceState.organization = null;
    render(<ProjectsListPage />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getAllByRole("button").length).toBeGreaterThan(1);
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("does not show the empty state while the projects query is loading", () => {
    projectsQuery.isPending = true;
    projectsQuery.isLoading = true;
    projectsQuery.isSuccess = false;
    projectsQuery.data = undefined;
    render(<ProjectsListPage />);
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("shows an error with retry when the projects query fails", () => {
    projectsQuery.isError = true;
    projectsQuery.isSuccess = false;
    projectsQuery.data = undefined;
    render(<ProjectsListPage />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("shows the true empty state after a successful zero-result query", () => {
    render(<ProjectsListPage />);
    expect(screen.getByText(/empty\.projects\.title|No projects yet/i)).toBeTruthy();
  });

  it("renders project cards when the query returns rows", () => {
    projectsQuery.data = {
      items: [
        {
          id: "p-1",
          name: "Garage Conversion",
          status: "construction",
          priority: "normal",
          budget: 1000,
          clientName: "Client",
          propertyLabel: "Property",
          updatedAt: new Date().toISOString(),
          coverStoragePath: null,
          coverAlt: null,
        },
      ],
      total: 1,
    };
    render(<ProjectsListPage />);
    expect(screen.getByText("Garage Conversion")).toBeTruthy();
  });
});

describe("workspaceState locale parity", () => {
  it("has matching EN/ES keys", () => {
    const en = Object.keys((enWorkspace as Record<string, object>).workspaceState).sort();
    const es = Object.keys((esWorkspace as Record<string, object>).workspaceState).sort();
    expect(es).toEqual(en);
    expect(en.length).toBeGreaterThan(0);
  });
});
