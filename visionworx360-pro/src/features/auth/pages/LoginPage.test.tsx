import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import type { AuthProviderAdapter } from "@/features/auth/services/supabaseAuthAdapter";
import { LoginPage } from "@/features/auth/pages/LoginPage";

const navigate = vi.fn();
const searchRef: { current: Record<string, unknown> } = { current: {} };

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: ReactNode; to?: string }) => (
    <a href={rest.to ?? "#"}>{children}</a>
  ),
  useNavigate: () => navigate,
  useSearch: () => searchRef.current,
  useRouterState: () => ({ location: { pathname: "/login", searchStr: "" } }),
}));

function makeAdapter(overrides: Partial<AuthProviderAdapter> = {}): AuthProviderAdapter {
  return {
    getSession: vi.fn().mockResolvedValue({ user: null, session: null }),
    signInWithPassword: vi.fn().mockResolvedValue({
      user: { id: "u1", email: "a@b.co", firstName: null, lastName: null, preferredLocale: null },
      session: { userId: "u1", expiresAt: null },
    }),
    signUpWithPassword: vi.fn().mockResolvedValue({ requiresEmailConfirmation: false }),
    resendConfirmation: vi.fn().mockResolvedValue(undefined),
    updateEmail: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

function renderPage(adapter = makeAdapter()) {
  return {
    adapter,
    ...render(
      <AuthProvider adapter={adapter}>
        <LoginPage />
      </AuthProvider>,
    ),
  };
}

beforeEach(() => {
  navigate.mockReset();
  searchRef.current = {};
});

describe("LoginPage", () => {
  it("renders the sign-in form with accessible labels", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("form", { name: /sign-in form/i })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows validation errors when submitting empty fields", async () => {
    const user = userEvent.setup();
    const { adapter } = renderPage();
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    // Two required-field errors show up
    const requiredEls = await screen.findAllByText(/this field is required/i);
    expect(requiredEls.length).toBeGreaterThanOrEqual(2);
    expect(adapter.signInWithPassword).not.toHaveBeenCalled();
  });

  it("validates invalid email format", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/^password/i), "anything");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
  });

  it("submits successfully and redirects to /app by default", async () => {
    const user = userEvent.setup();
    const { adapter } = renderPage();
    await user.type(screen.getByLabelText(/email/i), "a@b.co");
    await user.type(screen.getByLabelText(/^password/i), "some-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(adapter.signInWithPassword).toHaveBeenCalledTimes(1));
    expect(adapter.signInWithPassword).toHaveBeenCalledWith("a@b.co", "some-password");
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/app", replace: true }),
    );
  });

  it("uses the sanitized intended redirect from search params", async () => {
    searchRef.current = { redirect: "/app/dashboard" };
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/email/i), "a@b.co");
    await user.type(screen.getByLabelText(/^password/i), "some-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/app/dashboard", replace: true }),
    );
  });

  it("ignores unsafe redirects (e.g. absolute URLs) and falls back to /app", async () => {
    searchRef.current = { redirect: "https://evil.example.com" };
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/email/i), "a@b.co");
    await user.type(screen.getByLabelText(/^password/i), "some-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/app", replace: true }),
    );
  });

  it("shows a safe form-level error on invalid credentials (no raw provider text)", async () => {
    const user = userEvent.setup();
    const adapter = makeAdapter({
      signInWithPassword: vi.fn().mockRejectedValue({ message: "Invalid login credentials" }),
    });
    renderPage(adapter);
    await user.type(screen.getByLabelText(/email/i), "a@b.co");
    await user.type(screen.getByLabelText(/^password/i), "some-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    const alert = await screen.findByTestId("form-error");
    await waitFor(() => expect(alert).toHaveTextContent(/email or password isn't correct/i));
    expect(alert.textContent).not.toMatch(/Invalid login credentials/);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows the email-not-confirmed message when Supabase reports it", async () => {
    const user = userEvent.setup();
    const adapter = makeAdapter({
      signInWithPassword: vi.fn().mockRejectedValue({ message: "Email not confirmed" }),
    });
    renderPage(adapter);
    await user.type(screen.getByLabelText(/email/i), "a@b.co");
    await user.type(screen.getByLabelText(/^password/i), "some-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(
      await screen.findByText(/confirm your email address before signing in/i),
    ).toBeInTheDocument();
  });

  it("disables the button while submitting and prevents double submission", async () => {
    const user = userEvent.setup();
    let resolveSignIn: () => void = () => {};
    const adapter = makeAdapter({
      signInWithPassword: vi.fn().mockImplementation(
        () =>
          new Promise<{ user: { id: string; email: string; firstName: null; lastName: null; preferredLocale: null }; session: { userId: string; expiresAt: null } }>((r) => {
            resolveSignIn = () => r({
              user: { id: "u1", email: "a@b.co", firstName: null, lastName: null, preferredLocale: null },
              session: { userId: "u1", expiresAt: null },
            });
          }),
      ),
    });
    renderPage(adapter);
    await user.type(screen.getByLabelText(/email/i), "a@b.co");
    await user.type(screen.getByLabelText(/^password/i), "some-password");
    const button = screen.getByRole("button", { name: /sign in/i });
    await user.click(button);
    // Second click while in-flight
    await user.click(button);
    expect(adapter.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await act(async () => {
      resolveSignIn();
    });
  });

  it("toggles password visibility and defaults to hidden", async () => {
    const user = userEvent.setup();
    renderPage();
    const pw = screen.getByLabelText(/^password/i) as HTMLInputElement;
    expect(pw.type).toBe("password");
    const toggle = screen.getByRole("button", { name: /show password/i });
    await user.click(toggle);
    expect(pw.type).toBe("text");
    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(pw.type).toBe("password");
  });

  it("submits on Enter key from the password field", async () => {
    const user = userEvent.setup();
    const { adapter } = renderPage();
    await user.type(screen.getByLabelText(/email/i), "a@b.co");
    const pw = screen.getByLabelText(/^password/i);
    await user.type(pw, "some-password{enter}");
    await waitFor(() => expect(adapter.signInWithPassword).toHaveBeenCalledTimes(1));
  });
});
