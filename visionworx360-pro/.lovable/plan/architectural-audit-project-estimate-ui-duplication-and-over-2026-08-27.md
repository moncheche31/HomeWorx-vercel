# Architectural Audit — Project/Estimate UI Duplication and Overlapping Data Sources

Analysis only. No code changed. Concrete example: Pembroke (`05e8711a-…`), estimate `ffca8087-…`.

## 1. Where each kind of data is visible today

### (a) Estimate / pricing totals and breakdown

| Surface | Route → component | Data source |
|---|---|---|
| Project page → Estimate tab | `/app/projects/$projectId` → `EstimateTab` | `useEstimatesQuery` (`estimates`), `useEstimateLinesQuery` (`estimate_line_items`), `useScopeSyncStateQuery`, audit → `estimate_audit_events`. Totals recomputed client-side by `domains/estimating` |
| Photos/Video (Remote Vision) → Estimate step | `/app/remote-vision` → `RemoteVisionPage` → `ScenarioCards` / `NeedsReviewPanel` | **Not** the estimate tables — `rv.scenarios`, computed in-browser from `domains/remoteVision/scenarios.ts` + `canonicalPricing.ts` over the session draft |
| Ballpark screen | `/app/ballpark` → `BallparkPage` | `useDurableBallparkSession` → `estimate_ballpark_sessions` + `estimates.range_snapshot` |
| Proposal / Proposal print | `/app/proposal/$projectId`, `/proposal-print/$projectId` | `useProposal` → same `estimates` + `estimate_line_items`, but re-runs `calculateEstimate` / `buildContractorBreakdown` itself |
| Project list / dashboard cards | `/app/projects`, `/app/dashboard`, `/app/estimates` | `estimates` summary columns only |

### (b) Scope of work / scope items

| Surface | Route → component | Data source |
|---|---|---|
| Project page → Scope tab | `NarrativeScopeTab` (Advanced → `ScopeTab`) | `scope_sections`, `scope_items`, `project_rooms`, prose in `project_narrative_scopes` |
| Photos/Video → "Review Items" + "Approve & Save" steps | `RemoteVisionPage` → grounded scope list, `NarrativeDocumentView` | Session draft in memory + remote-vision draft; only written to `scope_items` at commit |
| Walkthrough | `/app/walkthrough` | Writes `scope_items` / `project_rooms` directly |
| Proposal | `ProposalScopeList` | `scope_items` (includedOnly) + `useNarrativeScope` |
| Room detail | `/app/projects/$projectId/rooms/$roomId` | `scope_items` filtered by room |

### (c) Photos

`ProjectPhotosTab` (project page), `MediaUploadPanel`/`PhotoObjectsPanel`/`DetectedFeaturesPanel` (remote vision), `PhotoIntakePanel` (ballpark), `ProposalGallery`/`ProposalAsIllustrated` (proposal), room detail. All ultimately `project_photos` + `project-media` storage; remote vision adds `project_media_understanding`.

### (d) Videos

Only the remote-vision/walkthrough capture flow (`VideoUploadPanel`, `rv.session.media`, persisted via `mediaPersistence.ts` into `project-media`). No video surface on the project page tabs or the proposal.

### (e) Narration / transcript

`VoiceCapturePage` (`/app/capture`) and the "captured description" card in `NarrativeScopeTab` — both `project_notes` (project-description note). Remote vision keeps its own narration/observations in `project_media_understanding` and in the session draft. Walkthrough keeps per-room narration.

## 2 + 3. Overlapping displays, and whether they are same-source (safe) or separate-source (risky)

| # | What is duplicated | Where | Same source? | Risk |
|---|---|---|---|---|
| D1 | **Estimate total/breakdown** | Estimate tab vs Remote Vision "Estimate" step | **SEPARATE.** Remote vision shows in-browser scenario math; the tab shows persisted `estimate_line_items`. They agree only immediately after a commit | **HIGH** — this is exactly the class that produced the $76,698-vs-$1,013 and underpriced-lines incidents |
| D2 | **Estimate total** | Estimate tab vs Ballpark screen band | Partly shared (`estimates.range_snapshot`) but the ballpark screen can write the band directly via `save_estimate_ballpark` without touching lines | **HIGH** — band and lines can diverge |
| D3 | **Estimate total/breakdown** | Estimate tab vs Proposal | Same tables, but **each recomputes totals independently** through its own call into `domains/estimating` | **MEDIUM** — same inputs, duplicated derivation; drift appears whenever one caller passes different options (audience, margin, allowance handling) |
| D4 | **Scope of work** | Project Scope tab vs Remote Vision "Review Items"/"Approve & Save" | **SEPARATE** until commit (draft vs `scope_items`) | **HIGH** while a draft is open; safe after commit |
| D5 | **Scope of work** | Project Scope tab vs Proposal scope list | Same query (`useScopeItemsQuery`), different filter | **LOW** — navigation redundancy only |
| D6 | **Narrative prose** | Scope tab narrative vs Remote Vision `NarrativeDocumentView` vs Proposal prose | Same table `project_narrative_scopes`, three renderers | **LOW-MEDIUM** — display duplication, one source |
| D7 | **Captured description / narration** | `/app/capture` page vs "captured description" card on Scope tab vs remote-vision narration | `project_notes` for the first two (same source); remote vision uses `project_media_understanding` (**separate**) | **MEDIUM** — two different homes for "what the contractor said" |
| D8 | **Photos** | Project Photos tab vs remote-vision media panels vs ballpark photo intake vs proposal gallery | Same `project_photos` + storage; remote vision layers analysis rows on top | **LOW** |
| D9 | **Measurements/geometry** | `GeometryQuantitiesPanel` (Estimate tab) vs remote-vision measurement capture | Same tables, different write paths and different cache invalidation | **MEDIUM** |
| D10 | **Scope→estimate sync trigger** | "Sync Scope"/"Convert to Detailed" on the Estimate tab vs commit from remote vision | Same RPCs (`create_estimate_from_scope`, `sync_estimate_from_scope`) but reached through two different server modules with different pre-steps | **HIGH** |

## 4. Recommendation per duplicate

- **D1 — Consolidate (highest priority).** Remote vision's estimate step should render the same component the Estimate tab uses, fed by the persisted estimate once one exists, and be explicitly labelled "Preview — not yet saved" while it is still a draft. One pricing renderer, one source.
- **D2 — Consolidate the band writer.** Make one module the only writer of `range_snapshot`, always derived from the same canonical cost model as lines; the ballpark screen calls it rather than the RPC directly.
- **D3 — Consolidate the derivation.** Proposal should consume a single shared selector/hook (e.g. `useEstimateTotals(estimateId)`) instead of calling the engine itself. Keeps proposal presentation, drops parallel math.
- **D4 — Relabel + consolidate at read time.** Keep the draft steps (they are legitimately different, like Review Items vs Approve & Save), but once committed, the remote-vision scope view should read `scope_items` rather than continuing to show the draft.
- **D5 — Keep.** Genuine audience difference (internal vs customer). No change.
- **D6 — Keep, but one renderer.** Extract one `NarrativeDocument` presentational component used by all three.
- **D7 — Decide one home.** Recommend `project_media_understanding` as the multimodal record and have the Scope tab card read a single merged accessor; otherwise the two narration stores will keep disagreeing.
- **D8 — Keep.** Same source, different context.
- **D9 — Unify write path + invalidation** (see section 5).
- **D10 — Consolidate on one bridge.** `commitApprovedEstimate` should be the only entry point that materializes scope and syncs the estimate; the Estimate tab's actions should call it too.

## 5. Cross-surface write/recalculation audit (the stale-data root cause)

This is the real answer to the recurring bugs. Findings:

1. **Read-time self-healing.** `ensureEstimateCurrent` runs on *every* `getEstimate` and `listEstimateLines`: it refreshes the ballpark engine, reconciles scope removals, collapses duplicate work lines (direct `UPDATE estimate_line_items`), fills placeholder quantities from geometry, and re-prices "stale" detailed pricing via `apply_knowledge_base_pricing` + `repair_estimate_pricing`, then stamps `pricing_engine_version` / `pricing_repriced_at`. **Merely opening the Estimate tab can silently rewrite what a photos/video commit just saved.** This single behaviour explains most of tonight's "the fix landed, then something else went stale" pattern.
2. **Two commit graphs to the same tables.** Remote vision: `useEstimateCommit` → `commitApprovedEstimate` (materialize scope → `create_estimate_from_scope`/`sync_estimate_from_scope` → `apply_ballpark_task_pricing` → `save_estimate_ballpark`). Estimate tab: the same RPCs called directly from `estimating.functions.ts` with no scope materialization. Third path: `estimateCopy.server.ts`. Fourth: cost-book repricing (`reprice_estimate_from_cost_book`) and per-line manual pricing.
3. **Ballpark band has two independent writers** — `commitApprovedEstimate` and `ballparkSession.functions.ts` (`save_estimate_ballpark`), with no guard between them.
4. **Scope edits do not resync the estimate.** `scope.functions.ts` mutations never trigger an estimate sync; the estimate only catches up on the next Estimate-tab read (item 1) or an explicit sync. So the Scope tab and Estimate tab can legitimately disagree until someone opens the right tab.
5. **Cache-key defect (confirmed).** `useCostBook.ts:95,108` invalidate `["estimate", estimateId]`, which matches no query in the app — the real key is `["estimating","estimate",orgId,estimateId]`. It only works today because the adjacent broad `["estimating"]` invalidation prefix-matches. Dead invalidation, worth fixing.
6. **Measurement saves under-invalidate.** `useMeasurements` invalidates measurements/lines/audit but not the estimate header or scope-sync state, so a geometry-only edit leaves the header/band stale until a refetch triggers the self-heal.

### Recommended structural fixes (for your approval, not yet implemented)

- **Make recalculation explicit, never a side effect of reading.** Move `ensureEstimateCurrent` out of `getEstimate`/`listEstimateLines` into an explicit "Refresh estimate" action plus a post-commit call. Read paths become pure.
- **One commit bridge.** All surfaces route scope→estimate through `commitApprovedEstimate`.
- **One band writer.** Single module owning `range_snapshot`, derived from the same canonical cost model as lines.
- **One totals selector.** Estimate tab, proposal, and remote-vision preview all consume it.
- **Cache-key hygiene.** Centralize estimating query keys in one factory; delete the `["estimate", id]` key.

Tell me which of D1–D10 and which of the five structural fixes to proceed with, and I'll implement in that order.
