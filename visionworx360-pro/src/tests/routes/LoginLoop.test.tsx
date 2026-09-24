import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { AuthLoadingPage } from "@/features/auth/pages/AuthLoadingPage";
import type { AuthProviderAdapter } from "@/features/auth/services/supabaseAuthAdapter";

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

const SB_KEY = "sb-test-auth-token";

function Grab({ onCtx }: { onCtx: (c: ReturnType<typeof useAuth>) => void }) {
  const ctx = useAuth();
  onCtx(ctx);
  return <span data-testid="status">{ctx.status}</span>;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("post-login loop regressions", () => {
  it("cancels the session-restore deadline once login begins and keeps tokens", async () => {
    vi.useFakeTimers();
    const adapter = makeAdapter();
    let ctx!: ReturnType<typeof useAuth>;
    render(
      <AuthProvider adapter={adapter}>
        <Grab onCtx={(c) => (ctx = c)} />
      </AuthProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    window.localStorage.setItem(SB_KEY, "fresh-session");
    await act(async () => {
      await ctx.signInWithPassword("a@b.c", "pw");
    });
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
    expect(window.sessionStorage.getItem("visionworx.auth-restore-deadline")).toBeNull();

    // The stale-session recovery must never fire after a successful login.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
    expect(window.localStorage.getItem(SB_KEY)).toBe("fresh-session");
  });

  it("does not reuse a stale restore deadline from a previous mount", async () => {
    vi.useFakeTimers();
    window.sessionStorage.setItem("visionworx.auth-restore-deadline", String(Date.now() - 60_000));
    window.localStorage.setItem(SB_KEY, "valid-session");
    let resolve!: (v: { user: null; session: null }) => void;
    const adapter = makeAdapter({
      getSession: vi.fn(
        () => new Promise<{ user: null; session: null }>((r) => (resolve = r)),
      ),
    });

    render(
      <AuthProvider adapter={adapter}>
        <Grab onCtx={() => {}} />
      </AuthProvider>,
    );
    // A past deadline previously fired instantly and wiped a valid session.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByTestId("status").textContent).toBe("initializing");
    expect(window.localStorage.getItem(SB_KEY)).toBe("valid-session");
    await act(async () => {
      resolve({ user: null, session: null });
    });
  });

  it("keeps tokens when session restoration fails with a transient error", async () => {
    window.localStorage.setItem(SB_KEY, "valid-session");
    const adapter = makeAdapter({
      getSession: vi.fn().mockRejectedValue(new Error("Network request failed")),
    });
    render(
      <AuthProvider adapter={adapter}>
        <Grab onCtx={() => {}} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(window.localStorage.getItem(SB_KEY)).toBe("valid-session");
  });

  it("sign-out still clears authenticated state", async () => {
    const adapter = makeAdapter();
    let ctx!: ReturnType<typeof useAuth>;
    render(
      <AuthProvider adapter={adapter}>
        <Grab onCtx={(c) => (ctx = c)} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    await act(async () => {
      await ctx.signInWithPassword("a@b.c", "pw");
    });
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
    await act(async () => {
      await ctx.signOut();
    });
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
  });
});

describe("AuthLoadingPage recovery safety", () => {
  it("never clears tokens or navigates automatically while a screen is pending", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(SB_KEY, "fresh-session");
    const replace = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, pathname: "/app/dashboard", href: "http://localhost/app/dashboard", replace },
    });

    render(<AuthLoadingPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SB_KEY)).toBe("fresh-session");

    Object.defineProperty(window, "location", { configurable: true, value: original });
  });
});
