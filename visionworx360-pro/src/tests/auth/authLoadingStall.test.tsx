import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import {
  AuthLoadingPage,
  __resetAuthLoadingStallDeadline,
} from "@/features/auth/pages/AuthLoadingPage";

/**
 * Regression: a hard refresh on a nested authenticated route walks through
 * several bootstrap gates, each rendering its own AuthLoadingPage. With a
 * per-instance stall timer, every handoff restarted the budget and the screen
 * could say "checking your session" indefinitely. The budget is cumulative.
 */
describe("auth loading stall budget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetAuthLoadingStallDeadline();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    __resetAuthLoadingStallDeadline();
  });

  const stalledVisible = () => screen.queryAllByRole("button").length > 0;

  it("surfaces recovery once the bootstrap budget elapses", async () => {
    render(<AuthLoadingPage />);
    expect(stalledVisible()).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
    expect(stalledVisible()).toBe(true);
  });

  it("does not restart the budget when one gate hands off to the next", async () => {
    const first = render(<AuthLoadingPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    first.unmount();
    // Immediate handoff to the next gate's loading screen.
    render(<AuthLoadingPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });
    expect(stalledVisible()).toBe(true);
  });

  it("resets the budget after real content has rendered", async () => {
    const first = render(<AuthLoadingPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    first.unmount();
    // App content on screen well past the handoff grace period.
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    render(<AuthLoadingPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(stalledVisible()).toBe(false);
  });
});

/**
 * Cold refresh regression: the loading screen is server-rendered, so seconds
 * can pass before any client timer exists. The recovery budget must be
 * wall-clock accurate (navigation start), not hydration-relative.
 */
describe("pre-hydration elapsed time counts toward the stall budget", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    __resetAuthLoadingStallDeadline();
  });

  const stalledVisible = () => screen.queryAllByRole("button").length > 0;

  it("shows recovery immediately when hydration alone exceeded the budget", () => {
    __resetAuthLoadingStallDeadline(12_000);
    render(<AuthLoadingPage />);
    expect(stalledVisible()).toBe(true);
  });

  it("only waits out the remaining budget after a slow hydration", async () => {
    __resetAuthLoadingStallDeadline(6_000);
    render(<AuthLoadingPage />);
    expect(stalledVisible()).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_100); });
    expect(stalledVisible()).toBe(true);
  });

  it("does not shorten the budget on a fast bootstrap", async () => {
    __resetAuthLoadingStallDeadline(200);
    render(<AuthLoadingPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(stalledVisible()).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(stalledVisible()).toBe(true);
  });

  it("gives a later in-app loading screen the full budget", async () => {
    __resetAuthLoadingStallDeadline(8_000);
    const boot = render(<AuthLoadingPage />);
    boot.unmount();
    // Real content on screen well past the handoff grace period.
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    render(<AuthLoadingPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(stalledVisible()).toBe(false);
  });
});

describe("gate-specific loading copy", () => {
  beforeEach(() => __resetAuthLoadingStallDeadline());
  afterEach(() => { cleanup(); __resetAuthLoadingStallDeadline(); });

  it("defaults to the session stage", () => {
    render(<AuthLoadingPage />);
    expect(screen.getByTestId("auth-loading-screen").dataset.stage).toBe("session");
  });

  it("labels the pre-config startup gate distinctly", () => {
    render(<AuthLoadingPage stage="starting" />);
    const screenEl = screen.getByTestId("auth-loading-screen");
    expect(screenEl.dataset.stage).toBe("starting");
    expect(screenEl.textContent).not.toContain("Checking your session");
  });

  it("labels the post-auth redirect gate distinctly", () => {
    render(<AuthLoadingPage stage="redirecting" />);
    const screenEl = screen.getByTestId("auth-loading-screen");
    expect(screenEl.dataset.stage).toBe("redirecting");
    expect(screenEl.textContent).not.toContain("Checking your session");
  });
});
