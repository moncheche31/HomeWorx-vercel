import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { AuthProviderAdapter } from "@/features/auth/services/supabaseAuthAdapter";

function TestConsumer() {
  const { status, user, error } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.email ?? "none"}</span>
      <span data-testid="err">{error?.category ?? "no-error"}</span>
    </div>
  );
}

function makeAdapter(overrides: Partial<AuthProviderAdapter> = {}): AuthProviderAdapter {
  return {
    getSession: vi.fn().mockResolvedValue({ user: null, session: null }),
    signInWithPassword: vi.fn().mockResolvedValue({
      user: { id: "u1", email: "a@b.c" },
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

describe("AuthProvider", () => {
  it("initializes then reports unauthenticated when no session", async () => {
    const adapter = makeAdapter();
    render(
      <AuthProvider adapter={adapter}>
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("restores an existing session", async () => {
    const adapter = makeAdapter({
      getSession: vi.fn().mockResolvedValue({
        user: { id: "u1", email: "a@b.c" },
        session: { userId: "u1", expiresAt: null },
      }),
    });
    render(
      <AuthProvider adapter={adapter}>
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(screen.getByTestId("user").textContent).toBe("a@b.c");
  });

  it("cleans up the auth listener on unmount", async () => {
    const unsub = vi.fn();
    const adapter = makeAdapter({ subscribe: vi.fn().mockReturnValue(unsub) });
    const { unmount } = render(
      <AuthProvider adapter={adapter}>
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(adapter.subscribe).toHaveBeenCalled());
    unmount();
    expect(unsub).toHaveBeenCalled();
  });

  it("has a hard upper bound when session restoration never settles", async () => {
    vi.useFakeTimers();
    const adapter = makeAdapter({
      getSession: vi.fn(
        () =>
          new Promise<{ user: null; session: null }>(() => {
            // Deliberately never settles.
          }),
      ),
    });
    render(
      <AuthProvider adapter={adapter}>
        <TestConsumer />
      </AuthProvider>,
    );
    expect(screen.getByTestId("status").textContent).toBe("initializing");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_001);
    });
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    vi.useRealTimers();
  });

  it("maps sign-in failures to a safe category (never raw provider text)", async () => {
    const adapter = makeAdapter({
      signInWithPassword: vi.fn().mockRejectedValue({ message: "Invalid login credentials" }),
    });
    let ctx: ReturnType<typeof useAuth> | null = null;
    function Grab() {
      ctx = useAuth();
      return null;
    }
    render(
      <AuthProvider adapter={adapter}>
        <Grab />
      </AuthProvider>,
    );
    await waitFor(() => expect(ctx?.status).toBe("unauthenticated"));
    await act(async () => {
      const err = await ctx!.signInWithPassword("a@b.c", "bad");
      expect(err?.category).toBe("invalid_credentials");
      expect(JSON.stringify(err)).not.toContain("Invalid login credentials");
    });
  });
});
