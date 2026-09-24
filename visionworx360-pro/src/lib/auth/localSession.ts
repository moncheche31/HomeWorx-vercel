/**
 * Local (client-side) Supabase session teardown.
 *
 * Used when the persisted session is expired, invalid, or corrupted and the
 * normal `signOut()` round-trip cannot be trusted (it may hang on a stalled
 * token refresh). Server-side authorization is unaffected — RLS remains the
 * security boundary; this only removes locally cached tokens so the app can
 * fall back to the public sign-in flow.
 */
export function clearLocalSupabaseSession(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("sb-") && key.includes("auth-token")) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* storage may be unavailable (private mode) — non-fatal */
  }
}

/**
 * True when the browser still holds a persisted Supabase session whose access
 * token has not expired. Used to decide whether a slow session restore means
 * "broken tokens" (safe to clear) or merely "slow" (must be preserved).
 */
export function hasUnexpiredStoredSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (!key.startsWith("sb-") || !key.includes("auth-token")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { expires_at?: number } | null;
      const expiresAt = parsed?.expires_at;
      if (typeof expiresAt === "number" && expiresAt * 1000 > Date.now()) return true;
    }
  } catch {
    /* unreadable storage — treat as no usable session */
  }
  return false;
}
