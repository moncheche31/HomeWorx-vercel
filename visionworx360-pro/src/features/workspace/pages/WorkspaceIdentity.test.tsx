import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import type { AuthProviderAdapter } from "@/features/auth/services/supabaseAuthAdapter";
import { WorkspaceProvider } from "../providers/WorkspaceProvider";
import { DashboardPage } from "./DashboardPage";
import { ProfilePage } from "./ProfilePage";
import { OrganizationPage } from "./OrganizationPage";
import { UserMenu } from "../components/UserMenu";
import i18n from "i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => (
    <a href={to ?? "#"}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: () => ({ location: { pathname: "/app/dashboard" } }),
}));

vi.mock("@tanstack/react-start", () => {
  const chain = {
    middleware: () => chain,
    inputValidator: () => chain,
    handler: () => async () => null,
  };
  return {
    useServerFn: () => async () => ({
      organization: null,
      trace: {
        profileLookupStatus: "found",
        organizationIdPresent: false,
        membershipStatus: "not-applicable",
        organizationLookupStatus: "not-applicable",
      },
    }),
    createServerFn: () => chain,
    createMiddleware: () => ({
      server: () => ({ client: () => ({}) }),
      client: () => ({ server: () => ({}) }),
    }),
  };
});

vi.mock("../services/organization.functions", () => ({
  getMyOrganization: {},
  saveOrganization: {},
}));

function michaelAdapter(): AuthProviderAdapter {
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

function renderWorkspace(node: ReactNode, adapter = michaelAdapter()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider adapter={adapter}>
        <WorkspaceProvider>{node}</WorkspaceProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Workspace identity (Prompt 002B.1)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });
  it("dashboard greets the authenticated user by name, not Alex Rivera", async () => {
    await i18n.changeLanguage("en-US");
    renderWorkspace(<DashboardPage />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Michael/),
    );
    expect(document.body.textContent).not.toMatch(/Alex Rivera/i);
    expect(document.body.textContent).not.toMatch(/Rivera Renovations/i);
  });

  it("dashboard shows localized empty states — no fake projects, estimates, or activity", async () => {
    renderWorkspace(<DashboardPage />);
    // With no organization resolved yet, Recent Projects must show the workspace
    // setup state — never a misleading "No projects yet".
    await waitFor(() =>
      expect(screen.getAllByText(/Finish setting up your workspace/i).length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(/No projects yet/i)).toBeNull();
    expect(screen.getAllByText(/No estimates yet/i).length).toBeGreaterThan(0);
    // Activity feed is no longer rendered on the dashboard.
    expect(screen.queryByText(/Nothing here yet/i)).toBeNull();
    // No fabricated dollar amounts or client names should be present.
    expect(document.body.textContent).not.toMatch(/Whitmore|Ainsley|Delgado/);
    expect(document.body.textContent).not.toMatch(/EST-104\d/);
    // No fabricated Pro trial renewal
    expect(document.body.textContent).not.toMatch(/Pro trial|Renews/i);
    // Billing/subscription placeholders are no longer surfaced on the dashboard.
    expect(document.body.textContent).not.toMatch(/In development/i);

  });

  it("dashboard shows the empty-organization CTA when no company exists", async () => {
    renderWorkspace(<DashboardPage />);
    await waitFor(() =>
      expect(screen.getAllByText(/No company set up/i).length).toBeGreaterThan(0),
    );
    expect(screen.getByText(/Complete company profile/i)).toBeInTheDocument();
  });

  it("user avatar shows real initials MC (never AR)", async () => {
    renderWorkspace(<UserMenu />);
    await waitFor(() => {
      const initials = screen.getByTestId("user-avatar-initials");
      expect(initials.textContent).toBe("MC");
      expect(initials.textContent).not.toBe("AR");
    });
  });

  it("profile page renders authenticated user metadata", async () => {
    renderWorkspace(<ProfilePage />);
    await waitFor(() => expect(screen.getAllByDisplayValue("Michael").length).toBeGreaterThan(0));
    expect(screen.getByDisplayValue("Cadorette")).toBeInTheDocument();
    expect(screen.getByDisplayValue("michael@example.com")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Alex|Rivera/i);
  });

  it("organization page renders the localized empty state", async () => {
    renderWorkspace(<OrganizationPage />);
    await waitFor(() => expect(screen.getByText(/No company set up/i)).toBeInTheDocument());
    expect(document.body.textContent).not.toMatch(/Rivera Renovations/i);
  });

  it("renders the empty state in Spanish", async () => {
    await i18n.changeLanguage("es-US");
    renderWorkspace(<OrganizationPage />);
    await waitFor(() =>
      expect(screen.getByText(/No hay empresa configurada/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Completa el perfil de la empresa/i)).toBeInTheDocument();
    await i18n.changeLanguage("en-US");
  });
});
