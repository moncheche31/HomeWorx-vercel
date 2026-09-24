const IS_BROWSER = typeof window !== "undefined";

type DiagnosticMeta = Record<string, unknown>;

const ALLOWED_KEYS = new Set([
  "lifecycleStage",
  "authReady",
  "userPresent",
  "bearerAttached",
  "profileLookupStatus",
  "organizationIdPresent",
  "membershipStatus",
  "organizationLookupStatus",
  "workspaceState",
  "queryEnabledReason",
  "safeErrorCode",
  "requestFingerprint",
  "configFingerprint",
  "resultCount",
  "destination",
  "authStatus",
]);

function scrub(value: unknown): unknown {
  if (value instanceof Error) return safeErrorCode(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const output: DiagnosticMeta = {};
  for (const [key, nested] of Object.entries(value as DiagnosticMeta)) {
    if (ALLOWED_KEYS.has(key)) output[key] = scrub(nested);
  }
  return output;
}

export function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("unauthorized") || message.includes("jwt")) return "AUTH_UNAUTHORIZED";
  if (message.includes("network") || message.includes("fetch")) return "NETWORK_FAILURE";
  if (message.includes("profile")) return "PROFILE_LOOKUP_FAILURE";
  if (message.includes("membership")) return "MEMBERSHIP_LOOKUP_FAILURE";
  if (message.includes("organization")) return "ORGANIZATION_LOOKUP_FAILURE";
  return "WORKSPACE_UNKNOWN";
}

export function shouldLogWorkspaceDiagnostics(): boolean {
  return true;
}

export function enableWorkspaceDiagnostics() {
  if (!IS_BROWSER) return;
  try {
    window.localStorage.setItem("vwx.workspaceDebug", "1");
  } catch {
    // Ignore storage failures; callers can still use ?workspaceDebug.
  }
}

export function workspaceDiagnostic(event: string, meta: DiagnosticMeta = {}) {
  if (!shouldLogWorkspaceDiagnostics()) return;
  console.info(`[workspace-debug] ${event}`, scrub(meta));
}

export function workspaceDiagnosticError(event: string, error: unknown, meta: DiagnosticMeta = {}) {
  if (!shouldLogWorkspaceDiagnostics()) return;
  console.error(`[workspace-debug] ${event}`, scrub({ ...meta, safeErrorCode: safeErrorCode(error) }));
}
