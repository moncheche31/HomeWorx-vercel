/**
 * Backend selection safety (Lovable exit, Phase 2A).
 *
 * The app used to fall back to the Lovable Cloud production Supabase project
 * whenever no configuration was supplied, so a plain `bun dev` talked to
 * production. That fallback is gone. This module adds the second half of the
 * fail-closed rule: even an explicitly supplied URL may point at the legacy
 * Lovable production project ONLY when the environment is explicitly
 * `production` and the process is not a test run.
 *
 * The legacy production host is matched by hash so no production identifier
 * is compiled into browser or server bundles.
 *
 * Pure module: no import.meta, no IO. Safe to import from vite.config.ts.
 */

/** FNV-1a (32-bit) of the legacy Lovable production Supabase hostname. */
const LEGACY_PRODUCTION_HOST_HASHES: ReadonlySet<string> = new Set(["c9218c16"]);

export function hostHash(host: string): string {
  let hash = 2166136261;
  const input = host.trim().toLowerCase();
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * True for the legacy project's API host (`<ref>.supabase.co`), its direct
 * database host (`db.<ref>.supabase.co`) and pooler logins
 * (`postgres.<ref>@…pooler.supabase.com`).
 */
export function isLegacyProductionBackend(url: string | undefined | null): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const candidates = [host];
  if (host.startsWith("db.")) candidates.push(host.slice(3));
  const user = decodeURIComponent(parsed.username).toLowerCase();
  const dot = user.indexOf(".");
  if (dot >= 0 && host.endsWith(".supabase.com")) candidates.push(`${user.slice(dot + 1)}.supabase.co`);
  return candidates.some((candidate) => LEGACY_PRODUCTION_HOST_HASHES.has(hostHash(candidate)));
}

export interface BackendSelection {
  url: string | undefined | null;
  /** VITE_APP_ENV. Absent means "development" (the schema default). */
  appEnv: string | undefined | null;
  /** True under vitest / NODE_ENV=test. */
  isTestRun: boolean;
}

/**
 * Why this backend must not be used, or null when it is allowed.
 * The legacy production backend is refused in tests and in every non-
 * production environment, including when VITE_APP_ENV is unset.
 */
export function legacyProductionBlockReason(selection: BackendSelection): string | null {
  if (!isLegacyProductionBackend(selection.url)) return null;
  if (selection.isTestRun) {
    return "Refusing the legacy Lovable production Supabase project in a test run. Point tests at a local or dedicated test database.";
  }
  const appEnv = selection.appEnv || "development";
  if (appEnv !== "production") {
    return `Refusing the legacy Lovable production Supabase project while VITE_APP_ENV=${appEnv}. Use a development Supabase project (see .env.example).`;
  }
  return null;
}

type EnvSource = Record<string, string | undefined>;

function processEnv(): EnvSource {
  return typeof process !== "undefined" && process?.env ? (process.env as EnvSource) : {};
}

/** Whether the current process is a test run. Always false in the browser. */
export function isTestRuntime(env: EnvSource = processEnv()): boolean {
  return Boolean(env.VITEST) || env.NODE_ENV === "test";
}

export class LegacyProductionBackendError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "LegacyProductionBackendError";
  }
}

/**
 * Server-side guard for clients built straight from process.env.
 * Throws instead of connecting to a backend this environment may not use.
 */
export function assertBackendAllowed(url: string | undefined, env: EnvSource = processEnv()): void {
  const reason = legacyProductionBlockReason({
    url,
    appEnv: env.VITE_APP_ENV ?? env.APP_ENV,
    isTestRun: isTestRuntime(env),
  });
  if (reason) throw new LegacyProductionBackendError(reason);
}

/**
 * Problems that must stop `vite dev` before it serves anything: missing
 * public Supabase configuration, or a URL that points at legacy production.
 */
export function devServerConfigProblems(env: EnvSource): string[] {
  const problems: string[] = [];
  for (const key of ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"] as const) {
    if (!env[key]?.trim()) problems.push(`${key} is not set`);
  }
  for (const key of ["VITE_SUPABASE_URL", "SUPABASE_URL"] as const) {
    const reason = legacyProductionBlockReason({
      url: env[key],
      appEnv: env.VITE_APP_ENV,
      isTestRun: isTestRuntime(env),
    });
    if (reason) problems.push(`${key}: ${reason}`);
  }
  return problems;
}
