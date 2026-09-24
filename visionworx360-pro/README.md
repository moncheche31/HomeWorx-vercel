# VisionWorx360 Pro

Voice-first, bilingual (EN/ES), mobile-first estimating platform for
professional contractors.

This repository is the **authoritative source** for VisionWorx360 Pro. The
project was built on Lovable and reconstructed outside it in September 2026
(see [`docs/recovery/`](docs/recovery/)). Lovable is now a read-only legacy
reference and data source only: nothing here syncs back to it.

## Stack

- TanStack Start (React 19, Vite 8), file-based routing, server functions
- Supabase (Postgres 17, auth, storage, RLS)
- Tailwind CSS 4 + shadcn/ui, i18next (en-US / es-US)
- Vitest 4 (jsdom) for unit tests, plus a real-database integration harness
- Production build: a nitro Cloudflare Worker (`.output/`)
- Package manager: bun (`bun.lock`), Node 22+

## Quick start

```sh
bun install --frozen-lockfile
cp .env.example .env.local      # fill in a DEVELOPMENT Supabase project
bun dev
```

**Configuration fails closed.** There is no built-in backend:

- `bun dev` refuses to start without `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`.
- The app renders a configuration error page when they're absent at runtime.
- The legacy Lovable production project is refused unless
  `VITE_APP_ENV=production`, and always in tests.

See [`src/lib/config/backendSafety.ts`](src/lib/config/backendSafety.ts).

## Commands

| Command | What it does |
|---|---|
| `bun dev` | Dev server (needs `.env.local`) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Unit tests (Vitest) |
| `bun run test:integration` | Pricing integration suite against a throwaway local Postgres 17.6 + PostgREST (needs Docker + `psql`) |
| `bun run build` | Production build |
| `bun run check:bundle-safety` | Scans `.output/` for production identifiers or keys |
| `bun run lint` | ESLint. It currently fails on pre-existing formatting issues; see `docs/DEVELOPMENT.md` |

## Documentation

- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md): development, configuration and testing
- [`docs/LOVABLE_DEPENDENCIES.md`](docs/LOVABLE_DEPENDENCIES.md): where Lovable is still involved
- [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md), [`docs/decisions/`](docs/decisions/): architecture and ADRs
- [`docs/recovery/`](docs/recovery/): the Lovable exit (reconstruction evidence, Phase 2B prerequisites)
- [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md): rules for coding agents
