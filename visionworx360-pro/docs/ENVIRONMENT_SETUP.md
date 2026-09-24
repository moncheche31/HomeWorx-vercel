# Environment setup

## Required variables

| Variable | Purpose | Example |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xyz.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public key (paired with RLS) | `sb_publishable_...` |
| `VITE_APP_ENV` | One of `development`, `staging`, `production`, `test` | `development` |
| `VITE_APP_VERSION` | Semantic version string | `0.1.0` |
| `VITE_BUILD_TIMESTAMP` | Optional ISO timestamp injected at build | `2026-07-26T00:00:00Z` |

## Setup
1. Copy `.env.example` → `.env.local`.
2. Fill in your DEVELOPMENT Supabase project URL and publishable key (never production).
3. Restart the dev server.

## Validation
`.env.example` is the complete, classified list of variables. `bun dev` refuses to start without the public Supabase variables (and refuses the legacy Lovable production project outside `VITE_APP_ENV=production`). `vite build` succeeds without them but compiles in no backend; the deployment supplies configuration at runtime. Missing runtime configuration renders `ConfigurationErrorPage` before auth initializes. See `docs/DEVELOPMENT.md`.

## Notes
- Never place service-role keys in `.env*` files consumed by the browser build.
- `.env`, `.env.local`, `.env.*.local` are already gitignored.
- Business modules must read configuration from `src/lib/config/env.ts`, never from `import.meta.env` directly.
