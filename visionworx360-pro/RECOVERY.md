# VisionWorx360 Pro — independent repository

This tree was reconstructed from the Lovable project at commit
`989b3994e3e2e78d7d4c2ee8f10b8e80211c62d1` so it can be developed without
Lovable. Read [`docs/recovery/LOVABLE_EXIT_PHASE1.md`](docs/recovery/LOVABLE_EXIT_PHASE1.md)
first.

> **Warning:** without `.env.local`, the app falls back to the **production**
> Supabase project (`src/lib/config/managed-public-config.ts`). Do not run
> `bun dev` until you have created `.env.local` from `.env.example` pointing at a
> non-production project.

```sh
bun install --frozen-lockfile
bunx tsc --noEmit
bun run test               # unit tests
bun run test:integration   # needs Docker + psql; local Postgres/PostgREST only
bun run build
```

The `supabase/migrations/20260923140000_pricing_inheritance_repair.sql`
migration is part of this tree but has **not** been applied to the Lovable
production database.
