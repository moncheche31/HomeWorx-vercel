# Current-state findings: language, vision, fusion, photo referencing

Findings only. No recommendations, no code or data changes made.

## A) Language handling — English-first, Spanish partially and unevenly

The scope engine is a deterministic rules engine over regular expressions. There is no translation step and no LLM in the text path.

- `src/domains/remoteVision/lexicon.ts`: 39 feature match patterns; only 9 contain any Spanish token (baño, sótano, clóset, quitar, eléctrico, tomacorriente…). Every entry has a bilingual `label`/`scopeTitle` for display, but display strings are not what admits scope — the `match` regex is, and ~77% of them are English-only.
- `src/domains/remoteVision/ontology.ts`: `ACTION_PATTERNS` has ten action verbs. Spanish verbs appear only sporadically: remove (quitar, demoler), install (instalar, agregar, añadir), replace (reemplaz, sustitu), build (construir), relocate (mover, reubicar), repair (reparar, arreglar), paint (pintar). `clean` and `permit` have zero Spanish. Critically, the "fastening verb" enrichment added for English (attach/screw/mount/glue/staple/put up) has no Spanish equivalents (atornillar, fijar, pegar, montar, colocar are all absent) — so the exact class of phrasing that was fixed for English still fails in Spanish.
- `src/domains/scopeAdmission/admit.ts`: zero Spanish characters or terms. The Action+Object admission gate is English-only in its own logic and inherits whatever Spanish the ontology happens to have.
- Other domains are better localized: `workScope/catalog.ts`, `handyman/tasks.ts`, `scopeInterpretation/subjects.ts`, `workRecognition/patterns.ts`, and `copilot` all carry explicit `en-US`/`es-US` term sets. So Spanish coverage is inconsistent between the older recognition domains and the newer remoteVision/scopeAdmission pipeline that actually drives estimates today.
- Locale plumbing exists end to end: `RemoteVisionLocale = "en-US" | "es-US"`, `useRemoteVision` derives it from `i18n.language`, and `useSpeechCapture` sets `recognition.lang`, so Spanish dictation transcribes. But the locale is used for *output copy*, not to select a different parsing ruleset — the same English-dominant regexes run regardless.

Testing: `es-US` appears in ~20 test files, but those are copy/parity tests (i18n string presence, proposal templates, ballpark copy). Searches for Spanish narration sentences fed into `analyzeDescription()` / the admission gate return nothing. **There is no evidence any Spanish narration has ever been run through the scope regression suite.** Every scope-behavior regression test (fascia, insulation, bookcases, handyman) is English.

Practical consequence: identical Spanish narration will admit less scope than the English equivalent, and will silently under-scope rather than error.

## B) Vision — real, correctly built, but manual-trigger-only

`src/features/remote-vision/services/visionUnderstanding.server.ts` is genuine multimodal analysis, not a stub.

- **Model/API:** `google/gemini-3-flash` via the Lovable AI gateway (`/v1/chat/completions`), max 12 images, images sent as base64 data URLs alongside the transcript and confirmed measurements. Strict `json_schema` response format.
- **Output structure** (`visualUnderstanding.ts`): `observations[]` (subjectKey, object, nature ∈ observed_existing | design_intent | drawing_dimension | inferred, actionKey, mediaIds[], confidence, note), `transformations[]`, `hiddenConditionWarnings[]`, `measurementTargets[]`. Prices and unreadable quantities are structurally excluded, and the server sanitizes the result again after parsing.
- **Wiring:** exactly one call site. `RemoteVisionPage.tsx` → `useProjectUnderstanding` → `analyzeProjectMedia`. The hook's own comment states analysis is "explicitly triggered/refreshed rather than run on every keystroke."
- **Why it didn't fire on Handyman:** nothing triggers it automatically. It only runs when the contractor is on the *review* step of Remote Vision intake and presses the "Analyze N image(s)" button inside `UnderstandingPanel`. Uploading photos does not start analysis; committing an estimate does not; the ballpark flow does not. Worse, `RemoteVisionPage` has an effect that, when the media fingerprint changes, **writes `visualObservations: []` and `visualStatus: "no_media"`** to invalidate stale facts — so adding a photo actively clears prior visual facts and nothing re-runs. That is exactly the persisted `visual_status = no_media` seen on Handyman.
- **Downstream consumption:** persisted to `project_media_understanding` (per-project unique row, observations + narration + fingerprint + status). Three surfaces read it — `BallparkPage`, `BallparkRangeCard`, `MeasurementsDialog` — all through `visualObservationsToScopeText()`, which flattens each observation to a plain string used **only as scope context**. No observation ever becomes a scope item, quantity, question or price. So the output is consumed for gating/context, never for scope creation.

Net: not dead code, but effectively opt-in and easy to never trigger; and when it does run, its influence on the estimate is deliberately minimal.

## C) Fusion — authority ranking only, no phrase-to-image binding

`src/domains/remoteVision/fusion.ts` merges three inputs (deterministic text analysis, confirmed measurements, visual understanding) into `ProjectFact[]` with a six-level authority order (contractor_override > confirmed_measurement > contractor_statement > drawing_dimension > visual_observation > catalog_assumption). Visual facts are gated through the same Action+Object test as text and can only ever become reviewable candidates.

Linking is **subject-key based, not reference based**. Text facts and visual facts collide on a shared key (`scope:<featureKey>`), so a photo showing a door and narration saying "install a door" land on the same ontology subject and the text wins. That is category-level agreement, not phrase-level binding.

What does not exist:
- No resolution of deictic/anaphoric references ("that door", "the trim", "this wall", "over there") to any object.
- Text facts carry `sourceId: null` always — a transcript fact can never point at a media id.
- No bounding boxes, regions, or object instances. `VisualObservation.mediaIds` is whole-image only; there is no per-object identity, so two doors in two photos are indistinguishable.
- No transcript character offsets, so nothing can anchor a narrated phrase back to its own text span either.
- No confidence or conflict record for "narration mentions X, photos show no X" beyond the fact simply not colliding.

So C is accurately described as: visual facts can corroborate or add candidates at a subject level, but there is zero phrase-to-image binding.

## D) Photo/object referencing UI and data model — none

- `public.project_photos` has `caption`, `alt_text`, `photo_type` (existing/…), `sort_order`, and an optional `room_id`. No columns for regions, annotations, object tags, subject keys, or transcript links.
- `public.project_media_understanding` stores observations as JSONB with whole-image `mediaIds` only — no geometry, no object ids.
- No annotation table, no bounding-box storage, no join table between media and scope items/facts anywhere in the migrations.
- UI: `MediaUploadPanel` and `VideoUploadPanel` handle upload/preview only; `UnderstandingPanel` is read-only and lists facts as text with no image thumbnails and no click-to-photo link. There is no tap-a-photo-to-tag flow, no draw-a-box flow, and no way to attach a photo to a specific scope line.
- `ProposalGallery` displays photos in the proposal, but purely presentationally.

The closest existing precedent for pixel-level work is the OCR-only `measurementCapture` path, which reads printed numbers off images; it does not produce object regions either.

## Summary

| Capability | State |
| --- | --- |
| Full-sentence English narration understanding | Deterministic regex/rules; no LLM in the text path |
| Spanish narration parity | Partial (~23% of lexicon patterns, uneven verbs); never regression-tested |
| Real photo analysis | Implemented (Gemini via gateway, strict schema) |
| Photo analysis fires automatically | No — manual button on one screen only; media change clears prior facts |
| Vision output influences estimate | Context/gating only, never scope or price |
| Narrated phrase ↔ photo object binding | Does not exist at any layer |
| Object tagging UI / data model | Does not exist |
