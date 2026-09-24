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
2. Fill in your Supabase project URL and anon key.
3. Restart the dev server.

## Validation
Environment variables are validated before Vite compilation and again at startup using Zod. A build missing either required public backend variable fails instead of publishing broken assets. Missing runtime configuration renders `ConfigurationErrorPage` before auth initializes.

## Notes
- Never place service-role keys in `.env*` files consumed by the browser build.
- `.env`, `.env.local`, `.env.*.local` are already gitignored.
- Business modules must read configuration from `src/lib/config/env.ts`, never from `import.meta.env` directly.
