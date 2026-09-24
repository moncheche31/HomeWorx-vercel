import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "@/routes/ProtectedRoute";

const navigate = vi.fn();
let status = "unauthenticated";
let pathname = "/app/dashboard";

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: () => ({ status }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname, searchStr: "" } }),
}));

vi.mock("@/features/auth/pages/AuthLoadingPage", () => ({
  AuthLoadingPage: () => <div>Loading</div>,
}));

describe("ProtectedRoute", () => {
  it("redirects an unauthenticated protected route to login", async () => {
    status = "unauthenticated";
    pathname = "/app/dashboard";
    navigate.mockReset();
    render(<ProtectedRoute>Dashboard</ProtectedRoute>);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/login",
        search: { redirect: "/app/dashboard" },
        replace: true,
      }),
    );
  });

  it("renders protected content after session hydration succeeds", () => {
    status = "authenticated";
    pathname = "/app/dashboard";
    navigate.mockReset();
    const { getByText } = render(<ProtectedRoute>Dashboard</ProtectedRoute>);
    expect(getByText("Dashboard")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
