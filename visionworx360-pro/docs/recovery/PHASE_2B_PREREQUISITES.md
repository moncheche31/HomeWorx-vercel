# Phase 2B prerequisites: independent Supabase environment

Status: **prepared, not executed.** No Supabase project was created, no data
was exported and no users were migrated in Phase 2A. All production facts
below come from read-only catalog queries run on 2026-09-24.

## Baseline: what a clean replay already reproduces

The 192 migrations (191 from Lovable plus the pricing repair) were replayed
into Postgres 17.6 and compared with production.

| Object class | Production | Replay | Result |
|---|---:|---:|---|
| Tables, indexes, constraints, enum types, storage policies | 509 | 509 | Identical, except the items listed under "Differences" below |
| Public functions | 155 | 158 | +3 new helpers from the repair migration: `estimate_pricing_applied_snapshot`, `organization_pricing_configured`, `copy_estimate_lines_for_derivation` |
| Public RLS policies | 159 | 159 | Match |
| Auth triggers | `on_auth_user_created` | same | Match |
| Functions, triggers, RLS and grants, hash for hash (Step 1B) | 598 objects | 598 objects | Identical before the repair |

**Differences:**

- `estimates`: the repair migration drops 5 column defaults. This is
  intended.
- The three `*_nce2026` id sequences are `AS integer` in production, but the
  test stub creates them as `bigint` (see item 1).

## Prerequisites

### 1. Missing `*_nce2026` tables (production-only schema)

- `cost_reference_nce2026` (5,326 rows)
- `area_modification_factors_nce2026` (766 rows)
- `labor_wage_rates_nce2026` (25 rows)

These exist in production, but no migration creates them, and migration
`20260828125617_*` onward depends on them.

- **Action:** turn `scripts/integration-harness/01_prod_drift_nce_tables.sql`
  into a real migration. It must sort **before** `20260828125617`, which
  needs an explicit ordering decision because a new file can't be inserted
  into already-applied history. The simplest safe form is `CREATE TABLE IF
  NOT EXISTS` in a migration dated `20260828125616`.
- Fix the sequences to `AS integer` to match production.
- Include the trigram indexes (`cost_reference_nce2026_description_trgm`,
  `…_section_trgm`, `idx_cost_reference_*`) and `idx_nce_area_*`. All of them
  appear in the production fingerprint.

### 2. Reference-data export (read-only `COPY … TO` / `SELECT`, no personal data)

| Table | Production rows | From migrations + seeds | Gap |
|---|---:|---:|---|
| `cost_reference_nce2026` | 5,326 | 0 | Export everything |
| `area_modification_factors_nce2026` | 766 | 0 | Export everything |
| `labor_wage_rates_nce2026` | 25 | 0 | Export everything |
| `catalog_assemblies` | 693 | 305 | Export everything; the seeds aren't sufficient |
| `catalog_intent_aliases` | 563 | 435 | Export everything |
| `assembly_templates` / `assembly_template_items` | 10 / 224 | 0 / 0 | Export the system rows (`organization_id IS NULL`) |
| `nce_section_map`, `nce_craft_codes`, `us_state_codes`, `permit_fee_rules`, `scope_templates`, `catalog_library_versions`, `platform_products` | 141 / 22 / 51 / 22 / 16 / 2 / 1 | same | Verify contents, not just counts |

- `supabase/seed/knowledge-base-v1.sql` fails after the migrations with a
  duplicate key on `(library_version, assembly_key)`. Make it idempotent or
  retire it in favour of the export.
- Deliver the reference data as versioned seed files or a data migration.
  Never re-derive it from the Lovable UI.

### 3. Catalog assembly data

`catalog_assemblies`, `catalog_intent_aliases` and `catalog_library_versions`
(library v1 and v2) must be loaded as a consistent set.
`assembly_expansions` and `assembly_expansion_components` (32 / 354 rows) are
organization **runtime** data. They move with tenant data, not with reference
data.

### 4. Storage buckets

Both buckets are private, have no size or MIME limits, and aren't created by
any migration:

- `org-branding` (0 objects)
- `project-media` (40 objects, 126 MB)

The 8 `storage.objects` policies *are* in migrations and match production.

- **Action:** add a migration that creates both buckets idempotently.

### 5. `project-media` migration

Copy the 40 objects (126 MB), keeping their exact object keys. The keys are
referenced from `project_photos.storage_path` and
`project_documents.storage_path` (both unique). Verify the counts and sizes
afterwards. This needs service-role access to the legacy project; it's a
read-only copy on the source side.

### 6. Auth configuration

Nothing is in the repository apart from the `on_auth_user_created` trigger.
Configure these on the new project:

- email/password provider;
- site URL and redirect URLs (including the password-reset route
  `/reset-password`);
- email templates and SMTP (sender identity);
- JWT expiry;
- if MCP is kept, the OAuth 2.1 server and the consent URL
  `/.lovable/oauth/consent`.

### 7. User migration considerations

- Production has 1 user and 1 identity (`email`).
- Password hashes can't be moved through the API. Either do a privileged
  `auth.users` / `auth.identities` export and import that keeps the UUIDs
  (so `profiles`, `user_roles`, `created_by` and the other foreign keys stay
  valid), or recreate the user with the **same UUID** and send a password
  reset.
- Tenant data (1 organization, 9 properties, 8 clients, 1 project,
  1 estimate, notes, photos, measurements, audit events and so on) must be
  loaded after the users, in foreign-key order.

### 8. RLS, functions and triggers

These are reproduced by the migrations (see the baseline above). Two things
to watch:

- the `has_role()` defect (item 9);
- the security-definer functions that `anon` lost `EXECUTE` on (ADR-066).
  Those grants replay correctly. Check them again once the new project is up.

### 9. Company Settings permission defect (known, not fixed)

Migration `20260828110936` revokes `EXECUTE` on `has_role()` from
`authenticated`, but the `organizations_update_admin` policy calls it. As a
result the Company Settings save fails for every user, and **it will fail on
the new project too.** Decide before go-live: fix it in a new migration (a
separate, scoped task) or accept it temporarily.

### 10. Other production-only elements

- **Three production data-repair `DO` blocks.** They sit at the end of
  `20260811131405`, `20260828134023` (from line 177) and `20260828134203`
  (from line 133). They reprice specific production estimate ids and raise on
  any other database. For the new project, either migrate the data *after*
  schema replay (so the repaired rows arrive already repaired) and guard those
  blocks with `IF EXISTS`, or skip them the same way the harness does.
- **Migration history ids.** The first 20 migration files carry version stamps
  1–4 s off production's `schema_migrations`. This is harmless on a new
  project. **Never** `supabase db push` this repository at the legacy project.
- **Extensions.** `pg_trgm`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`
  and `supabase_vault` are all standard. The vault holds 0 secrets. There are
  no realtime publications, `pg_cron`, `pg_net` or edge functions.
- **Types.** Regenerate `src/integrations/supabase/types.ts` from the new
  project after the repair migration. Step 1D found 0 new type errors.

### 11. Application configuration

- Set the new project's URL and keys (`VITE_SUPABASE_*`, `SUPABASE_*`,
  `SUPABASE_SERVICE_ROLE_KEY`) per `.env.example`.
- Record the new project's host in the deployment docs.
- The fail-closed guard already refuses the legacy project outside explicit
  production.

### 12. Paid-service decision (a user decision)

A hosted Supabase project for staging or production may fall outside the
free tier. Choose the plan before Phase 2B starts. Local `supabase start`
stacks and the Docker harness cost nothing.
