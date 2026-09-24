# ADR-035 — Remote Vision Estimate (photo + rendering + voice)

**Status:** Accepted — Module 011, Version 1

## Context

Contractors need a preliminary estimate without a site visit: the homeowner
sends photos/renderings, the contractor describes the renovation, and the app
returns ranges. This must not disturb the walkthrough workflow (Module 010) or
the estimating engine (Module 008).

## Decision

1. **A second workflow, not a replacement.** `/app/remote-vision` sits beside
   `/app/walkthrough`; both end at the same narrative Scope of Work
   (Module 010B) and can feed the estimating engine.
2. **No AI in Version 1.** `analyzeDescription` is a deterministic keyword-rule
   analyzer over the contractor's own words; media only contributes a small,
   bounded confidence boost. `isDeterministicVisionOnly()` reports this to the
   UI, which states it plainly to the contractor.
3. **AI-ready abstraction.** `VisionAnalysisProvider` plus the extension-point
   interfaces (image recognition, rendering comparison, object/material/room
   detection, finish recognition, quantity estimation) let a real vision model
   be registered later with no caller changes.
4. **Assumptions are explicit and overridable.** Every gap becomes a typed
   `Assumption` with the basis for the guess, shown and editable in the UI.
5. **Ranges, not prices.** Economy / Mid range / Premium scenarios carry a
   low–high band, labor hours, duration and a confidence score. Final math
   remains the responsibility of the Module 008 engine.
6. **Local-first sessions.** Media metadata, description, assumptions, answers
   and approvals persist in `localStorage`; no schema changes in this module.

## Consequences

- Preliminary numbers must never be presented as a firm quote.
- Adding a vision model is an implementation swap in `registry.ts`.
- Persisting remote-vision sessions server-side is deferred to a later module.
