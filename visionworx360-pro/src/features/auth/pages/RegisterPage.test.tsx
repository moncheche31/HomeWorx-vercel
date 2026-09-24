import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import type { AuthProviderAdapter } from "@/features/auth/services/supabaseAuthAdapter";
import { RegisterPage } from "@/features/auth/pages/RegisterPage";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: ReactNode; to?: string }) => (
    <a href={rest.to ?? "#"}>{children}</a>
  ),
  useNavigate: () => navigate,
  useSearch: () => ({}),
  useRouterState: () => ({ location: { pathname: "/register", searchStr: "" } }),
}));

function makeAdapter(overrides: Partial<AuthProviderAdapter> = {}): AuthProviderAdapter {
  return {
    getSession: vi.fn().mockResolvedValue({ user: null, session: null }),
    signInWithPassword: vi.fn().mockResolvedValue(undefined),
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
        <RegisterPage />
      </AuthProvider>,
    ),
  };
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/first name|nombre/i), "María");
  await user.type(screen.getByLabelText(/last name|apellido/i), "Núñez");
  await user.type(screen.getByLabelText(/email/i), "maria@example.com");
  const [pw, confirm] = screen.getAllByLabelText(/password|contraseña|confirm/i);
  await user.type(pw, "StrongPass1!");
  await user.type(confirm, "StrongPass1!");
  await user.click(screen.getByRole("checkbox"));
}

beforeEach(() => {
  navigate.mockReset();
});

describe("RegisterPage", () => {
  it("shows required-field errors when submitting empty", async () => {
    const user = userEvent.setup();
    const { adapter } = renderPage();
    await user.click(screen.getByRole("button", { name: /create account/i }));
    const requiredEls = await screen.findAllByText(/this field is required/i);
    // firstName, lastName, email, password, confirmPassword, acceptTerms
    expect(requiredEls.length).toBeGreaterThanOrEqual(5);
    expect(adapter.signUpWithPassword).not.toHaveBeenCalled();
  });

  it("accepts accented Spanish names", async () => {
    const user = userEvent.setup();
    const { adapter } = renderPage();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(adapter.signUpWithPassword).toHaveBeenCalledTimes(1));
    const args = (adapter.signUpWithPassword as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toBe("maria@example.com");
    expect(args[3]).toEqual(
      expect.objectContaining({ first_name: "María", last_name: "Núñez" }),
    );
  });

  it("rejects invalid email format", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/first name|nombre/i), "Jane");
    await user.type(screen.getByLabelText(/last name|apellido/i), "Doe");
    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    const [pw, confirm] = screen.getAllByLabelText(/password|contraseña|confirm/i);
    await user.type(pw, "StrongPass1!");
    await user.type(confirm, "StrongPass1!");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
  });

  it("rejects weak passwords", async () => {
    const user = userEvent.setup();
    const { adapter } = renderPage();
    await user.type(screen.getByLabelText(/first name|nombre/i), "Jane");
    await user.type(screen.getByLabelText(/last name|apellido/i), "Doe");
    await user.type(screen.getByLabelText(/email/i), "j@e.co");
    const [pw, confirm] = screen.getAllByLabelText(/password|contraseña|confirm/i);
    await user.type(pw, "weakpass");
    await user.type(confirm, "weakpass");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(
      await screen.findByText(/doesn't meet all the requirements/i),
    ).toBeInTheDocument();
    expect(adapter.signUpWithPassword).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirm password", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/first name|nombre/i), "Jane");
    await user.type(screen.getByLabelText(/last name|apellido/i), "Doe");
    await user.type(screen.getByLabelText(/email/i), "j@e.co");
    const [pw, confirm] = screen.getAllByLabelText(/password|contraseña|confirm/i);
    await user.type(pw, "StrongPass1!");
    await user.type(confirm, "Different1!");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it("requires the terms checkbox", async () => {
    const user = userEvent.setup();
    const { adapter } = renderPage();
    await user.type(screen.getByLabelText(/first name|nombre/i), "Jane");
    await user.type(screen.getByLabelText(/last name|apellido/i), "Doe");
    await user.type(screen.getByLabelText(/email/i), "j@e.co");
    const [pw, confirm] = screen.getAllByLabelText(/password|contraseña|confirm/i);
    await user.type(pw, "StrongPass1!");
    await user.type(confirm, "StrongPass1!");
    // don't click checkbox
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(adapter.signUpWithPassword).not.toHaveBeenCalled());
  });

  it("redirects to /app when Supabase signs the user in immediately", async () => {
    const user = userEvent.setup();
    const adapter = makeAdapter({
      signUpWithPassword: vi
        .fn()
        .mockResolvedValue({ requiresEmailConfirmation: false }),
    });
    renderPage(adapter);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/app", replace: true }),
    );
  });

  it("shows the email-confirmation state when Supabase requires confirmation", async () => {
    const user = userEvent.setup();
    const adapter = makeAdapter({
      signUpWithPassword: vi
        .fn()
        .mockResolvedValue({ requiresEmailConfirmation: true }),
    });
    renderPage(adapter);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));
    const state = await screen.findByTestId("email-confirmation-state");
    expect(within(state).getByText(/check your email/i)).toBeInTheDocument();
    // Email is masked, not shown in full
    expect(within(state).queryByText("maria@example.com")).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows the safe user-already-exists error", async () => {
    const user = userEvent.setup();
    const adapter = makeAdapter({
      signUpWithPassword: vi
        .fn()
        .mockRejectedValue({ message: "User already registered" }),
    });
    renderPage(adapter);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(
      await screen.findByText(/account with that email already exists/i),
    ).toBeInTheDocument();
  });

  it("disables the submit button while creating the account (no double-submit)", async () => {
    const user = userEvent.setup();
    let resolveSignUp: (v: { requiresEmailConfirmation: boolean }) => void = () => {};
    const adapter = makeAdapter({
      signUpWithPassword: vi.fn().mockImplementation(
        () =>
          new Promise((r) => {
            resolveSignUp = r;
          }),
      ),
    });
    renderPage(adapter);
    await fillValidForm(user);
    const button = screen.getByRole("button", { name: /create account/i });
    await user.click(button);
    await user.click(button);
    expect(adapter.signUpWithPassword).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => {
      resolveSignUp({ requiresEmailConfirmation: true });
    });
  });

  it("updates the PasswordRequirements checklist as the user types", async () => {
    const user = userEvent.setup();
    renderPage();
    const list = screen.getByRole("list", { name: /password requirements/i });
    expect(within(list).getAllByText(/requirement not met/i).length).toBeGreaterThan(0);
    const [pw] = screen.getAllByLabelText(/password|contraseña|confirm/i);
    await user.type(pw, "StrongPass1!");
    await waitFor(() => {
      expect(within(list).queryAllByText(/requirement not met/i).length).toBe(0);
    });
  });
});
