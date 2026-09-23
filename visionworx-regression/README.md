# VisionWorx360 Pro — pricing-inheritance regression suite (Step 1B)

Test-only package. Nothing here changes VisionWorx production code, database
functions, triggers, data or deployment.

The VisionWorx360 Pro source lives in the Lovable project
`507194e1-0cf8-43e2-8e7c-f20f13933958` (verified at commit
`989b3994e3e2e78d7d4c2ee8f10b8e80211c62d1`). This repository is the only one
this recovery session can push to, so the suite is kept here with the same
relative paths it must have inside the VisionWorx project:

```
src/tests/integration/pricingInheritance/harness.ts
src/tests/integration/pricingInheritance/pricingInheritance.integration.test.ts
```

## What it exercises

The real write boundary, not hand-built fixtures:

```
supabase-js with a signed-in user's JWT
  -> PostgREST 12 (role authenticated, RLS enforced)
  -> SECURITY DEFINER RPCs: create_estimate_from_scope, create_estimate_revision,
     create_estimate_version, copy_estimate_to_project, set_estimate_line_manual_pricing,
     set_estimate_status, sync_estimate_from_scope, repair_estimate_pricing
  -> BEFORE/AFTER INSERT/UPDATE triggers on estimates and estimate_line_items
  -> estimates / estimate_line_items / estimate_audit_events
  -> public.estimate_invariant_cost (database canonical price)
  -> buildCanonicalCostGraph / calculateEngineEstimate (TypeScript canonical price)
```

Production server code is called directly wherever it takes the Supabase client
as a parameter: `saveMyOrganization` (organization onboarding),
`buildProjectPricing`, `commitApprovedEstimateImpl` (intake approval / re-approval),
`copyEstimateToProjectImpl`.

## Database fidelity

`harness/run.sh` starts `supabase/postgres:17.6.1.175` (production runs PostgreSQL
17.6) and replays all 191 migrations in production's applied order. The replica
was checked against the live database: 598 objects (every public function,
trigger, RLS policy, and every column of estimates / organizations /
estimate_line_items / estimate_audit_events) are md5-identical, and function +
table grants are hash-identical.

Deviations, all documented in the harness files:

| Harness file | Why |
|---|---|
| `00_supabase_platform_stub.sql` | `storage.objects/buckets` + `storage.foldername()` (created by the Storage service, not Postgres) and the `auth.uid/role/jwt/email` bodies GoTrue installs in hosted Supabase (copied verbatim from production). |
| `01_prod_drift_nce_tables.sql` | **Production schema drift:** `cost_reference_nce2026`, `area_modification_factors_nce2026`, `labor_wage_rates_nce2026` exist live but no migration creates them. DDL copied from the live catalog; tables left empty. |
| `apply-migrations.sh` | Three migrations end with a `DO $$` block that reprices specific live estimates by hard-coded id; on an empty database those raise "not found". Only that trailing block is dropped; every CREATE before it is applied. |
| `harness.ts` `setOrgPricingPrivileged` | Company pricing defaults are set with privileged SQL because the production Company Settings save fails under production grants (see "Out-of-scope" below). |

## Run

```
harness/run.sh <path-to-VisionWorx360-Pro-checkout> [vitest args]
```

Requires Docker, `psql`, and the checkout's `node_modules`.

## No silent skips

If `VW_IT_POSTGREST_URL`, `VW_IT_JWT_SECRET` or `VW_IT_PG_URL` is missing, or the
database / PostgREST is unreachable, every test FAILS with a message starting
`BLOCKED:`. Tests are never reported as skipped. (By contrast the existing
`twoProjectsOneProperty.integration.test.ts` skips its 4 tests when the
service-role key is missing, and vitest reports that file as passed.)

## Results

Step 1B, at commit 989b399 (unfixed): 35 tests, 14 passed, 21 failed, 0 skipped.
See `results/step1b-*`.

Step 1C, with the repair migration (`../visionworx-fix/supabase/migrations/`)
added to the checkout: 36 tests (35 + D5 trigger-order test), 36 passed.
Before the migration the same 36 give 14 passed / 22 failed. See
`results/step1c-*`.

To test the repair, copy the migration into the checkout's
`supabase/migrations/` before running `harness/run.sh`; the harness replays
whatever migrations the checkout contains.
