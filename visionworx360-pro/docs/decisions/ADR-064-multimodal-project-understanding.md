# ADR-064 — Multimodal Project Understanding

**Status:** Accepted

## Context

Remote Vision only ever read the contractor's words; media contributed a
bounded confidence boost (ADR-035). That produced scope gaps on photo/rendering
jobs and no auditable account of *why* the app understood a project a given way.

## Decision

1. **Real pixel analysis.** `analyzeProjectMedia` (server function) sends the
   current project's photos, renderings, plans and video keyframes to
   `google/gemini-3-flash` through the Lovable AI gateway with a strict JSON
   schema. The key never reaches the browser; images are size- and count-capped.
2. **Media authority is typed.** Before photos = existing conditions,
   renderings = design intent, plans = dimensional evidence.
   `sanitizeUnderstanding` enforces this and demotes hidden-condition claims
   (load bearing, asbestos, concealed wiring) to warnings — never observations.
3. **Fusion with a fixed authority order.** Contractor override > confirmed
   measurement > contractor statement > drawing dimension > visual observation >
   catalog assumption. A visual observation alone is never priced scope; it is a
   candidate the contractor confirms.
4. **Construction ontology.** `ontology.ts` types subjects across all
   residential trades with trade, unit family, action verbs, context-only
   patterns and dependencies. Work requires action + object; a subject named
   only inside a location or grade span ("behind that range hood",
   "paint-grade trim") creates no scope.
5. **Subject-aware measurement binding.** A measurement binds only to a subject
   with the same unit family, so linear feet can never become counts and room
   area can never become shower tile.
6. **Transparency.** "How VisionWorx understood this" lists every fact with its
   evidence, status (confirmed / inferred / assumed / design intent) and
   authority. It is auditable, never a mandatory questionnaire.

## Consequences

- Visual analysis is explicitly triggered and its status always stated; failure
  degrades to text + measurements rather than silently inventing facts.
- All prior invariants stand: whole-dollar money, 0.25 hr labor increments,
  project isolation, evidence-first quantities, no $0 quotes for real scope.
