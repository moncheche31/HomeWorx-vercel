# Lovable Exit — Phase 1: source extraction and reconstruction

> **Phase 2A update:** dependency #1 below (the hardcoded production fallback)
> has been removed and configuration now fails closed. `README.md`,
> `AGENTS.md`, `.gitignore`, `.env.example`, `package.json` and
> `supabase/config.toml` were rewritten for standalone use, so their hashes no
> longer match `fidelity_manifest.tsv`, which still records the Phase 1
> reconstruction. See `docs/LOVABLE_DEPENDENCIES.md` for the current
> boundary.

Assessment date: 2026-09-24.
Source: Lovable project `507194e1-0cf8-43e2-8e7c-f20f13933958`, reference commit
`989b3994e3e2e78d7d4c2ee8f10b8e80211c62d1` (the commit every earlier recovery
step was verified against).

Nothing in this phase modified the Lovable project, used the Lovable AI agent,
consumed Lovable credits, deployed anything, or wrote to the production
database. Production was touched only by read-only `SELECT`s.

## 1. How the tree was obtained

The session had no git access to the Lovable repository, so the tree was
reconstructed through the Lovable MCP read tools:

1. **Diff replay.** Ten chained range diffs cover the whole history up to the
   reference commit. Replaying their added and context lines recreated every
   file touched in that history. The diffs are whitespace-insensitive, so every
   context line was checked against the replayed file after whitespace
   normalization: **0 mismatches** across all ten ranges.
2. **Direct reads.** Every file the diffs could not produce (template files
   that predate the diff range) was fetched with `read_file` at the reference
   commit. The same was done for the large generated files and for a random
   sample used for byte comparison.
3. **Byte verification.** Each `read_file` result is recorded verbatim in the
   session transcript. A script pulls the results out and compares them byte
   for byte with the reconstructed files, so nothing depends on content being
   retyped.

## 2. Completeness (verified, not estimated)

Lovable's file listing at the reference commit has **1,424 files**. The
per-file hash manifest is in [`fidelity_manifest.tsv`](fidelity_manifest.tsv).

| Class | Files | What it means |
|---|---:|---|
| `BYTE_VERIFIED` | 127 | Byte-identical to Lovable's `read_file` output at the reference commit |
| `RECONSTRUCTED_ADDED_LINES` | 981 | Never edited after creation, so the full text comes from the diff's added lines. The 10 in the random sample were all byte-exact. |
| `RECONSTRUCTED_EDITED_whitespace_unverified` | 314 | Edited after creation. Non-whitespace content is verified (0 context mismatches). Indentation-only edits are not visible in Lovable's whitespace-insensitive diffs. |
| `VERIFIED_THEN_MODIFIED_registry_urls` | 1 | `bun.lock`: verified, then its registry host was changed on purpose (see §3) |
| `MISSING_BINARY_UNRETRIEVABLE` | 1 | `public/favicon.ico`: the read tool returns binary as lossy text, and the egress proxy blocks the published site |
| **Total** | **1,424** | 1,423 present, 1 missing, **0 extra** (path sets compared exactly) |

**Whitespace drift rate.** 29 edited files were byte-checked against Lovable:
the 20-file random sample, 4 hand-picked edited files, and 5 large files (the
generated Supabase types, the knowledge-base item catalog, the estimating
server functions, and two of the three knowledge-base seed files). **2 had
indentation-only drift:** `src/integrations/supabase/types.ts` (10 lines) and
`src/tests/integration/twoProjectsOneProperty.integration.test.ts`. Both were
replaced with the byte-exact version. At that rate, a few dozen of the 314
unverified files may still differ from Lovable in indentation only. That does
not change TypeScript behaviour. It could change behaviour only inside a
multi-line template literal. `tsc`, the build and all unit tests pass on this
tree (§6).

**Independent structural check.** `vite build` regenerates
`src/routeTree.gen.ts` from the route files on disk. The regenerated file is
byte-identical to Lovable's, so the set of routes is exact.

**To get byte-exact files with history:** in the Lovable editor, connect
GitHub and export the project. This is a user action in Lovable's UI. Diff
that export against this tree with `fidelity_manifest.tsv`. At most, only the
314 `whitespace_unverified` files and the favicon should differ.

## 3. Differences from the Lovable source (complete list)

| Path | Change | Why |
|---|---|---|
| `bun.lock` | 185 tarball URLs changed from `europe-west{1,4}-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/…` to `registry.npmjs.org/…`. Integrity hashes are unchanged, and nothing else differs. | Lovable's private npm mirror returns 403 outside Lovable. `bun install --frozen-lockfile` now works and bun still checks every tarball against the original hashes. |
| `vitest.config.ts` | Excludes `src/tests/integration/pricingInheritance/**` from the unit run | That suite needs local Postgres and PostgREST. Without them it fails with `BLOCKED:` by design, and never skips. |
| `package.json` | Adds the `test:integration` script | Runs the harness |
| `vitest.integration.config.ts` | New | Config for the integration suite |
| `src/tests/integration/pricingInheritance/*` | New: 36-test regression suite | Recovery work, Steps 1B–1C |
| `scripts/integration-harness/*` | New: Postgres 17.6 + PostgREST 12 replay harness | Recovery work |
| `supabase/migrations/20260923140000_pricing_inheritance_repair.sql` | New | Pricing-inheritance repair (Step 1C). **Not applied to Lovable production.** |
| `docs/recovery/*`, `RECOVERY.md` | New | This documentation |
| `public/favicon.ico` | **Missing** | Unretrievable (§2) |

## 4. Database reconstruction assessment

Production is Lovable Cloud Supabase project `lwybxokduogiewxciecq`, running
PostgreSQL 17.6. It currently holds 1 organization, 1 user and 1 estimate.

| Area | Status | Evidence / action |
|---|---|---|
| **Migrations** | Reproducible | The repo's 191 Lovable migrations match production's 191 applied statements pairwise, in order (whitespace-normalized). A clean Postgres 17.6 replay succeeds, with the deviations noted in the next rows. **Caveat:** the first 20 files have version stamps 1–4 s off production's `schema_migrations` (for example `20260727111214` vs `…215`). This is harmless for a new project, but the Supabase CLI would treat those 20 as unapplied if pointed at the old project. |
| **Schema drift: `*_nce2026` tables** | **Not reproducible from migrations** | `cost_reference_nce2026` (5,326 rows), `area_modification_factors_nce2026` (766) and `labor_wage_rates_nce2026` (25) exist in production but no migration creates them, and later migrations depend on them. The DDL was copied from the live catalog into `scripts/integration-harness/01_prod_drift_nce_tables.sql`. **Phase 2 must turn that DDL into a real migration and export the 6,117 rows.** |
| **Reference data** | Partly reproducible | A clean replay plus the `supabase/seed` files gives 305 `catalog_assemblies` against 693 in production, and 435 `catalog_intent_aliases` against 563. `knowledge-base-v1.sql` fails on a duplicate key after the migrations, so it is not idempotent. `assembly_templates` (10) and `assembly_template_items` (224) exist only in production. Export these tables from production (read-only). |
| **Production data repairs** | Intentionally not replayed | Three migrations end in `DO $$` blocks that reprice specific production estimates by hard-coded id (`20260811131405`, `20260828134023` from line 177, and `20260828134203` from line 133). On an empty database they raise "not found". The harness drops only those trailing blocks. On a fresh project they have to be dropped the same way, or made conditional. |
| **Functions / triggers / RLS / grants** | Reproducible | 598 objects are md5-identical between the replay and production (Step 1B). Function and table grants are hash-identical. |
| **Known defect carried over** | Present in migrations | `has_role()` EXECUTE is revoked from `authenticated` (`20260828110936`), but `organizations_update_admin` still calls it, so the Company Settings save fails. Out of scope here; it reproduces in any new project. |
| **Auth** | Configuration only | Email/password only (1 identity, provider `email`). There is an `AFTER INSERT ON auth.users` trigger in the migrations. The site URL, redirect URLs, email templates and SMTP live in the Lovable Cloud dashboard and are **not in the repo**; set them on the new project. Existing users cannot be moved with their passwords by SQL alone; plan a password reset or an auth export. |
| **Auth platform functions** | Provided by Supabase | `auth.uid()`, `auth.role()` and `auth.jwt()` come from GoTrue in hosted Supabase. The harness stubs them only for local Postgres. |
| **Storage** | Buckets not in migrations | The buckets are `org-branding` (private, 0 objects) and `project-media` (private, **40 objects, 126 MB**). The 16 `storage.objects` policies *are* in migrations, but the buckets themselves are not. Create both buckets as private on the new project and copy the 40 objects. |
| **Extensions** | Standard | `pg_trgm` (created in migrations), `pgcrypto`, `uuid-ossp`, `pg_stat_statements` and `supabase_vault`. All are available on any Supabase project. No `pg_cron`, `pg_net` or realtime publications are used. |
| **Edge functions** | None | `supabase/functions/` is empty. All server logic runs as TanStack Start server functions in the app. |
| **Secrets** | Must be re-created | See §5 (class B). The values cannot be read from Lovable, so re-issue them. |
| **Generated types** | Present | `src/integrations/supabase/types.ts` is byte-exact. The repair migration makes 5 `estimates` Insert fields required once types are regenerated; Step 1D found 0 new tsc errors from that. |

## 5. Lovable dependency inventory

Classes: **A** works unchanged · **B** configuration only · **C** code must
be replaced · **D** can be removed.

| # | Dependency | Where | Class | Notes |
|---|---|---|---|---|
| 1 | **Production fallback config** | `src/lib/config/managed-public-config.ts`, used by `env.ts` and `public-config.functions.ts` | **C (safety, first)** | With no env vars set, the app falls back to the **production** Supabase URL and publishable key. A local `bun dev` without `.env.local` talks to production. Remove the fallback or point it at the new project before anyone runs the app. |
| 2 | Lovable AI Gateway (chat) | `assemblyMaterialEstimate.server.ts`, `narrationEstimator.server.ts`, `assemblyExpansion.server.ts`, `visionUnderstanding.server.ts`, `measurementCapture.server.ts` | C | `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY`. Models: `google/gemini-3-flash`, `google/gemini-3.6-flash` and `google/gemini-3.7-flash`. The calls are OpenAI-compatible, so replacing them means changing the base URL, key and model ids to a provider you hold a key for. |
| 3 | Lovable AI Gateway (transcription) | `src/routes/api/transcribe.ts`, plus the assertion in `src/tests/walkthrough/dictationFallback.test.ts` | C | `/v1/audio/transcriptions`, model `openai/gpt-4o-mini-transcribe`. The test pins the gateway URL and must be updated alongside it. |
| 4 | `LOVABLE_API_KEY` | 6 call sites | C | It disappears with #2–3 |
| 5 | Supabase project (Lovable Cloud) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `supabase/config.toml` `project_id` | B | Point these at your own Supabase project. The Supabase client code itself is standard. |
| 6 | Stripe billing | `billing.server.ts`, `api/public/stripe-webhook.ts` | B | Direct `api.stripe.com` REST calls. Needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_CONTRACTOR` and `STRIPE_TRIAL_DAYS`, plus the webhook URL registered in Stripe. |
| 7 | BigBox (Home Depot) material pricing | `domains/materialPricing/providers/bigBoxHomeDepot.ts` | A | Direct `api.bigboxapi.com` calls. Each organization's API key is stored in the database. |
| 8 | Build config wrapper `@lovable.dev/vite-tanstack-config` | `vite.config.ts` | B (optional C) | A public npm package that installs from registry.npmjs.org and builds outside Lovable (verified). It bundles tanstackStart, React, Tailwind, tsconfig-paths and nitro (Cloudflare preset). Keep it, or replace it with an explicit Vite config later. |
| 9 | MCP server `@lovable.dev/mcp-js` | `src/lib/mcp/*`, `src/routes/mcp.ts`, `src/routes/[.mcp]/*`, `src/routes/[.well-known]/*`, `mcpPlugin()` in `vite.config.ts` | B or D | A public npm package. Its OAuth issuer is the project's **own Supabase** auth (`VITE_SUPABASE_PROJECT_ID`, which is not in `.env.example`). To keep it, enable Supabase's OAuth server and set the consent URL. Otherwise remove it. |
| 10 | OAuth consent page `/.lovable/oauth/consent` | `src/routes/[.]lovable.oauth.consent.tsx` | B or D | Uses Supabase OAuth. Only the path is Lovable-branded. It goes with #9. |
| 11 | Preview auth storage | `src/integrations/supabase/previewAuthStorage.ts` | D | Only active on `lovableproject.com`, `lovable.app` and similar hosts. Inert elsewhere. |
| 12 | Editor error reporting | `src/lib/lovable-error-reporting.ts`, used by `__root.tsx` | D | A no-op unless `window.__lovableEvents` exists (editor preview only) |
| 13 | Private npm mirror | `bun.lock`, `bunfig.toml` `minimumReleaseAgeExcludes` | B (done) | Lockfile rewritten (§3). The bunfig entries are harmless. |
| 14 | Hosting / deploy / preview URLs | Lovable publish, `*.lovable.app` | C | The build output is a nitro Cloudflare Worker (`.output/`, `wrangler.json` generated). Deploy with `wrangler` to your own Cloudflare account, or change the nitro preset (Vercel or Node). Nothing in the code refers to the preview URLs. |
| 15 | Lovable agent guidance | `AGENTS.md`, `.lovable/`, `README.md` | D | Documentation only. The auth-middleware guardrail in `AGENTS.md` (and its test) remains valid outside Lovable. |
| 16 | Generated Lovable integration files | `src/integrations/supabase/{client,client.server,auth-middleware,auth-attacher}.ts` | A | Standard supabase-js code, env-driven |

## 6. Local build (this tree)

Environment: bun 1.3.11, Node 22.22.2. A fresh install from registry.npmjs.org.

| Step | Pure Lovable reconstruction | With recovery work integrated |
|---|---|---|
| `bun install --frozen-lockfile` | OK, 601 packages, lockfile unchanged | same |
| `tsc --noEmit` (1,126 project files) | **0 errors** | **0 errors** (the suite is now type-checked too) |
| `vite build` | OK (nitro Cloudflare Worker output); `routeTree.gen.ts` regenerated byte-identical | OK |
| `vitest run` (unit) | 244 files, 2,988 tests: **2,984 passed, 0 failed, 4 skipped** | identical |
| `bun run test:integration` | n/a | 192 migrations applied (3 production-repair blocks stripped), **36/36 passed** |
| `eslint .` | 11,648 `prettier/prettier` errors plus 143 others (131 `no-explicit-any`) | unchanged; **pre-existing** because Lovable does not enforce the lint config |

The 4 skipped tests are the pre-existing `twoProjectsOneProperty` suite, which
skips itself without a service-role key. The 165 tsc errors reported in Step 1D
came from template files missing in that earlier partial reconstruction; with
the complete tree there are none.

No pre-existing failure had to be fixed, and no code was rewritten to get a
clean build.

## 7. Independence assessment

| Goal | Status | What remains |
|---|---|---|
| Develop with Claude Code | **YES** | This tree builds, type-checks and tests with no Lovable access |
| Run locally | **PARTIAL** | Runs, but **must not be started until dependency #1 is fixed or `.env.local` is set**, otherwise it connects to production. AI features need #2–3 replaced. |
| Connect to your own Supabase | **PARTIAL** | Migrations replay cleanly. Still needed: the drift-table migration, reference data export, the 2 storage buckets and 40 objects, auth settings, and user migration (§4). |
| Deploy without Lovable | **PARTIAL** | The build output is a standard Cloudflare Worker. Needs your hosting account, secrets (§5 #5–6) and the AI provider swap. |
| Shut down Lovable | **NO (not yet)** | Production data, auth users, storage objects and the gateway-backed AI features all still live in Lovable. Shut down only after the data move and the AI swap are verified. |

**Independently developable: YES.** Independently operable: PARTIAL.
