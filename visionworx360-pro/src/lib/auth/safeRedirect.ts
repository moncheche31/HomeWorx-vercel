/**
 * Only allow same-origin relative paths as redirect destinations.
 * Rejects protocol-relative URLs, absolute URLs, auth-page targets
 * (which would create login → login redirect loops), and other suspicious inputs.
 */
const AUTH_PATH_PREFIXES = ["/login", "/register", "/reset-password", "/forgot-password", "/auth"];

export function sanitizeRedirect(value: string | null | undefined, fallback = "/app"): string {
  if (!value || typeof value !== "string") return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  // Prevent open-redirect via URL-encoded schemes
  if (/^\/[a-z]+:/i.test(value)) return fallback;
  // Reject auth-page targets to avoid recursive login?redirect=/login?... loops.
  const pathOnly = value.split("?")[0].split("#")[0].toLowerCase();
  if (AUTH_PATH_PREFIXES.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))) {
    return fallback;
  }
  return value;
}

/**
 * Only URLs of the current window origin are approved for auth callbacks.
 * Refuses localhost in production builds via appConfig at call sites.
 */
export function buildCallbackUrl(path = "/reset-password"): string {
  if (typeof window === "undefined") return path;
  const origin = window.location.origin;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
