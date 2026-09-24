# VisionWorx360 Pro — Forensic Salvageability Audit

Read-only audit. No code or data was changed. Scale: 952 files / 151,959 LOC in `src`, 147 migrations, 198 test files (~1,983 assertions), 31 ADRs, 4 estimates / 67 estimate lines / 6 projects in live data.

## Verdict

**Salvageable — refactor around the preserved database and domain model. Do not rebuild; do not keep patching in place.** Confidence: **high (~85%)** on the diagnosis, **medium-high (~70%)** on effort.

The domain model, catalog, evidence/provenance concepts, and the test culture are genuinely valuable and would cost more to recreate than to consolidate. What is failing is not the model — it is that **the same decisions are implemented two or three times in different layers** (JS canonical graph vs SQL trigger math, write-path triggers vs on-demand repair sweeps, session JSON vs estimate columns). Every "universal repair" so far fixed one implementation while another kept writing. That is a consolidation problem, and it is bounded.

## Findings

### Critical

**C1 — Unauthenticated callers can mutate pricing on any estimate.** 9 `SECURITY DEFINER` functions are `EXECUTE`-able by `anon` (verified via `has_function_privilege`), including `price_unmatched_lines`, `reconcile_estimate_from_scope`, `apply_scope_template`, `rederive_measurement_quantities`, `repair_generic_fallback_residue`. Their auth guard is written as `IF auth.uid() IS NOT NULL AND NOT is_org_member(v_org) THEN RAISE` — when `auth.uid()` is NULL the check is **skipped entirely**. Pattern appears in 8 migrations. A caller with only the publishable key and an estimate UUID can reprice or rewrite scope. Data exfiltration is not implied; unauthorized mutation is.

**C2 — Two independent ballpark pricing engines write the same column.** JS `refreshBallparkFromCanonicalLines` (`estimating.functions.ts:896-1127`) writes `source:"canonical_lines"` from the canonical graph. SQL `rebuild_estimate_ballpark` writes `source:"detailed_invariant_cost"` with flat heuristic spread `0.10 + 0.02*unresolved` capped 0.35, in a different JSON shape — and it fires from triggers `zzz_estimate_lines_sync_ballpark_{ins,upd,del}` on **every ordinary line edit**. `createEstimateLine`/`updateEstimateLine`/`archiveEstimateLine` never call the JS refresh, so for routine editing the SQL engine is the *only* writer. ADR-062's "one canonical pipeline" holds in JS only. Live proof of divergence in `estimates.range_snapshot`: `band.expected = 13310` alongside `originalBallpark.band.expected = 8363` and two different labor rates (85 vs 65.01) in one row.

**C3 — `resolved` at $0 is reachable and present in live data.** `enforce_estimate_line_cost_basis` sets `resolution_status='resolved'` the moment a line looks contractor-owned (`is_price_overridden` OR `pricing_source IN ('contractor','manual')`) **with no dollar-amount test**. The zero guards (`flag_zero_priced_estimate_lines`, `clear_phantom_price_overrides`) are on-demand sweeps inside `repair_estimate_pricing`, not write-path triggers. Live: **4 resolved lines with direct_cost = 0, zero labor hours, `cost_basis=labor_production`, `is_price_overridden=true`** on estimate `1d815f3b` (Drywall repair, Interior doors and trim, Shower tile, Shutoffs/supply lines), plus **5 phantom overrides**. One of them, "Shower tile", is also filed under `trade_key=plumbing` — a live classification error.

### High

**H1 — `estimate_line_items.project_id` has no foreign key and no write-time consistency trigger.** Every sibling id column (`estimate_id`, `scope_item_id`, `scope_section_id`, `room_id`) has one; `project_id` has none. `scope_items` has `assert_scope_item_consistency`; the line table has only the retroactive `reconcile_estimate_from_scope` RPC. Contamination is structurally possible and only caught by a maintenance job. Current live data is clean (0 project/org/scope mismatches, 0 orphans) — the risk is unenforced, not yet realized.

**H2 — Duplicate sources of truth for the same fact.** `estimate_ballpark_sessions` carries 12 parallel value stores (`answers`, `confirmed_values`, `inferred_values`, `assumed_values`, `contractor_overrides`, `derived_geometry`, `derived_quantities`, `range_inputs`, `range_snapshot`, `payload`, `draft_preview`, `completed_payload`). `estimates.range_snapshot` nests `band`, `costBasis`, `previous`, and `originalBallpark` — four bands in one column. Geometry lives in `project_measurements` *and* embedded in the snapshot, reconciled by an undocumented app-level tie-break. This is the mechanism behind the transcript-vs-value drift reported earlier.

**H3 — Zero tests at the boundaries that actually write.** None of the 26 `*.functions.ts` server modules has a direct test, including `estimating.functions.ts` (2,290 LOC). No SQL-level tests exist against 147 migrations, despite `repair_estimate_pricing` and `enforce_estimate_line_cost_basis` each being redefined **9 times** (`kb_apply_pricing` 8, `derive_geometry_quantities` 6). No RLS-policy test, no cache-key test. The 1,983 green assertions sit almost entirely on hand-built fixtures, which is why repeated "verified with N tests passing" claims coexisted with live breakage.

**H4 — 83-column `estimate_line_items` with triplicated provenance idioms.** Nine quantity-adjacent columns, twelve labor columns, three parallel "why is this priced this way" mechanisms (typed columns, `pricing_basis` JSON, `pricing_provenance` JSON), and three unrelated audit idioms (`*_confirmed_at/_by`, `*_override_at/_by`, `*_repaired_at`). 14 triggers on this one table are ordered by name-prefix hacks (`zy_`, `zz_`, `zzz_`, `zzzz_`) — invariant ordering is alphabetical accident.

### Medium

**M1 — Insert-time org default can override an explicit manual choice.** `apply_org_pricing_method_defaults` (BEFORE INSERT) treats `target_gross_margin_pct = 0` as "unset" and flips a deliberately-chosen `overhead_profit` estimate to the org default `target_gross_margin`. `pricing_settings_locked_at` cannot protect this because it is only set later. Updates are correctly protected by `preserve_explicit_estimate_pricing`.

**M2 — Intake pricer still reachable from the estimate card.** `BallparkRangeCard.tsx:185` calls `buildBallpark(...)` client-side to render a band, alongside `BallparkPage.tsx:349` `buildMultiInputBallpark`. ADR-065 stopped the *persist*; the *display* can still show a second engine's number next to the canonical one.

**M3 — Multimodal understanding is wired but unproven.** `project_media_understanding` is genuinely consumed (`BallparkPage.tsx:145-175` splices `spokenNarration` into the pricing narrative), but the table holds **0 rows** in live data against 10 photos and 3 narrative scopes, and no test asserts observations move a band. ADR-064 is, in practice, unexercised.

**M4 — Silent-skip regression test.** `improveAccuracyCanonical.test.ts:41` `if (first.length === 0) return;` lets an ADR-047/062-named test pass with zero assertions.

### Low

**L1** — 66 further `SECURITY DEFINER` functions executable by any signed-in user (defensible, but unreviewed surface). **L2** — `range_snapshot` readers tolerate both JSON shapes (`ballparkSummary.ts:94-99`), which hides C2 instead of surfacing it. **L3** — Cross-project copy/template functions (`copy_estimate_to_project`, `apply_assembly_template`, `duplicate_scope_item`) are defensively written and correctly null cross-project references; react-query keys are consistently scoped by org/project/estimate. **L4** — 4 of 4 estimates have `pricing_settings_locked_at` unset.

## What the evidence says about the three options

- **Repair in place** — rejected. Nine rewrites of `repair_estimate_pricing` with no DB-level test is the definition of this approach failing.
- **Rebuild** — rejected. The catalog (509+ assemblies), permit subsystem, evidence/provenance model, geometry authority, and 2,700 domain assertions are the expensive parts and they are sound. Rebuilding re-litigates settled ADRs.
- **Refactor around the preserved DB/domain model** — indicated. The defects are duplicated implementations and unenforced invariants, both addressable without discarding schema or domain code.

## Suggested repair sequence (not executed)

1. **C1** — revoke `anon` EXECUTE on all 9 definer functions; change the guard to fail closed (`IF auth.uid() IS NULL OR NOT is_org_member(...)`).
2. **C2** — pick one band writer. Either gate `rebuild_estimate_ballpark` off when canonical lines exist, or route line CRUD through the JS canonical refresh and delete the SQL band math. Then collapse `range_snapshot` to a single band plus an explicit history table.
3. **C3** — move the zero/phantom guards from `repair_estimate_pricing` into the write-path trigger, so `resolved` is unreachable at $0 without an explicit `noCharge` intent. Then re-run the sweep to clear the 4 live lines.
4. **H1** — add the FK and an `assert_estimate_line_consistency` trigger.
5. **H3** — add SQL-level tests (pgTAP) for the pricing/resolution triggers and integration tests at the `*.functions.ts` boundary, before any further estimator change. This is the control that stops the "tests pass, production is wrong" cycle.
6. **H2/H4** — consolidate session value stores and line-item provenance behind one provenance contract; replace name-prefix trigger ordering with explicit ordered logic.
7. **M1, M2, M3, M4** — fix the insert-time default, remove the second display engine, seed/verify media understanding end to end, remove the silent skip.

Steps 1–5 are the pilot-blocking set. 6 is the structural work that makes the invariants hold. Approve if you want this converted into an execution plan.
