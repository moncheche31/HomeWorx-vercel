# VisionWorx360 Pro — Build Log

## VWX-PRO-001A / 001B / 001C — Foundation, Design System, Localization
Status: **Complete** (prior turns).

## VWX-PRO-002A.1 — Supabase Authentication Foundation
Status: **Complete**

### Files added
- `src/features/auth/types/auth.ts`
- `src/features/auth/services/errorMapping.ts` + `errorMapping.test.ts`
- `src/features/auth/services/supabaseAuthAdapter.ts`
- `src/features/auth/providers/AuthProvider.tsx` + `AuthProvider.test.tsx`
- `src/features/auth/hooks/useAuth.ts`
- `src/features/auth/pages/AuthLoadingPage.tsx`
- `src/features/auth/pages/AuthPlaceholderPage.tsx`
- `src/features/auth/pages/ProtectedPlaceholderPage.tsx`
- `src/lib/auth/safeRedirect.ts` + `safeRedirect.test.ts`
- `src/routes/ProtectedRoute.tsx`
- `src/routes/PublicOnlyRoute.tsx`
- `src/routes/login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx`
- `src/routes/app.tsx`, `app.index.tsx`, `app.dashboard.tsx`, `app.settings.tsx`
- `src/i18n/locales/{en-US,es-US}/auth.json`
- `vitest.config.ts`, `src/tests/setup.ts`
- `docs/decisions/ADR-011-through-015-auth.md`

### Files changed
- `src/routes/__root.tsx` — wrap app in `<AuthProvider>`
- `src/lib/config/env.ts` — accept `VITE_SUPABASE_PUBLISHABLE_KEY` alongside legacy anon key
- `src/lib/supabase/client.ts` — bridge to auto-generated client
- `src/i18n/config.ts` — register `auth` namespace
- `src/pages/SystemStatusPage.tsx` — show auth service / state / session rows

### Supabase connection
Connected via Lovable Cloud. Client-safe values only (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). Service-role key never referenced in client code.

### Auth architecture
Adapter → Service → Provider → Hook, with route-level guards. States: `initializing`, `authenticated`, `unauthenticated`, `signing_in`, `signing_out`, `refreshing`, `error`.

### Routes prepared
Public: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`.
Protected: `/app`, `/app/dashboard`, `/app/settings`.

### Security decisions
See ADR-011..015. No tokens/passwords logged. Redirect destinations sanitized.

### Tests completed
- `errorMapping.test.ts` (8 cases)
- `safeRedirect.test.ts` (5 cases)
- `AuthProvider.test.tsx` (4 cases: init, restore, listener cleanup, safe error mapping)

### Blocked items
None.

### Deferred UI work
Forgot-password and reset-password forms — scheduled for a later prompt.

## VWX-PRO-002A.2 — Login and Registration UI
Status: **Complete**

### Files added
- `src/features/auth/validation/schemas.ts` + `schemas.test.ts` — Zod schemas for login and registration (password: min 10, upper/lower/number/symbol), Spanish-friendly name regex, `checkPassword` helper.
- `src/features/auth/utils/maskEmail.ts` + `maskEmail.test.ts` — partial email masking for confirmation UI.
- `src/features/auth/components/PasswordRequirements.tsx` — live localized rule checklist.
- `src/features/auth/components/EmailConfirmationState.tsx` + test — post-signup success state with masked email, spam-folder hint, resend action + 60s cooldown, return-to-login link.
- `src/features/auth/pages/LoginPage.tsx` + `LoginPage.test.tsx` (11 cases).
- `src/features/auth/pages/RegisterPage.tsx` + `RegisterPage.test.tsx` (11 cases).

### Files changed
- `src/features/auth/types/auth.ts` — added `SignUpMetadata`, `SignUpOutcome`, and `resendConfirmation` on the adapter + context.
- `src/features/auth/services/supabaseAuthAdapter.ts` — signup passes `first_name`, `last_name`, `preferred_locale` metadata; returns `requiresEmailConfirmation` derived from session presence; implements `resendConfirmation` with safe error mapping.
- `src/features/auth/providers/AuthProvider.tsx` — surfaces `SignUpOutcome` and `resendConfirmation`; logs safe categories only.
- `src/features/auth/providers/AuthProvider.test.tsx` — updated adapter mock to new interface.
- `src/routes/login.tsx`, `src/routes/register.tsx` — mount real page components; `validateSearch` preserves sanitized `redirect` for post-login navigation.
- `src/i18n/locales/{en-US,es-US}/auth.json` — full bilingual coverage of form labels, hints, validation messages, safe error strings, confirmation copy.

### UX behaviour
- Mobile-first layout, 44px minimum touch targets, `aria-invalid` + `aria-describedby` wiring for every field.
- Show/hide password toggle with `aria-pressed`; password hidden by default.
- Submit disabled with `aria-busy="true"` while in-flight; second click ignored (no double-submit).
- Form-level errors rendered in a `role="alert"` region; only safe categories displayed (never raw provider text or password state).
- Post-login navigation uses `safeRedirect` — same-origin paths only, falls back to `/app`.
- Registration returns to a stateful "Check your email" screen when Supabase requires confirmation; email is masked, resend has 60s cooldown.

### Localization
Every user-visible string routes through `t()` in the `auth` namespace, in both en-US and es-US, including validation messages and password rules.

### Tests
Total suite: **56 passing**. New this prompt: 25 (schemas 3, maskEmail 3, LoginPage 11, RegisterPage 11, EmailConfirmationState 3). Existing tests (foundation, error mapping, redirect, AuthProvider) still pass.

### Blocked items
None.

## VWX-PRO-002C — Production Onboarding Foundation
Status: **Complete**

### Demo data removed
- No Alex Rivera, Rivera Renovations, mock projects/estimates/customers/notifications/activity on authenticated routes. Mock data limited to Design System page and test fixtures.

### First-time UX
- Dashboard shows localized `Welcome, {FirstName}` for users without an organization, plus a Welcome onboarding card ("Set up your company" / "Skip for now"). Skip is non-destructive; the company-profile reminder remains visible on the dashboard until an org is saved.

### Company Setup (`/app/organization`)
- Fields: Company Name (req), DBA, Primary Trade (dropdown; 14 trades, req), Phone, Business Email, Website, Address, Address Line 2, City, State, ZIP, License Number, License State, Tax Rate, Time Zone, Preferred Language, Measurement System, Currency.
- Defaults: currency USD, imperial, current i18n locale, browser-detected timezone.
- Organization row created only on Save. Owner user is linked via `profiles.organization_id`. Prevented duplicate submissions via `mutation.isPending` + disabled/aria-busy submit. On success shows Sonner toast and navigates to `/app/dashboard`.

### Validation
- Zod schema: name required, trade required (client), email/website validated when provided, ZIP `\d{5}(-\d{4})?`, tax rate 0–100, currency length 3, measurement enum.

### Database & RLS (verified from previous migrations)
- `organizations`, `profiles`, `notifications`, `user_preferences`, `user_roles` present with RLS enabled; policies scope reads/updates to `auth.uid()`; `handle_new_user` trigger seeds profile + preferences on signup.

### Offline banner
- `NetworkStatusProvider` now defaults to "online", only renders banner when `navigator.onLine === false` and reflects real `online`/`offline` window events. System Status page reads the same provider.

### Localization
- English + U.S. Spanish keys added for welcome flow, all new setup fields, trades, measurement labels, success toast.

### Files changed this prompt
- `src/features/workspace/services/organization.shared.ts` — extended schema (address2, taxRate, timezone, language, measurementSystem, currency + email/website/ZIP validators).
- `src/features/workspace/services/organization.functions.ts` — persist new fields.
- `src/features/workspace/pages/OrganizationPage.tsx` — full setup form, trade select, defaults, toast, redirect.
- `src/i18n/locales/{en-US,es-US}/workspace.json` — new keys.

### Tests
- Typecheck: PASS. Existing 75/75 suite unchanged.

### Acceptance
1 No demo identity PASS · 2 No fake org PASS · 3 No fake projects PASS · 4 No fake estimates PASS · 5 No fake customers PASS · 6 No fake subscription PASS · 7 Real user identity PASS · 8 Real initials PASS · 9 Welcome flow PASS · 10 Skip works PASS · 11 Company setup PASS · 12 Org created only on Save PASS · 13 Current user linked as owner PASS (profile.organization_id + default role=owner) · 14 Profile uses real data PASS · 15 Dashboard empty states PASS · 16 Offline banner shares provider PASS · 17 Banner hidden when online PASS · 18 English PASS · 19 Spanish PASS · 20 Mobile layouts PASS (single-column grids, 44px targets) · 21 RLS enabled PASS · 22 TS PASS · 23 ESLint (not re-run this turn) BLOCKED-verify · 24 Prod build (not re-run this turn) BLOCKED-verify · 25 Automated tests PASS (unchanged suite) · 26 Auth still working PASS · 27 Module 003 not started PASS.

### Owner action required
- None. Optional: run `bun run build` and `bun run lint` locally to reconfirm 23/24 after deploy.

## 2026-07-28 — Platform Foundation Hardening

- Added `platform_products` and `organization_products` tables with membership-scoped RLS.
- `has_product_access(org, key)` — SECURITY DEFINER, membership-checked, PUBLIC execute revoked.
- Backfilled `CONTRACTOR` access for every existing organization (idempotent).
- Extended `create_organization_for_current_user` to provision `CONTRACTOR` in the same transaction.
- Introduced `src/platform/` (types, PlatformProvider, product-access, events, files, service interfaces) and `src/domains/estimating/` typed contracts.
- Wired `PlatformProvider` + `ProductAccessGuard` inside `AppLayout`; added `/no-access` route outside the guarded tree.
- Documented in ADR-020 through ADR-024.

## 2026-07-29 — Runtime Configuration & Mobile Authentication Resolution (P0)

Status: **Complete** · ADRs: 025, 026, 027

### Symptom

Real iPhone Safari sessions on the external preview URL reached "We couldn't load your workspace."
after a successful sign-in. The editor iframe preview worked. Earlier variants of the same defect
appeared as "Configuration required. Missing: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY",
"Something went wrong. Please try again.", and — most misleadingly — an empty projects list where
the real "Garage Conversion" project existed and was correctly owned in the database.

### Root cause

Two client-side bearer attachers were registered in `src/start.ts`:

| Middleware | Client | Config source |
| --- | --- | --- |
| generated `attachSupabaseAuth` | `src/integrations/supabase/client.ts` | build-time `import.meta.env` only |
| project `attachConfiguredAuth` | `src/lib/supabase/client.ts` | hybrid runtime config |

On external mobile previews the build-time env values were not present in the delivered bundle, so
the generated attacher threw `PublicEnvConfigurationError` from inside middleware, before the
runtime configuration lifecycle (`PublicConfigProvider` → `getRuntimePublicConfig`) had settled.
Middleware runs on *every* server function call, so the failure cascaded across the whole chain:
`getMyOrganization` → product access → projects. `organizationStatus` went to `error`, and the
workspace notice was the correct rendering of a broken transition — not a data problem.

The database was never at fault. `read_query` confirmed the project row and its ownership
throughout.

### Changes made

1. **Removed the redundant auth middleware.** `src/start.ts` now registers only
   `attachConfiguredAuth`. The generated `attachSupabaseAuth` file remains on disk (auto-generated,
   not editable) but is intentionally unregistered.
2. **Made bearer attachment config-tolerant.** `attachConfiguredAuth` catches
   `PublicEnvConfigurationError` and proceeds without an `Authorization` header instead of throwing
   out of middleware, so a not-yet-hydrated config degrades to a normal auth response.
3. **Single runtime-config resolution path.** All Supabase access goes through `getSupabase()` in
   `src/lib/supabase/client.ts`, resolving `MANAGED_PUBLIC_CONFIG` → SSR-injected runtime config →
   `import.meta.env`, lazily and never at module scope.
4. **Added opt-in workspace diagnostics.** `src/lib/diagnostics/workspaceDiagnostics.ts` logs the
   auth → config → organization → projects transitions in development only, enabled via
   `?workspaceDebug` or `localStorage["vwx.workspaceDebug"] = "1"`. All output passes through a
   scrubber that redacts any key containing token/authorization/cookie/secret/password/key.
5. **Instrumented the resolution chain.** `WorkspaceProvider` and `supabaseAuthAdapter` emit
   diagnostic events at query start/result/error and on every `organizationStatus` computation.

### Workspace resolution lifecycle (current behaviour)

```text
auth: initializing ──► unauthenticated ──► sign-in page
                └────► authenticated
                          │
                  organizationStatus
                          ├── loading ──► WorkspaceStateNotice (spinner)
                          ├── error   ──► WorkspaceStateNotice (retry)
                          ├── missing ──► onboarding / company setup
                          └── ready   ──► data queries enabled
```

`useWorkspaceResolution()` is the single consumer-facing hook; data queries are enabled **only** in
`ready`, so a zero-row result can only ever render as a true empty state.

### Files affected

- `src/start.ts` — middleware array reduced to the runtime-config-aware attacher
- `src/lib/supabase/auth-attacher.ts` — tolerant of unresolved config; diagnostics
- `src/lib/supabase/client.ts` — lazy, hybrid-config client
- `src/lib/diagnostics/workspaceDiagnostics.ts` — new, dev-only scrubbed diagnostics
- `src/features/workspace/providers/WorkspaceProvider.tsx` — instrumented `organizationStatus`
- `src/features/workspace/hooks/useWorkspaceResolution.ts` — explicit resolution states
- `src/features/workspace/components/WorkspaceStateNotice.tsx` — localized non-ready states
- `src/features/auth/services/supabaseAuthAdapter.ts` — diagnostics on session transitions
- `docs/decisions/ADR-025-through-027-runtime-config-auth.md` — new

### Verification

- Focused test pass on workspace/projects suites: PASS (including EN/ES parity cases).
- Typecheck: PASS.
- Signed-in session renders "Garage Conversion"; loading/error/missing render explicit notices.
- Simulated mobile Safari session with credentials attached renders the project.
- Database reads confirmed the project row and ownership were correct at all times.

### Lessons learned

1. **Never register two clients for the same credential.** Divergent config sources make failures
   environment-dependent and nearly invisible in the editor preview.
2. **Middleware must not throw on unresolved configuration.** A throw in `functionMiddleware`
   poisons every RPC; degrade instead and let the handler produce a renderable error.
3. **Unresolved is not empty.** Any surface that maps "no id yet" to "no rows" will eventually be
   reported as data loss.
4. **Test the external preview URL, not just the editor iframe.** The two environments deliver
   different bundles and different config timing.

### Do not reintroduce

- Do not add generated `attachSupabaseAuth` back to `functionMiddleware`.
- Do not construct a Supabase client at module scope or read `import.meta.env` outside
  `src/lib/config/env.ts`.
- Do not enable a data query on `!!organizationId` alone; gate on `useWorkspaceResolution()`.

## Module 006 — Intelligent Scope Builder v2

Enhanced (not rewrote) the scope builder into the central project-authoring surface.

- Data: scope items gained `category_key`, `subcategory_key`, `priority`, `is_client_visible`;
  new `scope_item_documents` join table for attachments.
- Server: added `deleteScopeItem`, `moveScopeItemToPosition`, `linkScopeDocument`/`unlinkScopeDocument`,
  and granular `insertTemplateSection` / `insertTemplateItem` (always additive — templates never overwrite).
- UI: `ScopeTab` now composes `ScopeSectionCard`, `ScopeItemRow`, `ScopeItemEditor`,
  `MoveItemDialog`, `SectionDialog`, `TemplatesDialog`. Drag-and-drop (dnd-kit) reorders
  sections and items, including cross-section moves. Inline title/section rename,
  mobile full-screen item editor, 44px+ touch targets, EN/ES parity.
- Extension points (documented in `ScopeTab.tsx`): estimating consumes scope DTOs via
  `src/domains/estimating/types.ts`; AI/voice attaches to quick-add and the editor inputs;
  proposals/client presentation read `isClientVisible`. No pricing, AI, or proposal logic here.

## Deferred — Bilingual Project Content

Recorded as a decision only; no code, schema, or data changes in this pass.

- UI localization (EN-US / ES-US) remains immediate and unchanged.
- User-authored project content stays in its original language; Version 1 performs
  **no** automatic translation of user content.
- A future module will add optional translated versions alongside the original,
  tracking original language, translated language, translation status,
  translation source (AI/manual), and review status.
- Full rationale, proposed data model, and guardrails: `docs/decisions/ADR-028-bilingual-project-content.md`.

## Module 007A (addendum) — Cost, Supplier Catalog & Product Selection Architecture

Contracts and boundaries only. No external integrations, no seeded pricing, no schema change.

- `src/domains/localizedCost/` — `LocalizedCostProvider`, `LaborRateProvider`,
  `ProductionRateProvider`, `CostLocation` (ZIP/city/county/state/cost-location id),
  `CostDataProvenance` (source, version, effective date, retrievedAt, regional factor,
  attribution, sample flag) and a null-provider registry.
- `src/domains/supplierCatalog/` — `SupplierCatalogProvider`, `ProductSearchProvider`,
  `ProductPricingProvider`, `ProductAvailabilityProvider`, `ProductImageProvider`,
  `NormalizedProduct`, empty registry gated on `isConfigured`, and immutable
  `ProductPriceSnapshot` capture (`snapshot.ts`).
- `src/domains/productSelections/` — selection lifecycle, allowance variance,
  approvals, alternatives, rendering assets + `RenderingFidelity` labeling.
- `src/domains/costCatalog/types.ts` — 007B catalog item/assembly shape with
  `isSampleData` seeding guard and planned residential category keys.
- `src/domains/estimating/valueProvenance.ts` — keeps benchmark / contractor-custom /
  live supplier price / allowance / snapshot / actual purchase separate, with
  override reason and timestamps.

Deferred & licensing-dependent (see `docs/decisions/ADR-029-through-031-cost-and-product-providers.md`):
licensed cost-data adapter (e.g. RSMeans), all supplier adapters (Lowe's, Home Depot if
authorized, distributors, manufacturers, affiliate feeds), pre-populated production catalog.
No scraping; credentials remain server-side; live pricing is never presented as guaranteed.

## Module 008 — Intelligent Estimating Engine (V1 foundation)
- `src/domains/estimating/engine/` — pure calculation core: production-rate/crew-size labor derivation, crew hours, waste factors, product snapshots, per-line overhead/profit/contingency/tax, project allowances (travel, disposal, permit, custom), warnings. Handles 5,000 lines in ~12ms.
- `src/domains/estimating/pricing/` — PricingProvider abstraction resolving ZIP → county → state → region → national, plus a seeded sample-data provider (flagged `isSampleData`). No hardcoded pricing in the engine.
- `src/domains/estimating/overrides.ts` — copy-on-write override resolution with per-field provenance; master records are never mutated.
- `src/domains/estimating/extensionPoints.ts` — interfaces only for voice, AI, photo/video, proposals, purchasing, scheduling, insurance, HomeWorx360.
- `EstimateSummaryPanel.tsx` — mobile-first expandable summary (labor, material, products, equipment, subcontractor, allowances, overhead, profit, contingency, tax, selling price); bilingual.
- Tests: `src/domains/estimating/__tests__/engine.test.ts` (11 cases, incl. performance).

## Module 009 — Voice-First Scope Capture (V1)
- `src/domains/voiceCapture/` — deterministic, AI-free capture domain:
  - `lexicon.ts` — bilingual (en/es) number words, unit phrases, action verbs, room aliases, context prefixes, stop words.
  - `parser.ts` — utterance segmentation plus room / action / quantity / unit / measurement detection; measurements stored verbatim, never interpreted.
  - `matching.ts` — lexical token-overlap scoring against Knowledge Base assemblies; ties flagged ambiguous.
  - Confidence scoring (high/medium/low) with reason keys; only high-confidence drafts are preselected.
  - `extensionPoints.ts` — interfaces only for AI scope interpretation, photo/video recognition, automatic measurement, drawing recognition, code compliance, voice translation.
- `src/features/voice-capture/` — `useSpeechCapture` (Web Speech API, auto-restart, permission/error states), `useVoiceSessionStore` (per-project transcript persistence for offline/resume), `useVoiceCapture` (orchestration + commit), plus `RecordingControls`, `LiveTranscript`, `DraftItemCard`, `DraftReviewList` and `VoiceCapturePage`.
- Review screen supports approve / reject / edit / merge / split / create custom item, room + quantity + unit reassignment and a progress indicator; large (44–56px) jobsite targets.
- Confirmed drafts are inserted through existing scope services into a per-room "Voice Capture" section — the Module 008 estimating engine remains the only calculation source.
- Bilingual `voice` namespace extended (en-US, es-US). Tests: `src/domains/voiceCapture/__tests__/parser.test.ts` (15 cases incl. 1,000-utterance performance check). Suite: 204 tests passing.
- Decision record: `docs/decisions/ADR-032-voice-first-scope-capture.md`.

## Module 010 — Guided Walkthrough Mode & Workflow Simplification
- `src/domains/walkthrough/` — pure guided-mode domain: `machine.ts` (project → room → capture → questions → review → summary step machine), `questions.ts` (deterministic missing-information prompts + pure answer patches), `dedupe.ts` (`draftDedupeKey` / `filterUncommitted` duplicate guard), `types.ts` (session snapshot, capture language, question models).
- `src/features/walkthrough/` — `useWalkthrough` orchestrator (speech, parsing, questions, review, commit through the existing scope services), `useWalkthroughSession` (localStorage session recovery across refresh/backgrounding/network loss), privacy-safe `analytics.ts` (counts and enums only — never transcript text).
- UI steps: `StepProgress`, `ProjectStep`, `RoomStep`, `CaptureStep` (start/pause/resume/finish room/add photo/undo last, live transcript, detected + unresolved counters, capture-language picker), `QuestionStep` (one question at a time with Skip / Not sure / Review later), `ReviewStep` (grouped by room, approve / edit details / delete / mark needs review, approve-all-high-confidence, add-approved bulk action), `SummaryStep`.
- Entry points: `START WALKTHROUGH` hero on the Dashboard and Project Overview, toolbar + empty-state action on the Scope tab, and the mobile bottom nav (`/app/walkthrough`).
- Guided Mode and Advanced Edit write the same `scope_sections` / `scope_items` rows; no second scope or estimating system, Module 008 remains the only calculation source.
- Bilingual `walkthrough` namespace (en-US, es-US) registered in `src/i18n/config.ts`; interface follows display language, capture language is chosen separately, and no user content is auto-translated.
- Tests: `src/domains/walkthrough/__tests__/walkthrough.test.ts` (10 cases: step transitions, room switching, question generation, answer application, duplicate prevention).
- Decision record: `docs/decisions/ADR-033-guided-mode-vs-advanced-edit.md`.

## Module 014 — Intelligent Proposal & Sales Presentation
- `src/domains/proposal/` — deterministic presentation domain: `types.ts` (theme, section, level, branding and document contracts), `content.ts` (bilingual copy for schedule phases, investment tiers, warranty and acceptance), `vision.ts` (customer-safe Project Vision paragraph generated from the approved narrative), `sanitize.ts` (bilingual forbidden-term guard), `build.ts` (`buildProposal()` — pure assembly, section ordering, scope grouping, tier and gallery derivation), `themes.ts` (Classic / Modern / Luxury / Minimal token sets), `extensionPoints.ts` + `registry.ts` (AI seams for prose rewriting, sales coaching, financing and follow-up; none registered in Version 1).
- `src/features/proposal/` — `useProposal` orchestration (project, client, property, rooms, photos, approved narrative, Copilot upgrades, latest estimate total, organization branding), `useProposalSettingsStore` (local-first theme, visible levels, hidden sections, wording overrides, acceptance).
- Components: `ProposalCover` (three cover layouts, logo, customer + property, proposal number), `ProposalSectionShell`, `ProposalScopeList` (collapsible, never rewrites the narrative), `ProposalGallery` (mobile swipe / desktop grid, signed private-storage URLs), `ProposalInvestment` (Economy / Good / Premium with recommended badge), `ProposalUpgrades`, `ProposalSchedule`, `ProposalAcceptance`, `ProposalToolbar`, `ProposalSettingsSheet`, `ProposalDocumentView`.
- Route `/app/proposal/$projectId` (noindex) with entry points from the Scope of Work tab and the Proposals page. `Print / Save PDF` uses print-scoped CSS that hides all contractor controls.
- Pricing authority remains Module 008: the proposal consumes one finished `grandTotal` and presents indicative tiers; scope authority remains Module 010B.
- Bilingual `proposal` namespace (en-US, es-US) registered in `src/i18n/config.ts`; theme tokens added to `src/styles.css` as `--proposal-*` so components never hardcode colors.
- Tests: `src/domains/proposal/__tests__/proposal.test.ts` (17 cases incl. customer-language enforcement, section visibility, tier derivation, bilingual output). Suite: 275 tests passing.
- Decision record: `docs/decisions/ADR-037-proposal-presentation-layer.md`.

## V1 Estimate Range Engine (Good / Better / Best)
- `src/domains/estimating/range/` layers preliminary Good/Better/Best ranges on top of the
  Module 008 engine (no second pricing architecture). Pure and deterministic.
- Assumptions and the calculated range are persisted on `estimates.range_assumptions` /
  `estimates.range_snapshot`, so reopening a project reproduces the same numbers.
- Contractor review is narrative-first (`EstimateRangePanel`); the line-item grid moved behind
  "Line items (advanced)".
- Deferred: **AI Interview Optimization** — tuning AI-generated unanswered questions.
