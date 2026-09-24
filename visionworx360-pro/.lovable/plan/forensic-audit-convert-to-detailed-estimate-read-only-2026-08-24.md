# Forensic audit — "Convert to Detailed Estimate" (read-only)

No code, data, migration, or live estimate was changed. Findings below come from source reads and read-only database queries of the current function/trigger definitions.

## 1. UI locations exposing the button

All in the Estimate tab of a project workspace (`src/features/estimating/components/`):

| # | Location | Testid | Guard |
|---|---|---|---|
| 1 | `BallparkRangeCard.tsx:298` — primary CTA inside the Preliminary panel | `ballpark-convert-primary` | ballpark card only, `!readOnly` |
| 2 | `BallparkRangeCard.tsx:639` — outline "Build detailed" button in the card action row | `ballpark-build-detailed` | same |
| 3 | `BallparkRangeCard.tsx:536` — hint text (no button), "Ready for a firmer number?" | `ballpark-detailed-hint` | same |
| 4 | `EstimateTab.tsx:785` — standalone primary CTA block below the card | `ballpark-convert-primary` | `isBallpark && !readOnly` |
| 5 | `EstimateTab.tsx:1219` — sticky bottom repeat of the same CTA | `ballpark-convert-footer` | `isBallpark && !readOnly` |

Buttons 1 and 2 route through `ConvertToDetailedDialog` (confirmation). Buttons 4 and 5 fire the mutation **immediately with no confirmation** — an inconsistency.

Separate, related path: `EstimateModeCard` → "Switch to Detailed/Ballpark" calls `updateEstimate({ intakeMode })`, which flips `estimates.intake_mode` **without** the scope seeding, audit event, or lock checks. Two different code paths reach the same state.

## 2. Handler chain

`onConvertToDetailed` → `useEstimating().convertToDetailed` (`useEstimating.ts:223`) → server fn `convertEstimateToDetailed` (`estimating.functions.ts:1791`, `requireSupabaseAuth`).

Handler sequence:
1. `resolveOrg` + `loadEstimate` (org-scoped).
2. Lock gate: throws `estimate_locked` if `locked_at`, `superseded_by_id`, `archived_at`, or status in approved/sent/accepted/declined/superseded.
3. If already `intake_mode = 'detailed'`: re-runs `seedFromScope()` and returns (resume-safe top-up).
4. Otherwise `UPDATE estimates SET intake_mode='detailed' WHERE ... AND intake_mode='ballpark'` (conditional, race-safe).
5. `seedFromScope()` → `buildProjectPricing()` then RPC `sync_estimate_from_scope(_estimate_id, _pricing)`.
6. `estimate_audit_events` row `converted_to_detailed` with `ballparkRange: existing.range_snapshot`.

`sync_estimate_from_scope` (SECURITY DEFINER) in turn calls:
- `assert_project_in_active_org`, its own lock gate;
- INSERT into `estimate_line_items` for included, non-archived scope items **that have no line yet**;
- `resync_estimate_scope_quantities(_estimate_id)` — **runs unconditionally, including on pre-existing lines**;
- if new lines were inserted: `kb_apply_pricing(_estimate_id, _pricing, true)` (only-new), overhead/profit backfill when the method is not target_gross_margin, `enforce_estimate_pricing_method`, audit event `synced`.

Line-level triggers then fire (`validate_estimate_line_item`, `enforce_estimate_line_cost_basis`, `apply_line_rate_overrides`, `normalize_labor_quarter_hours`, `flag_*`, `enforce_quantity_evidence_integrity`, `sync_estimate_ballpark_after_lines`).

## 3. Tables / columns / JSON written

- `estimates.intake_mode` (ballpark → detailed), `updated_at`.
- `estimates.range_snapshot` — mutated **indirectly** by trigger `sync_estimate_ballpark_after_lines`: when lines exist it sets `range_snapshot.needsCanonicalRefresh = true`; when no lines exist and a band exists it calls `rebuild_estimate_ballpark`.
- `estimate_line_items` — INSERT of scope-derived lines (org/project/estimate/scope ids, description, category/subcategory/trade, quantity, unit, sort_order, contingency, quantity_basis/note, overhead_pct/profit_pct); then pricing columns written by `kb_apply_pricing` on those new lines; and on **existing** lines `resync_estimate_scope_quantities` may rewrite `quantity`, `unit_key`, `quantity_basis`, `quantity_basis_note`, `is_quantity_placeholder`, `quantity_is_assumed_default`, `pricing_provenance.quantity`.
- `estimate_audit_events` — `converted_to_detailed` and (when lines seeded) `synced`.
- `projects.last_activity_at` via `touch_project_last_activity`.

## 4. What it does / does not change

- Creates new lines: **yes**, one per included scope item not already on the estimate.
- Replaces canonical lines: **no delete/replace**, but see §7 — existing system-owned lines can have quantities and provenance rewritten.
- Pricing settings (`pricing_method`, margins, labor rate): not set directly; `overhead_pct/profit_pct` are backfilled on lines where both were 0, and `enforce_estimate_pricing_method` zeroes them for target-gross-margin estimates.
- `range_snapshot`: flagged stale (`needsCanonicalRefresh`) rather than recomputed; the band value itself is preserved.
- Scope, rooms, measurements, ballpark sessions, project data: untouched.
- Labor hours / material costs: written only on newly seeded lines (via `kb_apply_pricing`, quarter-hour normalization, rate overrides).

## 5. Second pricing engine?

The server handler does **not** call `buildBallpark` / `buildMultiInputBallpark`. Pricing on seeded lines is the SQL knowledge-base pricer (`kb_apply_pricing`), the same one used by "Apply Knowledge Base Pricing".

However, the handler also does **not** call `refreshCanonicalBandAfterLineChange` / `refreshBallparkFromCanonicalLines`, unlike the line-CRUD paths. So after conversion the saved band is left marked `needsCanonicalRefresh: true` and **nothing in the client reads that flag** (grep: only occurrences are inside `estimating.functions.ts`). The stale marker is invisible to the contractor.

## 6. Idempotency

Mostly yes, by design: the `intake_mode='ballpark'` predicate makes the flip a no-op on the second click, and the scope seed uses `NOT EXISTS (... scope_item_id ...)`. Two residual non-idempotent effects: a second click re-runs `resync_estimate_scope_quantities` (can re-rewrite quantities if scope changed meanwhile) and appends further audit events. Double-clicking is safe from duplicate lines.

## 7. Can it damage an already-priced canonical estimate?

Yes, in bounded ways:

1. `resync_estimate_scope_quantities` runs on every conversion/top-up and rewrites quantity, unit and basis of **existing** lines from the scope item. Its guards (skips `is_price_overridden`, `pricing_source in (contractor, manual)`, `quantity_reviewed_at not null`) protect explicit contractor overrides, but an engine-priced canonical line with no manual flag can silently change quantity, and its cost columns are not re-derived in that same statement — quantity and money can end up inconsistent until a repricing pass.
2. Presentation flip: with `intake_mode = 'detailed'`, `EstimateTab` stops showing the saved ballpark band and shows `engine.totals` from lines. If freshly seeded lines are unpriced, the contractor-facing number can drop materially in one click. `setEstimateStatus` blocks issuing such an estimate (`estimate_incomplete_pricing`), but the on-screen total still changes.
3. The band is left stale-flagged with no UI signal (§5).

## 8. User value vs the existing Estimate view

Real value: it is the only path that imports approved scope items into the estimate as line items and unlocks the detailed workflow (line editor, exceptions/completion, KB repricing, range panel, labor/material panels). Without it a ballpark estimate has no line-level surface.

Weak points: the name implies a document conversion, but it is a mode flip plus a scope import on the same row; the same mode flip is also reachable from the mode menu without the import; three separate CTAs (two without confirmation) for one action.

## 9. Test coverage of the real boundary

`src/features/estimating/__tests__/convertToDetailed.test.ts` is source-text assertion only (regex over the file): asserts no `estimates.insert`, the `intake_mode='ballpark'` predicate, the audit event and the dialog wiring. `src/tests/pilot/pilotSurfaces.test.ts` and `pilotCriticalPath.test.ts` assert the CTA exists.

Not covered anywhere: behaviour of `sync_estimate_from_scope` / `resync_estimate_scope_quantities` against an estimate that already has canonical priced lines; band staleness after conversion; the two unconfirmed CTAs; the `updateEstimate({intakeMode})` bypass path; second-click behaviour against real rows.

## 10. Comparison with the ADRs and the Aug 24 audit

- **ADR-062 (one canonical cost pipeline)**: partially violated in spirit. Conversion prices seeded lines with the SQL KB pricer and never runs the canonical cost graph, so the saved band and the line-level total diverge until some later action triggers a canonical refresh.
- **ADR-065 (refinement stays canonical)**: consistent in that it never overwrites lines from an intake snapshot; inconsistent in that it is the one remaining mutation path that changes lines without a canonical band refresh.
- **ADR-066 (one band writer, no $0 resolved line)**: the band-writer rule is respected (trigger flags instead of writing). The invariant gap is that the flag has no consumer, so "stale" is indistinguishable from "current" in the UI. The `$0 resolved` guard still applies at the line trigger, so seeded unpriced lines are held, not falsely resolved.
- **Aug 24 salvageability audit**: this button sits exactly on the "competing pricing paths" and "SQL routine mutates canonical data" findings — `resync_estimate_scope_quantities` is a SECURITY DEFINER routine that edits engine-owned quantities outside the JS canonical pipeline.

## Recommendation for pilot: keep, but reframe and tighten (no removal)

The capability is load-bearing — it is the only scope→line-items bridge — so removing it would block detailed estimating. Recommended narrow changes (not executed):

1. Reduce to **one** CTA, always behind the existing confirmation dialog; delete the two unconfirmed duplicates in `EstimateTab`.
2. Rename to something truthful, e.g. "Build Detailed Estimate from Scope" — same estimate, imports scope, keeps the ballpark in history.
3. After seeding, run the canonical band refresh in the same server function so `needsCanonicalRefresh` is cleared and band/line totals agree (ADR-062/066 compliance).
4. Surface `needsCanonicalRefresh` and unpriced-line counts in the UI immediately after conversion, so a total drop is explained rather than surprising.
5. Hide or gate the `EstimateModeCard` ballpark→detailed switch so the mode cannot flip without the seed/audit path.
6. Add real boundary tests: conversion over an estimate with existing priced canonical lines, double-click, and post-conversion band consistency.

No live project was converted and no production data was modified during this audit.
