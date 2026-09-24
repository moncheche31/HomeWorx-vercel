# Audit — "Estimate from Photos or Video" (Remote Vision)

Route: `src/routes/app.remote-vision.tsx` → `src/features/remote-vision/pages/RemoteVisionPage.tsx`.
The six buttons come from one array in that page: `STEPS = ["media","details","describe","review","estimate","scope"]`, labeled in `src/i18n/locales/en-US/remote-vision.json` as Upload / Details / Describe / Assumptions / Estimate / Scope of Work. They are free navigation buttons, not a gated wizard.

## 1. What each step actually does

| Step | Component | Function |
|---|---|---|
| Upload (`media`) | `VideoUploadPanel`, `MediaUploadPanel` | Walkthrough video (keyframes, client-side) + photos. Photos go through `useRemoteVisionMedia` → real upload → `project_photos`. |
| Details | `ProjectDetailsPanel` | Voice note (dictation), typed notes, room dimensions (`MeasurementInput`). These are treated as contractor *facts*. |
| Describe | `DescribePanel` | One free-text/dictated project description; "Analyze" just jumps to `review`. |
| Assumptions (`review`) | `GroundedScopePanel`, `DetectedFeaturesPanel`, `InputLedgerPanel`, `AssumptionsPanel`, `RemoteQuestionsPanel` | The real interpretation screen: grounded scope buckets, sanity gate, input provenance ledger, editable assumptions, clarification questions. |
| Estimate | `ScenarioCards` | Displays three computed scenario ranges; `onSelect` only stores `selectedLevel`. No estimate record is created. |
| Scope of Work (`scope`) | inline in page | Renders the *generated* narrative (`rv.displayText`), allows edit/regenerate/approve, and shows the customer-facing version after approval. It is not an input step. |

## 2. What persists

- **Persists to the project:** photos only (`project_photos` via `mediaPersistence.ts` / `useRemoteVisionMedia`).
- **Everything else is browser-local:** `useRemoteVisionSessionStore` writes the whole session to `localStorage` key `vwx.remoteVision.session.<projectId>` — description, voiceTranscript, typedNotes, dimensions, assumptionOverrides, answers, removedFeatureKeys, editedNarrative, approvedNarrative, approvedAt, selectedLevel.
- **No writes** to `project_narrative_scopes`, `scope_items`/`scope_sections`, `project_measurements`, `project_notes`, or `estimates`. Cross-file check confirms nothing outside `src/features/remote-vision` and `src/domains/remoteVision` imports this session.

## 3. What actually feeds AI/derivation

`useRemoteVision` merges description + voiceTranscript + typedNotes + dimensionsText via `mergeIntakeText` (`src/domains/remoteVision/context.ts`) into `intakeText`. That single string plus `session.media` drives `analyzeDescription` → `buildAssumptions` → `buildScenarios` / `buildQuestions` / `buildRemoteNarrative`. Media contributes only a confidence boost and observation rows (`buildInputLedger` marks media `contractorConfirmed: false`); measurements become facts via `buildMeasurementFacts`. So Details and Describe are equal-weight text inputs into the same pipeline; the split is presentational only.

## 4. Why the project shows "no scope of work"

`useProjectIntakeState` (`src/features/crm/hooks/useProjectIntakeState.ts`) judges a project by three durable sources: the `project_description` note (`project_notes`), non-archived `scope_items`, and non-archived `estimates`. Remote Vision writes none of them. Approving in the Scope step only sets `approvedNarrative`/`approvedAt` in localStorage. The project is therefore still "unstarted" and shows no scope of work — and the work is lost on a different device, another browser, or cleared storage.

## 5–7. Redundancy, overlap, voice

- **Describe vs Scope of Work:** conceptually redundant to the user (both look like "the words of the job") but technically opposite — Describe is raw input, Scope of Work is generated output. The naming is the defect, not the existence of both.
- **Details vs Describe:** genuinely overlapping. Both collect free text with the same dictation control and both are concatenated by `mergeIntakeText`; only the measurement inputs are unique to Details.
- **Voice today:** `useDictation` + `DictationControl` in `ProjectDetailsPanel` (voice note) and `DescribePanel` (description). No voice on Upload, Assumptions, Estimate, or Scope review.

## Proposed UX architecture (4 steps)

```text
1 Capture      photos / video  +  one voice-first "Tell me about the job" field
                 (dictation, typed fallback, measurements inline)
2 Review Scope  grounded scope buckets + provenance + assumptions + clarifying Qs
3 Estimate      scenario ranges, pick level
4 Scope of Work generated narrative → edit → Approve  (approval = the save point)
```

Changes implied:
- Merge **Details + Describe** into a single Capture step: one dictation surface writing to `description`, typed notes and dimensions as optional sub-sections. Keeps `mergeIntakeText` untouched.
- Rename the `review` step label from "Assumptions" to "Review Scope"; it already is the interpretation screen.
- Rename `scope` to "Scope of Work (generated)" and make Approve the durable commit.
- Wizard behaviour: gate Next on the minimum each step needs, and land the user on the furthest completed step instead of always `media`.

Durability (the fix for #4), reusing existing infrastructure:
- On approve, persist the narrative through `saveNarrativeScope` (`narrativeScope.functions.ts`) into `project_narrative_scopes`, and the raw intake text as the `project_description` note via `useProjectDescriptionNote` — both already exist and are what `useProjectIntakeState` reads.
- Persist dimensions into `project_measurements` rather than localStorage only.
- Keep localStorage as the in-progress draft cache, with the database authoritative on load (the same pattern already used for photos).
- Optionally create a ballpark `estimates` row when a scenario level is selected, so Continue Estimate actions can resume it.

No code changes made — audit only.
