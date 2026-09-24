/**
 * Persist the last visited authenticated route so a Preview reload
 * (which resets navigation to `/`) can restore the workspace instead
 * of dropping the user on the marketing homepage.
 *
 * Storage is same-origin localStorage only. Values are sanitized to
 * same-origin relative paths that live inside the protected `/app`
 * subtree; anything else is ignored.
 */
const STORAGE_KEY = "vw360:last-app-route";

function isSafeAppPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/app")) return false;
  // Disallow protocol-relative or backslash tricks.
  if (path.startsWith("//") || path.includes("\\")) return false;
  return true;
}

export function saveLastAppRoute(path: string): void {
  if (typeof window === "undefined") return;
  if (!isSafeAppPath(path)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, path);
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function readLastAppRoute(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isSafeAppPath(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearLastAppRoute(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
}
