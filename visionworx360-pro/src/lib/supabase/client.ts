import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requirePublicEnv } from "@/lib/config/env";
import { workspaceDiagnostic, workspaceDiagnosticError } from "@/lib/diagnostics/workspaceDiagnostics";

export type SupabaseStatus =
  | { status: "not_configured" }
  | { status: "connected" }
  | { status: "error"; message: string };

let browserClient: ReturnType<typeof createClient<Database>> | undefined;

function describeBackendUrl(input: RequestInfo | URL): string {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(raw).pathname;
  } catch {
    return "unknown";
  }
}

function createConfiguredClient() {
  const env = requirePublicEnv();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  workspaceDiagnostic("backend.client:create", {
    hasUrl: Boolean(env.VITE_SUPABASE_URL),
    hasPublishableCredential: Boolean(publishableKey),
    runtime: typeof window === "undefined" ? "ssr" : "csr",
  });

  return createClient<Database>(env.VITE_SUPABASE_URL, publishableKey, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(
          typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
        );
        if (init?.headers) {
          new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        }
        if (
          publishableKey.startsWith("sb_publishable_") &&
          headers.get("Authorization") === `Bearer ${publishableKey}`
        ) {
          headers.delete("Authorization");
        }
        headers.set("apikey", publishableKey);
        const url = describeBackendUrl(input);
        workspaceDiagnostic("backend.fetch:start", {
          url,
          method: init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET"),
          hasAuthorization: headers.has("Authorization"),
        });
        return fetch(input, { ...init, headers })
          .then((response) => {
            workspaceDiagnostic("backend.fetch:response", {
              url,
              status: response.status,
              ok: response.ok,
            });
            return response;
          })
          .catch((error) => {
            workspaceDiagnosticError("backend.fetch:error", error, { url });
            throw error;
          });
      },
    },
    auth: {
      storage: typeof window === "undefined" ? undefined : window.localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export function getSupabase() {
  if (!browserClient) browserClient = createConfiguredClient();
  return browserClient;
}

export async function checkSupabaseConnectivity(): Promise<SupabaseStatus> {
  try {
    const { error } = await getSupabase().auth.getSession();
    if (error) return { status: "error", message: "Backend unreachable" };
    return { status: "connected" };
  } catch (error) {
    if (error instanceof Error && error.name === "PublicEnvConfigurationError") {
      return { status: "not_configured" };
    }
    return { status: "error", message: "Backend unreachable" };
  }
}
