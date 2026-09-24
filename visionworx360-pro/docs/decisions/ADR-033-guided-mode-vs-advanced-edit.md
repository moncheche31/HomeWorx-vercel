# ADR-033 — Guided Mode vs Advanced Edit (Module 010)

Status: Accepted — Version 1

## Context

The manual Scope Builder (Modules 005–006) is powerful but tap-heavy for a
contractor standing in a room. Module 010 adds a guided, voice-first
walkthrough without creating a second scope or estimating system.

## Decision

1. **Two experiences, one data model.** Guided Mode (`/app/walkthrough`) and
   Advanced Edit (the existing Scope tab) read and write the same
   `scope_sections` / `scope_items` rows through the existing
   `useScopeMutations` services. The Module 008 engine stays the single
   calculation source of truth. Guided Mode adds no tables, no RPCs, and no
   parallel math.
2. **Guided Mode is a step machine, not a page.**
   `src/domains/walkthrough/machine.ts` is a pure state machine over
   `project → room → capture → questions → review → summary`. Each step renders
   only its own controls; the manual editor is never shown inside the flow.
3. **Smart defaults over prompts.** Room, trade, category, subcategory, unit and
   section are inferred from the selected project, the current room, the
   deterministic Module 009 parser and Knowledge Base matches. Those fields are
   never asked in Guided Mode; they remain editable in Advanced Edit.
4. **Questions are derived, deterministic and skippable.**
   `questions.ts` emits one question per genuinely missing value (quantity,
   size, room, action, labor scope, allowance, ambiguous match). Skip / Not sure
   / Review later are always available and mark the draft `needsReview` instead
   of blocking the save.
5. **Duplicate prevention is explicit.** `draftDedupeKey` (room + normalized
   title) plus a persisted `committedKeys` list guarantees that resuming,
   re-reviewing, or retrying a commit never inserts the same item twice.
6. **Session recovery is local-first.** The full snapshot (project, room, step,
   capture language, transcript, drafts, answers, committed keys, completed
   rooms) is written to `localStorage` on every change, so refresh,
   backgrounding, a phone call, sleep or network loss all resume cleanly.
7. **Bilingual capture, single-language UI.** The contractor picks the spoken
   capture language (`en-US` / `es-US`) before recording; the interface follows
   the display language only. Transcripts and authored scope content are never
   auto-translated (ADR-028).
8. **Analytics are counts only.** `features/walkthrough/analytics.ts` strips any
   free-text payload; transcript text and customer data are never emitted.
9. **Vision stays an interface.** Photos attach to project/room through the
   existing photo services; the Module 009 `PhotoRecognitionProvider` and
   `VideoRecognitionProvider` interfaces remain unimplemented.

## Consequences

- Switching modes cannot desynchronize data, because there is only one record
  set; Advanced Edit is simply the unfiltered view of the same rows.
- Guided Mode intentionally cannot express every field. Anything it can't
  capture is left at a sensible default and flagged for Advanced Edit.
- Because commits go through the normal scope services, activity logging, RLS
  tenancy and estimate sync all apply with no additional code.
