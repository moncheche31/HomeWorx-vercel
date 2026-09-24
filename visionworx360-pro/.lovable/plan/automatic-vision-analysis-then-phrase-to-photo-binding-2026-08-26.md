# Automatic Vision Analysis, then Phrase-to-Photo Binding

Two phases. Phase 1 makes photo analysis happen by itself and stop destroying prior results. Phase 2 gives what the model sees an object-level identity so narration like "that door" can attach to a specific thing in a specific photo.

Phase 2 is deliberately gated behind Phase 1 landing and being observed in real projects.

## Confirmed current state

- `analyzeProjectMedia` (`src/features/remote-vision/services/visionUnderstanding.functions.ts` -> `visionUnderstanding.server.ts`) is a real Gemini call through the AI gateway with a strict JSON schema. It only runs when `UnderstandingPanel`'s Analyze button calls `understanding.runVisualAnalysis()` from `RemoteVisionPage.tsx:344`.
- `useProjectUnderstanding.ts:72-74` resets visual state to `emptyVisualUnderstanding("no_media")` whenever the image-id signature changes, and `RemoteVisionPage.tsx:104-113` writes `visualObservations: []`, `visualStatus: "no_media"` to the database on a fingerprint mismatch. Nothing re-triggers analysis afterwards, so adding a photo silently erases the prior understanding.
- `fusion.ts` gates visual facts through `evaluateWorkCandidate` and then hard-pins `isScope: false`. Observations carry `mediaIds` (whole image) only — no region, no object instance, no phrase link. Collision with contractor statements is by `scope:<featureKey>` key.
- `project_media_understanding` stores `visual_observations` as jsonb; `project_photos` has no region/annotation columns.

---

## PHASE 1 — Automatic, non-destructive vision analysis

### 1.1 Make the "stale" transition a state, not a wipe

Add a fifth status `analyzing` (alongside `ok | no_media | provider_unavailable | provider_error`) plus a `stale` flag on the understanding result.

- `src/domains/remoteVision/visualUnderstanding.ts` — extend `VisualUnderstandingStatus`, keep `sanitizeUnderstanding` untouched.
- `src/features/remote-vision/services/mediaUnderstanding.shared.ts` — add the status to `VISUAL_STATUSES` and the patch schema (jsonb column, no migration needed for observations; the `visual_status` text column accepts the new value as-is).
- `useProjectUnderstanding.ts` — on signature change, keep the previous observations in state and mark them stale/analyzing instead of replacing them with the empty state. Only replace on a successful new result, or on a provider error (where the old result is retained and flagged stale).
- `RemoteVisionPage.tsx:104-113` — delete the blind-wipe effect. Stale observations get overwritten by the completion handler; they are never blanked as a side effect of an upload.

### 1.2 Auto-trigger on media-set change

- Introduce a small scheduler inside `useProjectUnderstanding` (or a sibling `useAutoVisionAnalysis` hook if the hook gets crowded):
  - trigger key = the stable sorted media fingerprint, not the raw array (already available as `mediaFingerprint`);
  - skip when the fingerprint equals the persisted `media_fingerprint` and status is `ok` — a reload must never pay for a re-run;
  - debounce ~2.5s so a multi-photo upload burst is one call;
  - a `runIdRef` guard so a slower earlier response cannot overwrite a newer one;
  - hard skip while `mediaUnderstanding.isLoading` (we can't tell yet whether a stored result matches);
  - skip while a run for the same fingerprint is in flight.
- Transcript and measurement text stay inputs to the call but do **not** trigger it — otherwise every keystroke costs a gateway call. Retain the manual Analyze button as "Re-analyze" so the contractor can force a run after editing narration.

### 1.3 Cost containment

- One call per distinct media fingerprint per project, persisted; repeat visits are free.
- Cap unchanged at 12 images.
- Add an in-session attempt ceiling (e.g. 3 auto-runs per project per mount) so a pathological upload loop cannot fan out.
- `provider_error` does **not** auto-retry; it surfaces a retry affordance in `UnderstandingPanel` (per gateway error semantics: only 429/5xx are retryable, and then with backoff, which we keep manual for now).

### 1.4 Give visual facts bounded influence

Guardrail is unchanged: **a visual observation still cannot set a price or create scope by itself.** What changes is that it becomes a first-class corroborator.

- `fusion.ts` — when a visual observation's subject matches a contractor-statement fact, record `corroboratedBy: "visual_observation"` on that fact's provenance and raise its confidence within a capped band. This strengthens contractor scope, never invents it.
- `fusion.ts` — visual-only work candidates stay `isScope: false`, but get a distinct `candidateStatus` so the UI can offer "Confirm this" and promotion happens through explicit contractor action only.
- `src/domains/workScope/context.ts` already accepts `visualObservations` as context signals; extend only the corroboration path there, not the admission path (Scope Admission Gate still requires Action+Object from the contractor).

### 1.5 Tests

- Signature change retains prior observations and enters `analyzing`.
- Successful run replaces; failed run keeps stale data and flags the error.
- Identical fingerprint after reload performs zero gateway calls.
- Burst of 4 uploads produces one call.
- Corroboration raises confidence but never flips `isScope`.

### Phase 1 risks

- **Cost**: real dollars now move without a click. The fingerprint gate is the primary control; worth watching gateway logs for the first week of pilot.
- **Perceived regression**: contractors used to the button may not notice analysis running. Needs a clear inline "Analyzing photos…" state in `UnderstandingPanel`.
- **Persistence races**: two tabs on the same project can both auto-run. The last successful write wins; acceptable, but noted.

### Phase 1 decisions needed from Michael

1. Should stale-but-not-yet-replaced observations remain visible (recommended) or be hidden while analyzing?
2. Does confidence corroboration from photos affect the ballpark question diet (fewer questions when a photo corroborates), or is it display-only for now?
3. Auto-analyze on every project, or only when the contractor has entered the Remote Vision flow?

---

## PHASE 2 — Object-level identity and phrase-to-photo binding

Only start after Phase 1 has run on real pilot projects.

### 2.1 Object identity in the model output

- Extend `visualObservationSchema` / `VISUAL_UNDERSTANDING_JSON_SCHEMA` with an optional-but-required-by-strict-schema `regions` array: `{ mediaId, box: [x, y, w, h] normalized 0-1, label }`, plus a stable `objectId` per observed instance so two photos of the same door can be merged.
- Gemini bounding boxes are approximate and the strict-schema contract means every property must be present and nullable rather than optional — schema authoring needs care to avoid a 400.

### 2.2 Persistence

- Store regions inside the existing `visual_observations` jsonb (no schema migration) for the first cut. A dedicated `project_media_objects` table only if we need to query or join on objects — decide once the UI shape is known.
- If a table is added: standard `GRANT` + RLS block, org-scoped like every other project table.

### 2.3 Deictic reference resolution

- New pure module `src/domains/remoteVision/reference.ts`:
  - detect deictic phrases in narration ("that door", "this wall", "the trim over there") with the existing lexicon;
  - resolve against the candidate object set using subject-key compatibility, then narration order vs. photo capture order, then uniqueness (exactly one matching object = confident bind);
  - **ambiguous binds resolve to nothing and produce a contractor question, never a guess.**
- `fusion.ts` collides on `objectId` when a bind exists, falling back to today's subject-key behaviour otherwise. Authority order is untouched: a bind lets a contractor statement inherit the photo as evidence, not the other way around.

### 2.4 UI

Recommended first cut: read-only. `UnderstandingPanel` / a new `PhotoObjectsPanel` renders the photo with boxes drawn over it and the bound narration phrase beneath. Confirm/dismiss per object comes second, only if pilot feedback shows the model is wrong often enough to need it.

Tap-to-tag (contractor draws the box) is explicitly out of scope for this phase — it is a much larger mobile-canvas build.

### Phase 2 risks and unknowns

- Bounding-box quality from `google/gemini-3-flash` on jobsite photos is unproven here; may need `gemini-3.1-pro-preview` for boxes, at higher cost per call.
- Object identity across photos (same door, two angles) is the genuinely hard part; the fallback is per-photo objects with no cross-photo merge.
- Deictic resolution is a precision problem, not a recall problem — a wrong bind is worse than no bind. All ambiguity must degrade to a question.
- Spanish narration: the deictic lexicon needs es-US coverage ("esa puerta", "esta pared") or Phase 2 silently only works in English. Language parity work already flagged in the earlier audit overlaps here.

### Phase 2 decisions needed from Michael

1. Read-only box display first, or go straight to confirm/dismiss per detected object?
2. Accept a higher-cost model for detection quality, or keep flash and accept coarse boxes?
3. Should a confirmed object-level bind be allowed to raise a fact from `visual_observation` to `contractor_statement` authority (contractor tapped it = confirmation), or does that require a separate explicit confirm step?
4. Does Spanish deictic support ship with Phase 2 or follow it?

---

## Files touched (summary)

**Phase 1**: `domains/remoteVision/visualUnderstanding.ts`, `domains/remoteVision/fusion.ts`, `domains/workScope/context.ts`, `features/remote-vision/hooks/useProjectUnderstanding.ts`, `features/remote-vision/pages/RemoteVisionPage.tsx`, `features/remote-vision/components/UnderstandingPanel.tsx`, `features/remote-vision/services/mediaUnderstanding.shared.ts`, plus tests under `src/tests/remote-vision/`.

**Phase 2**: the above plus a new `domains/remoteVision/reference.ts`, `visionUnderstanding.server.ts` (prompt + schema), a new photo-object UI component, and possibly one migration.
