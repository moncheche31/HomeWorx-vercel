/**
 * Integration suites create tenants, users and estimates with privileged SQL.
 * They may only ever run against a throwaway database on this machine.
 *
 * A target is accepted when every configured URL is a loopback host. Anything
 * else — a hosted Supabase project, the legacy Lovable production project, a
 * LAN address — is refused unless VW_IT_ALLOW_NONLOCAL_DB=1 is set explicitly,
 * and the legacy Lovable production project is refused even then.
 */
import { isLegacyProductionBackend } from "@/lib/config/backendSafety";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function testDatabaseTargetProblems(
  targets: Record<string, string | undefined>,
  allowNonLocal: boolean,
): string[] {
  const problems: string[] = [];
  for (const [name, url] of Object.entries(targets)) {
    if (!url) continue;
    const host = hostOf(url);
    if (!host) {
      problems.push(`${name} is not a valid URL`);
      continue;
    }
    if (isLegacyProductionBackend(url) || /\.supabase\.(co|com)$/.test(host)) {
      if (isLegacyProductionBackend(url)) {
        problems.push(`${name} points at the legacy Lovable production project`);
        continue;
      }
      if (!allowNonLocal) problems.push(`${name} points at a hosted Supabase project (${host})`);
      continue;
    }
    if (!LOOPBACK_HOSTS.has(host) && !allowNonLocal) {
      problems.push(`${name} host ${host} is not local`);
    }
  }
  return problems;
}

export function assertLocalTestDatabase(
  targets: Record<string, string | undefined>,
  allowNonLocal = process.env["VW_IT_ALLOW_NONLOCAL_DB"] === "1",
): void {
  const problems = testDatabaseTargetProblems(targets, allowNonLocal);
  if (problems.length) {
    throw new Error(`BLOCKED: refusing to run integration tests against a non-test database: ${problems.join("; ")}.`);
  }
}
