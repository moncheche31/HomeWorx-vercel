# VisionWorx360 Pro — Architecture

## Stack
- React 19 + TypeScript (strict)
- Vite + TanStack Start (Cloudflare Workers runtime)
- TanStack Router (file-based) + TanStack Query
- Tailwind CSS v4 + shadcn/ui + Lucide icons
- Supabase (browser client only in this prompt)
- Zod for validation

## Layers
```
src/
  app/              # Providers, global error boundary
  components/       # ui, shared, feedback, navigation
  features/         # feature modules (added in later prompts)
    foundation/
  hooks/            # cross-feature React hooks
  lib/
    config/         # env validation, appConfig
    errors/         # AppError model + mapping + reference IDs
    logging/        # logger interface
    network/        # NetworkStatusProvider
    query/          # TanStack Query defaults (in app/providers.tsx)
    supabase/       # single browser client
    validation/     # Zod helpers
  pages/            # top-level page components
  routes/           # TanStack Router file-based routes
  types/            # shared types
supabase/
docs/
```

## Core rules preserved
- Mobile-first: 44px touch targets, no horizontal scroll at 320px, safe-area aware.
- Voice-first, bilingual, contractor-authority — architectural placeholders only in this prompt.
- Tenant isolation: enforced via Supabase RLS when tables land; client role checks are never sufficient.
- Feature modules live under `src/features/<name>/` and MUST NOT be placed in `foundation/`.

## Data flow
1. `src/lib/config/env.ts` validates VITE_* variables with Zod at module load.
2. `envResult` is consumed by `src/routes/__root.tsx`; if invalid, `ConfigurationErrorPage` is rendered instead of the app.
3. `src/lib/supabase/client.ts` returns a lazily-created singleton client, or `null` if not configured.
4. `AppProviders` (or `__root`) composes: AppErrorBoundary → QueryClientProvider → NetworkStatusProvider → routes.
5. TanStack Query defaults: no retry on 4xx, limited retry on network errors, no refetch on focus.

## Extension points (not implemented here)
- Localization provider (EN/ES) — insert inside `AppProviders`.
- Auth provider + `_authenticated/` route layout — see docs/SECURITY.md.
- Feature modules under `src/features/` with their own routes, queries, components.
- Server functions under `src/lib/**/*.functions.ts` — see TanStack Start docs.
- Production logger sink — swap `src/lib/logging/logger.ts` implementation.
