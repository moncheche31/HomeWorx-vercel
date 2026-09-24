# ADR-032 — Deterministic Voice-First Scope Capture (Module 009)

Status: Accepted — Version 1

## Context

Contractors need to capture scope while walking a job. Version 1 must not depend
on AI interpretation or external AI services, and the estimating engine built in
Module 008 must remain the single calculation source of truth.

## Decision

1. **Speech input uses the browser Web Speech API only.** No audio leaves the
   device and no transcription service is called. When recognition is missing or
   blocked, the transcript textarea remains fully usable (type/paste/edit), and
   the partial transcript is persisted per project in `localStorage` so a
   walkthrough can be resumed later.
2. **Parsing is deterministic and pure.** `src/domains/voiceCapture/parser.ts`
   segments utterances and detects rooms, actions, quantities (digits and spoken
   number words, English and Spanish), units, and measurements with fixed rules
   and lexicons. Measurements are stored verbatim (`raw` + parsed values) and are
   never interpreted into areas or quantities.
3. **Knowledge Base matching is lexical.** `matching.ts` scores token overlap
   against assembly work items and keywords. Ties within 0.08 are marked
   ambiguous, left unassigned, and flagged for review. Unmatched utterances
   become Custom Draft Items.
4. **Confidence gates selection.** High / medium / low is derived from match
   score, ambiguity, presence of an action verb, and utterance length. Only
   high-confidence drafts are preselected.
5. **Nothing reaches the estimate without confirmation.** Drafts live in
   component state until the contractor confirms. On confirm, items are inserted
   through the existing scope services (`createScopeSection` /
   `createScopeItem`), so the estimating engine picks them up through the normal
   scope → estimate sync. No duplicate calculation logic exists in this module.
6. **Future capabilities are interfaces only.**
   `src/domains/voiceCapture/extensionPoints.ts` declares
   `ScopeInterpretationProvider`, `PhotoRecognitionProvider`,
   `VideoRecognitionProvider`, `AutomaticMeasurementProvider`,
   `DrawingRecognitionProvider`, `CodeComplianceProvider`, and
   `VoiceTranslationProvider`. None are implemented in Version 1.

## Consequences

- The parser is synchronous, side-effect free, and unit tested, so a future
  AI-backed `ScopeInterpretationProvider` can replace it behind the same
  contract without touching UI or estimating code.
- Recognition quality is bounded by the browser. This is accepted for Version 1
  because manual transcript editing is always available.
- Voice drafts are written as `draft` scope items with
  `confidenceStatus = needs_verification` unless high confidence, keeping the
  contractor in control of what is priced.
