# ADR-025 — Single runtime-config-aware Supabase bearer attacher

Status: Accepted · Date: 2026-07-29

## Context

`src/start.ts` registered two client-side `functionMiddleware` entries:

- generated `attachSupabaseAuth` (`src/integrations/supabase/auth-attacher.ts`), which reads the
  generated client built from build-time `import.meta.env` values only, and
- project-specific `attachConfiguredAuth` (`src/lib/supabase/auth-attacher.ts`), which reads the
  hybrid runtime configuration (`MANAGED_PUBLIC_CONFIG` → SSR-injected runtime config →
  `import.meta.env`).

On external mobile previews (real iPhone Safari, not the editor iframe) the build-time env values
can be absent from the delivered bundle. The generated attacher then constructed a client with
missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` and threw
`Missing required public configuration: ...` *before* the runtime configuration lifecycle had
settled. Because the throw happened in middleware, every server function call in the chain
(`getMyOrganization` → product access → projects) failed, so the organization query errored and the
UI landed on "We couldn't load your workspace."

## Decision

Register exactly one bearer attacher: `attachConfiguredAuth`.

- It resolves credentials through the same hybrid runtime-config path as the rest of the app, so it
  can never disagree with the client the components use.
- It treats `PublicEnvConfigurationError` as "no token yet" instead of a hard failure: the request
  proceeds unauthenticated and the server function returns a normal auth error the UI can render,
  rather than an exception escaping middleware.

## Consequences

Do **not** re-add generated `attachSupabaseAuth` to `functionMiddleware`. The generated file stays
in the repo (it is auto-generated and must not be edited), but it is intentionally unregistered.
Any future generated-integration sync that reintroduces it will resurrect this bug on external
previews.

---

# ADR-026 — Runtime configuration is resolved, never assumed

Status: Accepted · Date: 2026-07-29

## Context

Public Supabase configuration reached the browser through three different mechanisms with different
timing guarantees, and several call sites assumed configuration was already present at module
evaluation time.

## Decision

Configuration resolution order is fixed and centralized in `src/lib/config/env.ts`:

1. `MANAGED_PUBLIC_CONFIG` (compiled-in managed values)
2. SSR-injected runtime config delivered via `getRuntimePublicConfig` and hydrated by
   `PublicConfigProvider`
3. `import.meta.env.VITE_*`

Rules that follow from this:

- No module-scope Supabase client construction. `getSupabase()` builds lazily on first use.
- Nothing reads configuration during module evaluation; it is read inside functions/handlers.
- Consumers that can run before hydration (middleware, diagnostics) must tolerate
  `PublicEnvConfigurationError` rather than propagate it.

## Consequences

A missing variable now degrades to an explicit, localized configuration state instead of a blank
screen or a generic "Something went wrong."

---

# ADR-027 — Workspace resolution is an explicit lifecycle

Status: Accepted · Date: 2026-07-29

## Context

Surfaces treated "no organization id yet" as "query returned zero rows", so an unresolved workspace
rendered "No projects yet" — indistinguishable from real emptiness, and the reason the Garage
Conversion regression looked like data loss.

## Decision

`WorkspaceProvider` exposes `organizationStatus: loading | ready | missing | error`, and
`useWorkspaceResolution()` folds auth status into a single
`loading | unauthenticated | org-loading | org-missing | org-error | ready` value.

- Data queries are enabled **only** in `ready`.
- Every other state renders `WorkspaceStateNotice` (localized, with retry where applicable).
- A zero-row result is therefore only ever shown as an empty state when the workspace is genuinely
  resolved.

## Consequences

New data surfaces must gate on `useWorkspaceResolution()` rather than on a nullable
`organizationId`. Reintroducing `enabled: !!orgId` without the resolution gate re-creates the
misleading empty state.
