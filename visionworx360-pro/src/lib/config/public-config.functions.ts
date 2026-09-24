import { createServerFn } from "@tanstack/react-start";
import { readManagedPublicConfig } from "./managed-public-config";

export interface RuntimePublicConfig extends Record<string, string | undefined> {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_APP_ENV?: string;
  VITE_APP_VERSION?: string;
  VITE_BUILD_TIMESTAMP?: string;
  VITE_PUBLIC_ENV_FINGERPRINT?: string;
}

/**
 * Server-side source of the public (browser-safe) backend configuration.
 *
 * Build-time `import.meta.env` replacement is the primary source. Externally
 * served preview/production artifacts are built by a different pipeline than
 * the local sandbox, and that build can be produced without the VITE_* values
 * present, which leaves the browser bundle with no inlined configuration.
 * This function reads the same public values from the server environment at
 * request time and hands them to the browser through the SSR payload, so the
 * external artifact always ships a valid configuration.
 *
 * Only public values are exposed here (project URL + publishable key). No
 * service role key, no secrets.
 */
export const getRuntimePublicConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<RuntimePublicConfig> => {
    const pick = (...keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = process.env[key];
        if (typeof value === "string" && value.length > 0) return value;
      }
      for (const key of keys) {
        const value = readManagedPublicConfig(key);
        if (typeof value === "string" && value.length > 0) return value;
      }
      return undefined;
    };

    return {
      VITE_SUPABASE_URL: pick("VITE_SUPABASE_URL", "SUPABASE_URL"),
      VITE_SUPABASE_PUBLISHABLE_KEY: pick(
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_ANON_KEY",
      ),
      VITE_APP_ENV: pick("VITE_APP_ENV"),
      VITE_APP_VERSION: pick("VITE_APP_VERSION"),
      VITE_BUILD_TIMESTAMP: pick("VITE_BUILD_TIMESTAMP"),
      VITE_PUBLIC_ENV_FINGERPRINT: pick("VITE_PUBLIC_ENV_FINGERPRINT"),
    };
  },
);
