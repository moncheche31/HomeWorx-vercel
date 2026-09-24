# Development guide

## Prerequisites

- bun 1.3.x and Node 22+
- Docker and `psql`, for the integration suite only
- A **development** Supabase project, or a local `supabase start` stack. Never
  point a development machine at production.

## Configuration

`.env.example` documents every variable the code reads and classifies each
one. Copy it to `.env.local`; everything matching `.env*` except the template
is git-ignored.

Backend selection fails closed. The rules live in
`src/lib/config/backendSafety.ts` and are tested in
`src/lib/config/backendSafety.test.ts`.

| Situation | Behaviour |
|---|---|
| `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` missing when running `bun dev` | The dev server refuses to start and lists what is missing |
| Public config missing at runtime | `ConfigurationErrorPage` is shown and no Supabase client is created |
| `SUPABASE_URL` / keys missing on the server | Server functions throw `Missing Supabase environment variable(s)` |
| URL is the legacy Lovable production project and `VITE_APP_ENV` is not `production` | Refused by the dev server, by `validateEnv`, and by every server-side client |
| URL is the legacy Lovable production project in a test run | Always refused, whatever `VITE_APP_ENV` says |
| `vite build` without configuration | Succeeds with **no** backend compiled in. The deployment must supply configuration at runtime. |

The legacy production host is matched by hash, so no production identifier is
compiled into bundles. `bun run check:bundle-safety` verifies a build.

## Testing

### Unit tests

```sh
bun run test
```

Vitest runs in jsdom with `src/tests/setup.ts`. The
`twoProjectsOneProperty` integration file skips its 4 tests unless
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. This is pre-existing
behaviour: don't point those variables at production.

### Integration tests (real database)

```sh
bun run test:integration
```

`scripts/integration-harness/run.sh` does the following:

1. Starts `supabase/postgres:17.6.1.175` and `postgrest/postgrest:v12.2.12` in
   Docker.
2. Replays every file in `supabase/migrations`. It stubs the Storage/GoTrue
   platform objects, creates the three production-drift `*_nce2026` tables
   empty, and strips three production-only data-repair `DO` blocks.
3. Runs `vitest.integration.config.ts`.

The suite:

- **fails with `BLOCKED:`** rather than skipping when the database is not
  configured;
- **refuses any non-loopback target** (`src/tests/integration/testDatabaseGuard.ts`);
- refuses the legacy production project even when `VW_IT_ALLOW_NONLOCAL_DB=1`.

Details: [`recovery/pricing-inheritance-suite.md`](recovery/pricing-inheritance-suite.md).

### Build

```sh
bun run build && bun run check:bundle-safety
```

## Known pre-existing issues (not regressions)

- `bun run lint` reports about 11.6k `prettier/prettier` errors and about 140
  others. Lovable never enforced the lint config. Formatting the tree is a
  separate, deliberate change.
- The Company Settings save fails under production grants (`has_role()`
  EXECUTE revoked). See `docs/recovery/PHASE_2B_PREREQUISITES.md`.
- AI features call the Lovable AI Gateway (`LOVABLE_API_KEY`). See
  `docs/LOVABLE_DEPENDENCIES.md`.
- Brand logos point at Lovable-hosted assets (`src/assets/*.asset.json`), so
  they don't render when self-hosted.
