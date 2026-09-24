# Repository hygiene (Phase 2A review)

Nothing was deleted in Phase 2A. This page classifies what is in the tree and
recommends cleanup.

## Classification

| Class | Contents | Action |
|---|---|---|
| **Permanent source** | `src/` (application and domain code), `supabase/migrations/` (192 migrations, including the unapplied pricing repair `20260923140000_…`), `supabase/seed/` (generated knowledge-base SQL and its generators in `scripts/generate-*`), `public/`, the root config (`package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `vite.config.ts`, `vitest*.config.ts`, `eslint.config.js`, `components.json`, `.prettierrc`, `.prettierignore`, `.gitignore`, `.env.example`) | Keep |
| **Permanent tests** | 248 files: `src/**/*.test.ts(x)`, `src/**/__tests__/`, `src/tests/` (including `integration/pricingInheritance/` and `testDatabaseGuard`), and the harness in `scripts/integration-harness/` | Keep |
| **Permanent architecture / recovery docs** | `README.md`, `AGENTS.md`, `CLAUDE.md`, `RECOVERY.md`, `docs/DEVELOPMENT.md`, `docs/LOVABLE_DEPENDENCIES.md`, `docs/ENVIRONMENT_SETUP.md`, `docs/SECURITY.md`, `docs/architecture/`, `docs/decisions/`, `docs/adr/`, `docs/qa/`, `docs/build-log/`, `docs/handyman-coverage.md`, `docs/recovery/LOVABLE_EXIT_PHASE1.md`, `docs/recovery/PHASE_2B_PREREQUISITES.md`, `docs/recovery/pricing-inheritance-suite.md`, `roadmap.md` | Keep |
| **Temporary recovery evidence** | `docs/recovery/results/` (Step 1B/1C runs and evidence), `docs/recovery/fidelity_manifest.tsv` (per-file hashes of the Phase 1 reconstruction), `.lovable/plan.md` and `.lovable/plan/` (14 Lovable-era forensic plans), `scratch/` (14 one-off probes, see the warning in `scratch/README.md`) | Keep until Phase 2B is verified. Then move `.lovable/plan*` to `docs/history/`, keep `results/` and the manifest, and delete `scratch/` (it stays in git history and in the Lovable project). |
| **Generated, committed on purpose** | `src/routeTree.gen.ts` (TanStack Router; the build regenerates it byte-identically), `src/integrations/supabase/types.ts` (regenerate from a migrated database), `src/routes/mcp.ts` and `src/routes/[.mcp]/*` / `[.well-known]/*` (mcp-js plugin), `supabase/seed/*.sql` | Keep; don't hand-edit |
| **Legacy Lovable metadata** | `.lovable/project.json`, `.lovable/mcp/manifest.json` (names the legacy production OAuth issuer; nothing in the build reads it), `src/assets/*.asset.json` (pointers to Lovable's CDN) | Replace or remove in later phases (see `docs/LOVABLE_DEPENDENCIES.md`) |
| **Generated, ignored** | `node_modules/`, `.output/`, `.wrangler/`, `.tanstack/`, `.nitro/`, `dist/`, `coverage/`, `*.tsbuildinfo`, logs | Git-ignored (`.gitignore` expanded in Phase 2A) |
| **Local-only configuration / secrets** | `.env`, `.env.local`, `.env.*` (except `.env.example`), `.dev.vars*`, `*.pem`, `*.key`, `supabase/.temp/`, `.claude/settings.local.json` | Git-ignored. No secret-bearing file is tracked: `git ls-files -ci --exclude-standard` returns nothing. |

## Findings

1. **`scratch/` can write to production if misused.** Six scripts build
   service-role clients directly from env, bypassing the fail-closed guard.
   Several hard-code legacy production estimate ids. It isn't compiled or
   tested (`tsconfig.json` includes only `src/`, `vite.config.ts`,
   `eslint.config.js` and `config/`). Recommendation: delete after Phase 2B.
2. **Duplicates in the former host repository.** `visionworx-regression/` and
   `visionworx-fix/` in HomeWorx-vercel duplicate `src/tests/integration/`,
   `scripts/integration-harness/`, `docs/recovery/results/` and the repair
   migration. They're preserved here, so they can be removed from the host
   once this repository is published.
3. **No logs, caches, build output or secrets are tracked.**
