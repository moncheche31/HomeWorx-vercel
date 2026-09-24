import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { clearLocalSupabaseSession } from "@/lib/auth/localSession";

/** After this we surface manual recovery. We never sign the user out automatically. */
const STALL_TIMEOUT_MS = 8_000;

/**
 * Grace period during which a handoff between two loading gates counts as ONE
 * continuous wait. Bootstrap walks through several independent gates (config,
 * session restore, protected-route transition, workspace + product access) and
 * each one renders its own instance of this screen. With a per-instance timer,
 * every handoff restarted the 8s budget, so a device that kept limping from one
 * slow gate to the next sat on "checking your session" for minutes and the
 * recovery buttons never appeared. The deadline therefore lives outside the
 * component and only resets once real content has been on screen for longer
 * than this grace period.
 */
const HANDOFF_GRACE_MS = 750;

let stallDeadline: number | null = null;
let deadlineReset: ReturnType<typeof setTimeout> | null = null;

/**
 * Milliseconds already spent in this document BEFORE the client bundle could
 * run. The loading screen is server-rendered, so on a cold refresh the user can
 * stare at "Checking your session…" for many seconds while the bundle is still
 * downloading/hydrating — a window in which no client timer exists yet.
 * Counting it makes the recovery budget wall-clock accurate instead of
 * hydration-relative. Auth semantics are untouched: this only controls when the
 * manual retry / sign-out affordances appear.
 *
 * It is captured once, at module evaluation (i.e. hydration), and consumed only
 * by the FIRST deadline of the document. A loading screen that appears later —
 * an in-app navigation minutes after boot — gets the full budget, because none
 * of that earlier time was spent waiting on this screen.
 */
function readBootstrapElapsedMs(): number {
  if (typeof performance === "undefined") return 0;
  try {
    const nav = performance.getEntriesByType?.("navigation")?.[0] as
      | { startTime?: number }
      | undefined;
    const start = typeof nav?.startTime === "number" ? nav.startTime : 0;
    const elapsed = performance.now() - start;
    // Guard against clock weirdness and bfcache-restored documents reporting an
    // enormous elapsed time, which would flash recovery instantly.
    if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
    return Math.min(elapsed, STALL_TIMEOUT_MS);
  } catch {
    return 0;
  }
}

let bootstrapElapsedMs = readBootstrapElapsedMs();
let bootstrapElapsedConsumed = false;

function claimStallDeadline(): number {
  if (deadlineReset) {
    clearTimeout(deadlineReset);
    deadlineReset = null;
  }
  if (stallDeadline == null) {
    const alreadyWaited = bootstrapElapsedConsumed ? 0 : bootstrapElapsedMs;
    bootstrapElapsedConsumed = true;
    stallDeadline = Date.now() + Math.max(0, STALL_TIMEOUT_MS - alreadyWaited);
  }
  return stallDeadline;
}


function releaseStallDeadline() {
  if (deadlineReset) clearTimeout(deadlineReset);
  deadlineReset = setTimeout(() => {
    stallDeadline = null;
    deadlineReset = null;
  }, HANDOFF_GRACE_MS);
}

/** Test seam: bootstrap budget is process-wide, so tests must be able to reset it. */
export function __resetAuthLoadingStallDeadline(elapsedMs = 0) {
  if (deadlineReset) clearTimeout(deadlineReset);
  deadlineReset = null;
  stallDeadline = null;
  bootstrapElapsedMs = Math.max(0, Math.min(elapsedMs, STALL_TIMEOUT_MS));
  bootstrapElapsedConsumed = false;
}



/**
 * Hard reload that defeats any stale HTML/asset artifact served to the device.
 * A plain reload can be answered from the browser's back/forward or HTTP cache,
 * which is exactly the failure mode this recovery path exists for.
 */
function reloadFresh() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString(36));
  window.location.replace(url.toString());
}

/**
 * Clears the locally persisted session without needing AuthProvider — this
 * screen also renders above the provider tree during configuration load.
 * Server-side authorization is unaffected; RLS remains the security boundary.
 */
function localSignOut() {
  if (typeof window === "undefined") return;
  clearLocalSupabaseSession();
  window.location.replace("/login");
}

/**
 * Which bootstrap gate is pending. Only the copy changes — every stage shares
 * the same cumulative recovery budget and the same manual-only recovery.
 */
export type AuthLoadingStage = "session" | "starting" | "redirecting";

export function AuthLoadingPage({ stage = "session" }: { stage?: AuthLoadingStage } = {}) {
  const { t } = useTranslation(["auth"]);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    // IMPORTANT: this screen is rendered for many transient states (config
    // load, session restore, protected-route transition, workspace and
    // product-access resolution). It must NEVER clear tokens or navigate on
    // its own: doing so wiped freshly created sessions right after login and
    // hard-bounced the user back to /login. Recovery is manual only.
    const deadline = claimStallDeadline();
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining === 0) {
      setStalled(true);
      return releaseStallDeadline;
    }
    const timer = window.setTimeout(() => setStalled(true), remaining);
    return () => {
      window.clearTimeout(timer);
      releaseStallDeadline();
    };
  }, []);

  const pendingCopy =
    stage === "starting"
      ? t("auth:loading.starting")
      : stage === "redirecting"
        ? t("auth:loading.redirecting")
        : t("auth:loading.checking");

  return (
    <main
      role="status"
      aria-live="polite"
      data-testid="auth-loading-screen"
      data-stage={stage}
      className="flex min-h-dvh items-center justify-center bg-background px-5 py-safe"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        {!stalled ? <LoadingSpinner /> : null}
        <p className="text-sm text-foreground-muted">
          {stalled ? t("auth:loading.stalled") : pendingCopy}
        </p>

        {stalled ? (
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button className="h-11" onClick={reloadFresh}>
              {t("auth:loading.retry")}
            </Button>
            <Button variant="outline" className="h-11" onClick={localSignOut}>
              {t("auth:loading.signOut")}
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
