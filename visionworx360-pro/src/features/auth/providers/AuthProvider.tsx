import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabaseAuthAdapter, type AuthProviderAdapter } from "../services/supabaseAuthAdapter";
import { mapAuthError } from "../services/errorMapping";
import type {
  AuthContextValue,
  AuthSession,
  AuthStatus,
  AuthUser,
  SafeAuthError,
  SignUpOutcome,
} from "../types/auth";
import { buildCallbackUrl } from "@/lib/auth/safeRedirect";
import { clearLocalSupabaseSession, hasUnexpiredStoredSession } from "@/lib/auth/localSession";
import { clearLastAppRoute } from "@/lib/session/lastRoute";
import { logger } from "@/lib/logging/logger";

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Initial session verification must never hang. `supabase.auth.getSession()`
 * performs a network token refresh when the persisted token is expired; on a
 * flaky mobile connection (or with corrupted local session data) that promise
 * can stay pending indefinitely, which is what pinned the app on the
 * "checking your session" screen. After this budget we drop stale local
 * tokens and continue as unauthenticated so the guards can route to /login.
 */
const SESSION_RESTORE_TIMEOUT_MS = 6_000;
const SESSION_RESTORE_DEADLINE_KEY = "visionworx.auth-restore-deadline";

function lifecycleLog(event: string, meta: Record<string, unknown> = {}) {
  logger.debug("auth_lifecycle", { event, timestamp: new Date().toISOString(), ...meta });
}

function readOrCreateRestoreDeadline(): number {
  const fallback = Date.now() + SESSION_RESTORE_TIMEOUT_MS;
  if (typeof window === "undefined") return fallback;
  try {
    const stored = Number(window.sessionStorage.getItem(SESSION_RESTORE_DEADLINE_KEY));
    // A deadline that is already in the past belongs to a previous mount. Reusing
    // it would fire the "stale session" recovery immediately on remount and wipe
    // a freshly created, valid session.
    if (Number.isFinite(stored) && stored > Date.now()) return stored;
    window.sessionStorage.setItem(SESSION_RESTORE_DEADLINE_KEY, String(fallback));
  } catch {
    // Safari private mode may deny storage; the in-memory deadline still works.
  }
  return fallback;
}

function clearRestoreDeadline() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_RESTORE_DEADLINE_KEY);
  } catch {
    // Storage is an optimization, not a requirement.
  }
}

interface AuthProviderProps {
  children: ReactNode;
  adapter?: AuthProviderAdapter;
}

export function AuthProvider({ children, adapter = supabaseAuthAdapter }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<SafeAuthError | null>(null);
  const mounted = useRef(true);
  const settled = useRef(false);

  const applySession = useCallback((u: AuthUser | null, s: AuthSession | null) => {
    if (!mounted.current) return;
    setUser(u);
    setSession(s);
    setStatus(u ? "authenticated" : "unauthenticated");
  }, []);

  const handleError = useCallback((err: unknown, category: string): SafeAuthError => {
    const safe = mapAuthError(err);
    logger.warn("auth_event_failed", {
      category,
      authErrorCategory: safe.category,
      referenceId: safe.referenceId,
      providerCode: safe.providerCode,
    });
    if (mounted.current) {
      setError(safe);
      setStatus((prev) =>
        prev === "signing_in" || prev === "signing_out" || prev === "refreshing" ? "error" : prev,
      );
    }
    return safe;
  }, []);

  useEffect(() => {
    mounted.current = true;
    settled.current = false;
    let unsubscribe: (() => void) | null = null;
    const deadline = readOrCreateRestoreDeadline();
    const remaining = Math.max(0, deadline - Date.now());
    let timer: ReturnType<typeof setTimeout> | null = null;

    lifecycleLog("AuthProvider mounted");

    // Register before restoration so a SIGNED_IN event cannot be lost while
    // getSession is pending in mobile Safari.
    unsubscribe = adapter.subscribe(({ user: u, session: s }) => {
      lifecycleLog("auth event received", { sessionPresent: Boolean(s), userPresent: Boolean(u) });
      if (s && u) {
        settled.current = true;
        clearRestoreDeadline();
        applySession(u, s);
      } else if (settled.current) {
        applySession(null, null);
      }
    });

    const settleUnauthenticated = (reason: "timeout" | "error") => {
      if (settled.current) return;
      settled.current = true;
      clearRestoreDeadline();
      // Never destroy tokens that are still valid. A slow `getSession()` is
      // routine when a second tab/window boots while the first one holds the
      // Supabase refresh lock; wiping storage there logged the user out of
      // every tab and bounced them to the sign-in screen. Only genuinely
      // expired/corrupt local tokens are cleared.
      if (reason === "timeout" && !hasUnexpiredStoredSession()) clearLocalSupabaseSession();
      lifecycleLog(reason === "timeout" ? "timeout fired" : "getSession rejected");
      if (!mounted.current) return;
      setUser(null);
      setSession(null);
      setStatus("unauthenticated");
    };



    const checkDeadline = () => {
      if (!settled.current && Date.now() >= deadline) settleUnauthenticated("timeout");
    };

    lifecycleLog("timeout started", { timeoutMs: remaining });
    timer = setTimeout(checkDeadline, remaining);
    const onResume = () => checkDeadline();
    window.addEventListener("pageshow", onResume);
    document.addEventListener("visibilitychange", onResume);

    (async () => {
      lifecycleLog("getSession started");
      const restore = adapter.getSession();
      // A restore that lands after the budget still wins when it produced a
      // real session: the user is authenticated, so do not strand the app on
      // the sign-in screen just because the check was slow (a second tab
      // booting against the Supabase refresh lock is the common case).
      void restore
        .then((late) => {
          if (!settled.current || !late.user || !mounted.current) return;
          lifecycleLog("late session restore applied", { userPresent: true });
          applySession(late.user, late.session);
        })
        .catch(() => {
          /* handled by the awaited race below */
        });
      try {
        const result = await Promise.race([
          restore,
          new Promise<never>((_, reject) => {
            const wait = Math.max(0, deadline - Date.now());
            setTimeout(() => reject(new Error("SESSION_RESTORE_TIMEOUT")), wait);
          }),
        ]);
        if (settled.current) return;
        settled.current = true;


        clearRestoreDeadline();
        lifecycleLog("getSession resolved", { userPresent: Boolean(result.user) });
        applySession(result.user, result.session);
        logger.info("auth_event", { category: "session_restore", success: true });
      } catch (err) {
        const timedOut = err instanceof Error && err.message === "SESSION_RESTORE_TIMEOUT";
        if (!timedOut) handleError(err, "session_restore");
        settleUnauthenticated(timedOut ? "timeout" : "error");
      }

    })();


    return () => {
      mounted.current = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("pageshow", onResume);
      document.removeEventListener("visibilitychange", onResume);
      if (unsubscribe) unsubscribe();
    };
  }, [adapter, applySession, handleError]);

  const signInWithPassword = useCallback<AuthContextValue["signInWithPassword"]>(
    async (email, password) => {
      setStatus("signing_in");
      setError(null);
      // Cancel the initial-restore recovery: from here on the session is being
      // created explicitly, so the 6s stale-session path must never fire and
      // must never clear the newly persisted tokens.
      settled.current = true;
      clearRestoreDeadline();
      lifecycleLog("login submitted", { restoreDeadlineActive: false });
      try {
        const signInResult = await adapter.signInWithPassword(email, password);
        const result = signInResult ?? (await adapter.getSession());
        if (!result.user || !result.session) throw new Error("AUTH_SESSION_NOT_PERSISTED");

        // Do not depend on onAuthStateChange scheduling: the resolved sign-in
        // response is authoritative and confirms a persisted session exists.
        applySession(result.user, result.session);
        lifecycleLog("login succeeded", { sessionPresent: true });
        logger.info("auth_event", { category: "sign_in", success: true });
        return null;
      } catch (err) {
        lifecycleLog("login failed", { sessionPresent: false });
        return handleError(err, "sign_in");
      }
    },
    [adapter, handleError],
  );

  const signUpWithPassword = useCallback<AuthContextValue["signUpWithPassword"]>(
    async (email, password, metadata): Promise<SignUpOutcome> => {
      setStatus("signing_in");
      setError(null);
      try {
        const result = await adapter.signUpWithPassword(
          email,
          password,
          buildCallbackUrl("/app"),
          metadata,
        );
        logger.info("auth_event", {
          category: "sign_up",
          success: true,
          requiresEmailConfirmation: result.requiresEmailConfirmation,
        });
        if (result.requiresEmailConfirmation && mounted.current) {
          // Not yet signed in; drop back to unauthenticated view.
          setStatus("unauthenticated");
        }
        return { ok: true, requiresEmailConfirmation: result.requiresEmailConfirmation };
      } catch (err) {
        return { ok: false, error: handleError(err, "sign_up") };
      }
    },
    [adapter, handleError],
  );

  const resendConfirmation = useCallback<AuthContextValue["resendConfirmation"]>(
    async (email) => {
      setError(null);
      try {
        await adapter.resendConfirmation(email);
        logger.info("auth_event", { category: "resend_confirmation", success: true });
        return null;
      } catch (err) {
        return handleError(err, "resend_confirmation");
      }
    },
    [adapter, handleError],
  );

  const requestPasswordReset = useCallback<AuthContextValue["requestPasswordReset"]>(
    async (email) => {
      setError(null);
      try {
        await adapter.requestPasswordReset(email, buildCallbackUrl("/reset-password"));
        logger.info("auth_event", { category: "password_reset_request", success: true });
        return null;
      } catch (err) {
        return handleError(err, "password_reset_request");
      }
    },
    [adapter, handleError],
  );

  const requestEmailChange = useCallback<AuthContextValue["requestEmailChange"]>(
    async (email) => {
      setError(null);
      try {
        await adapter.updateEmail(email, buildCallbackUrl("/app"));
        logger.info("auth_event", { category: "email_change_request", success: true });
        return null;
      } catch (err) {
        return handleError(err, "email_change_request");
      }
    },
    [adapter, handleError],
  );

  const signOut = useCallback<AuthContextValue["signOut"]>(async () => {
    setStatus("signing_out");
    setError(null);
    try {
      await adapter.signOut();
      clearLastAppRoute();
      applySession(null, null);
      logger.info("auth_event", { category: "sign_out", success: true });
      return null;
    } catch (err) {
      return handleError(err, "sign_out");
    }
  }, [adapter, applySession, handleError]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      session,
      error,
      signInWithPassword,
      signUpWithPassword,
      resendConfirmation,
      requestPasswordReset,
      requestEmailChange,
      signOut,
      clearError,
    }),
    [
      status,
      user,
      session,
      error,
      signInWithPassword,
      signUpWithPassword,
      resendConfirmation,
      requestPasswordReset,
      requestEmailChange,
      signOut,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
