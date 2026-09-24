import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { RootRedirect } from "@/routes/RootRedirect";

const navigate = vi.fn();
let status = "initializing";

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: () => ({ status }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@/features/auth/pages/AuthLoadingPage", () => ({
  AuthLoadingPage: () => <div data-testid="loading">Checking your session</div>,
}));

beforeEach(() => {
  navigate.mockReset();
  window.localStorage.clear();
});

describe("RootRedirect (cold start at /)", () => {
  it("redirects an unauthenticated cold open to /login without interaction", async () => {
    status = "unauthenticated";
    render(<RootRedirect />);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/login", replace: true }),
    );
  });

  it("redirects an errored session cold open to /login", async () => {
    status = "error";
    render(<RootRedirect />);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/login", replace: true }),
    );
  });

  it("redirects an authenticated cold open to /app/dashboard", async () => {
    status = "authenticated";
    render(<RootRedirect />);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/app/dashboard", replace: true }),
    );
  });

  it("restores the saved app route when authenticated", async () => {
    status = "authenticated";
    window.localStorage.setItem("vw360:last-app-route", "/app/projects");
    render(<RootRedirect />);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/app/projects", replace: true }),
    );
  });

  it("shows a neutral loading state while the session is still resolving", () => {
    status = "initializing";
    render(<RootRedirect />);
    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("never renders a permanent static landing page at /", async () => {
    status = "unauthenticated";
    const { rerender } = render(<RootRedirect />);
    rerender(<RootRedirect />);
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });
});
