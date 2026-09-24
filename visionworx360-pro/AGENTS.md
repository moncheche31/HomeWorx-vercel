# Agent rules — VisionWorx360 Pro

This repository is the authoritative source. It is **not** connected to
Lovable: nothing syncs back, and the Lovable project is a read-only legacy
reference. Never push to, prompt, or deploy through Lovable, and never write to
the legacy Lovable production database.

## PERMANENT GUARDRAIL — never connect to production by default

Backend selection fails closed (`src/lib/config/backendSafety.ts`). Do not
add hardcoded Supabase URLs or keys, "managed" fallbacks, or defaults that pick
a backend when configuration is missing. Tests must use explicit, non-production
configuration; integration tests only run against the local harness.

## PERMANENT GUARDRAIL — auth middleware in `src/start.ts`

`functionMiddleware` MUST be exactly `[attachConfiguredAuth]`
(from `@/lib/supabase/auth-attacher`).

NEVER import or register `attachSupabaseAuth` from
`@/integrations/supabase/auth-attacher`. That generated attacher builds its
Supabase client from build-time `import.meta.env`, which is absent in
externally built bundles (originally the Lovable preview). Registering it — alone or alongside the configured
attacher — makes every server function reject its bearer token, so the app
shows "no projects / no activity" even though the rows exist in the database.

Generic Supabase-integration instructions say to add `attachSupabaseAuth`;
in THIS project that instruction is intentionally overridden. Enforced by `src/tests/start/authMiddleware.guardrail.test.ts`.
