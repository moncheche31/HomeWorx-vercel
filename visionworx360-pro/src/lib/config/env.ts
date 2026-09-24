import { z } from "zod";
import { readManagedPublicConfig } from "./managed-public-config";

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  VITE_APP_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  VITE_APP_VERSION: z.string().min(1).default("0.1.0"),
  VITE_BUILD_TIMESTAMP: z.string().optional(),
  VITE_PUBLIC_ENV_FINGERPRINT: z.string().min(1).optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export type PublicConfigLifecycle =
  | { state: "loading"; fingerprint: string }
  | { state: "ready"; env: AppEnv; fingerprint: string }
  | { state: "failed"; missing: string[]; fingerprint: string };

export type EnvValidationResult =
  | { ok: true; env: AppEnv }
  | { ok: false; missing: string[]; message: string };

/**
 * Values delivered by the server through the SSR payload. They are used ONLY
 * as a fallback for keys that build-time replacement did not inline (which is
 * the case for externally served build artifacts produced without VITE_*
 * values). They are never read from `process.env` in the browser.
 */
let runtimeFallback: Record<string, string | undefined> = {};

export function setRuntimePublicConfig(values: Record<string, string | undefined> | undefined) {
  if (!values) return;
  runtimeFallback = { ...runtimeFallback, ...values };
}

function coalesce(buildTime: unknown, key: string, fallback?: string): string | undefined {
  if (typeof buildTime === "string" && buildTime.length > 0) return buildTime;
  const runtime = runtimeFallback[key];
  if (typeof runtime === "string" && runtime.length > 0) return runtime;
  const managed = readManagedPublicConfig(key);
  if (typeof managed === "string" && managed.length > 0) return managed;
  return fallback;
}

export function readBrowserPublicEnv(): Record<string, string | undefined> {
  return {
    // These must remain direct property reads. Vite and the managed preview
    // replace direct import.meta.env constants in browser assets at build time.
    VITE_SUPABASE_URL: coalesce(import.meta.env.VITE_SUPABASE_URL, "VITE_SUPABASE_URL"),
    VITE_SUPABASE_PUBLISHABLE_KEY: coalesce(
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "VITE_SUPABASE_PUBLISHABLE_KEY",
    ),
    VITE_APP_ENV: coalesce(import.meta.env.VITE_APP_ENV, "VITE_APP_ENV", "development"),
    VITE_APP_VERSION: coalesce(import.meta.env.VITE_APP_VERSION, "VITE_APP_VERSION", "0.1.0"),
    VITE_BUILD_TIMESTAMP: coalesce(import.meta.env.VITE_BUILD_TIMESTAMP, "VITE_BUILD_TIMESTAMP"),
    VITE_PUBLIC_ENV_FINGERPRINT: coalesce(
      import.meta.env.VITE_PUBLIC_ENV_FINGERPRINT,
      "VITE_PUBLIC_ENV_FINGERPRINT",
    ),
  };
}


export function validateEnv(
  raw: Record<string, string | undefined> = readBrowserPublicEnv(),
): EnvValidationResult {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const missing = [...new Set(parsed.error.issues.map((i) => i.path.join(".")))];
    return { ok: false, missing, message: "Application configuration is invalid." };
  }
  return { ok: true, env: parsed.data };
}

function fingerprint(raw: Record<string, string | undefined>): string {
  const input = `${raw.VITE_SUPABASE_URL ?? "missing"}\0${raw.VITE_SUPABASE_PUBLISHABLE_KEY ?? "missing"}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function resolvePublicConfig(
  raw: Record<string, string | undefined> = readBrowserPublicEnv(),
): PublicConfigLifecycle {
  const result = validateEnv(raw);
  const configFingerprint = raw.VITE_PUBLIC_ENV_FINGERPRINT ?? fingerprint(raw);
  const presence = {
    VITE_SUPABASE_URL: Boolean(raw.VITE_SUPABASE_URL),
    VITE_SUPABASE_PUBLISHABLE_KEY: Boolean(raw.VITE_SUPABASE_PUBLISHABLE_KEY),
  };

  if (!result.ok) {
    console.error("[public-config] resolved", {
      source: "vite-import-meta-env+ssr-runtime-config+managed-public-config",
      presence,
      state: "failed",
      fingerprint: configFingerprint,
    });
    return { state: "failed", missing: result.missing, fingerprint: configFingerprint };
  }

  console.info("[public-config] resolved", {
    source: "vite-import-meta-env+ssr-runtime-config+managed-public-config",
    presence,
    state: "ready",
    fingerprint: configFingerprint,
  });
  return { state: "ready", env: result.env, fingerprint: configFingerprint };
}

const metadata = readBrowserPublicEnv();

export const appConfig = {
  env: metadata.VITE_APP_ENV ?? "development",
  version: metadata.VITE_APP_VERSION ?? "0.1.0",
  buildTimestamp: metadata.VITE_BUILD_TIMESTAMP ?? null,
  publicEnvFingerprint: metadata.VITE_PUBLIC_ENV_FINGERPRINT ?? "resolving",
};

export class PublicEnvConfigurationError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Missing required public configuration: ${missing.join(", ")}`);
    this.name = "PublicEnvConfigurationError";
    this.missing = missing;
  }
}

export function requirePublicEnv(raw?: Record<string, string | undefined>): AppEnv {
  const lifecycle = resolvePublicConfig(raw);
  if (lifecycle.state === "ready") return lifecycle.env;
  throw new PublicEnvConfigurationError(
    lifecycle.state === "failed" ? lifecycle.missing : ["configuration_pending"],
  );
}
