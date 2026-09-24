# ADR-020 — Membership Role vs Product Edition vs Business Persona

**Status.** Accepted (2026-07-28).

## Decision

Three concepts remain strictly separate and are never combined in a single enum, table, or permission check:

1. **Membership role** (`public.app_role` + `public.user_roles`) — authorization within an organization: `owner`, `administrator`, `estimator`, `sales`, `office`, `read_only`. Enforced by `public.has_role` and RLS policies.
2. **Product edition** (`platform_products` + `organization_products`) — which VisionWorx360 product an organization may access. V1: `CONTRACTOR` only. Not an authorization role.
3. **Business persona / specialty** (`organizations.primary_business_type`, `primary_trade`, `service_specialties`) — personalization for Contractor Edition. Not a security role, not a product edition.

## Consequences

- Adding future editions (Realtor, Investor, …) never touches `app_role` and never touches business-profile columns.
- Personalization changes never affect authorization or product access.
- Roles remain the security boundary; product access supplements — never replaces — membership checks.

# ADR-021 — Product Access Model

**Status.** Accepted (2026-07-28).

## Decision

- `platform_products(key PK, display_name_key, is_active)` — uppercase stable keys (`CHECK (key = upper(key) AND key ~ '^[A-Z][A-Z0-9_]*$')`), read-only for `authenticated`. Seeded with `CONTRACTOR`.
- `organization_products(organization_id, product_key, access_status, settings, timestamps)` — composite PK `(organization_id, product_key)`. `access_status` constrained to `active` or `revoked`. `settings` jsonb. `updated_at` maintained by `set_updated_at` trigger.
- RLS: org members read; only `owner` or `administrator` can insert/update; no delete.
- `public.has_product_access(_organization_id, _product_key)` is `SECURITY DEFINER`, `SET search_path = public`, revokes `PUBLIC` execute, grants `authenticated`. It returns true ONLY when the caller is a member of that org AND the product row is active AND the platform product is active — no cross-tenant probing.
- Backfill inserts `CONTRACTOR` for every existing organization idempotently (`ON CONFLICT DO NOTHING`).
- `create_organization_for_current_user` provisions `CONTRACTOR` in the same transaction. There is no second organization-creation path.

## Consequences

- New organizations always start with Contractor access; no client-side follow-up mutation.
- Missing `CONTRACTOR` access blocks Contractor Edition routes without touching membership.
- Removing product access does not affect roles, profiles, or CRM/Scope data.

# ADR-022 — Platform Context

**Status.** Accepted (2026-07-28).

## Decision

`src/platform/PlatformProvider.tsx` COMPOSES existing state; it does not resolve any of it independently.

- Auth: `useAuth` (existing `AuthProvider`).
- Active organization: `useWorkspace` (existing `WorkspaceProvider`), which reads via authenticated server fn.
- Membership role: `useWorkspace().profile.role`.
- Product access: `useOrganizationProducts` — server fn `listActiveOrganizationProducts` that resolves the org server-side.
- Locale: `useTranslation().i18n.language`.
- Business profile: `useWorkspace().organization`.

Exposes `hasProductAccess(key)` for UI convenience. All authorization remains server-side (RLS + `requireSupabaseAuth`).

## Route gating

`ProductAccessGuard` is mounted inside `AppLayout` after `WorkspaceProvider` and `PlatformProvider`, so it always waits for auth + org + product-access resolution before rendering Contractor children. `/no-access` is a top-level route OUTSIDE the guarded tree — no redirect loops possible.

`beforeLoad` on `/app` is intentionally NOT the gate: `beforeLoad` runs in router context before React providers mount, so gating there would either duplicate resolution or race the workspace query. The server side (RLS on every mutation, `requireSupabaseAuth` on every reader) is the authoritative boundary.

# ADR-023 — Code Boundaries and Legacy Locations

**Status.** Accepted (2026-07-28).

## Decision

New layers:

- `src/platform/` — auth, tenancy, product-access, events, files, localization, service interfaces, shared types.
- `src/domains/` — reusable domain contracts (`estimating/types.ts`, future `cost-catalog`, …). No React, no UI.
- `src/editions/contractor/` — Contractor-specific surfaces (README only for now).

Legacy locations remain in place until a real refactor:

- CRM: `src/features/crm/`
- Project Workspace: `src/features/project-workspace/`
- Scope Builder: `src/features/scope/`
- Auth/Workspace UI: `src/features/auth/`, `src/features/workspace/`

Rule: NEW shared engines land under `src/platform/` or `src/domains/`. Existing files are NOT moved to satisfy the new tree.

# ADR-024 — Estimating Engine Boundary

**Status.** Accepted (2026-07-28).

## Decision

`src/domains/estimating/types.ts` defines `EstimateInput`, `EstimateResult`, `EstimateEngine` as pure typed contracts. The engine is UI-independent and PDF-independent. Product and persona concerns live in the orchestration/entitlement layer, not the math engine. Contractor Edition will be one client of this engine.

No implementation exists yet. The contracts are placed now so future estimating work cannot accidentally couple to Contractor React components.
