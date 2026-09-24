# Security

## Secrets
- Never place secrets in frontend code or commit them to source control.
- Public browser configuration uses `VITE_*` variables. Anything private stays server-side.
- Real `.env*` files are gitignored; only `.env.example` is committed.

## Supabase keys
- The **publishable key** (`VITE_SUPABASE_PUBLISHABLE_KEY`) is safe in the browser and paired with Row Level Security.
- The **service-role key** MUST NEVER appear in browser code. It bypasses RLS and belongs only in server-side environments (edge functions / server routes).

## Row Level Security
- Every table that stores tenant/organization/user data MUST have RLS enabled with policies scoped to the caller (e.g. `auth.uid()` and org membership).
- Client-side route guards are UI convenience only. They MUST NOT be the sole authorization mechanism — server-side authorization and RLS are the source of truth.

## Errors and logging
- Users never see raw backend error messages, database errors, stack traces, or credentials.
- All unexpected errors are mapped through `toAppError()` to a safe user-facing message plus a non-sensitive reference ID.
- `logger` scrubs common sensitive keys and is silent in production until a monitoring sink is wired in.

## Dependencies
- Review new dependencies for license, maintenance, and security posture before adding.
- Prefer well-maintained packages that support the Cloudflare Workers runtime.

## Deployment checklist (foundation)
- [ ] Real environment variables set in the hosting provider, not in code.
- [ ] Supabase RLS enabled and audited for every table.
- [ ] Service-role key stored server-side only.
- [ ] Error boundary hides stack traces in production (verified).
- [ ] Logging sink configured (or explicitly silenced).
- [ ] HTTPS enforced by hosting.

Using Supabase does not make the application secure on its own — RLS, server-side authorization, and safe error handling are required.

## Authentication (added in 002A.1)
- Sessions are managed by Supabase Auth via `@supabase/supabase-js`; access and refresh tokens are held by the SDK and never manually stored, copied to app state, or logged.
- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may appear in browser code. The service-role key is server-only and is never referenced in `src/`.
- Frontend route guards (`ProtectedRoute`, `PublicOnlyRoute`) exist for UX. They are **not** the authorization boundary; row-level security in Postgres and server-side checks are.
- Raw Supabase error strings are never displayed to end users. All errors flow through `mapAuthError()` and are shown as localized, categorized messages.
- The authentication logger scrubs sensitive keys and never records passwords, access tokens, refresh tokens, or full auth payloads.
- All redirect targets (post-login, password reset) are validated through `sanitizeRedirect()` / `buildCallbackUrl()`. Only same-origin relative paths are honored; production URLs must not use `localhost`.
