# ADR-011 through ADR-015 — Authentication foundation

## ADR-011 — Supabase Auth as v1 authentication provider
**Decision.** Use Supabase Auth (via Lovable Cloud) as the v1 identity provider.
**Rationale.** Managed identity, email/password + social providers, session refresh, and RLS integration ship out of the box.

## ADR-012 — Provider adapter for future providers
**Decision.** Wrap Supabase behind an `AuthProviderAdapter` interface (`src/features/auth/services/supabaseAuthAdapter.ts`).
**Rationale.** Google / Apple / Microsoft / SSO can be added by implementing the same interface without changing consumers.

## ADR-013 — Supabase-managed session persistence
**Decision.** Rely on `@supabase/supabase-js` `persistSession: true` + `autoRefreshToken: true`. Never write access or refresh tokens to `localStorage`, cookies, or logs directly.

## ADR-014 — Route guards are UX; RLS is the security boundary
**Decision.** `ProtectedRoute` / `PublicOnlyRoute` are navigation controls only. All row-level authorization lives in Postgres RLS policies and server-side checks.

## ADR-015 — Preserve intended destinations
**Decision.** When redirecting unauthenticated users, the current path is captured in the `redirect` search param on `/login`, then sanitized through `sanitizeRedirect()` before use. Only same-origin relative paths are honored.
