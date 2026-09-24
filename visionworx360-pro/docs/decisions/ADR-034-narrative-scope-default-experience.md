# ADR-034 — Narrative Scope of Work as the Default Contractor Experience (Module 010B)

Status: Accepted — Version 1

## Context

The estimating engine (Module 008), Knowledge Base (007B), scope data model
(005/006), voice capture (009) and guided walkthrough (010) are correct, but the
contractor-facing surface reads like traditional estimating software. The
default experience must feel like talking to an experienced project manager.

## Decision

1. **The narrative layer is presentation only.** `src/domains/narrativeScope/`
   is pure and deterministic: it renders existing `scope_sections` /
   `scope_items` rows as prose and detects missing decisions. It performs no
   math, writes no records, and adds no tables, RPCs or migrations.
2. **Narrative Scope of Work is the default screen.** The project workspace
   opens on the Scope of Work tab (`NarrativeScopeTab`). The full Scope Builder
   is reachable in one tap through **Advanced Edit** and is unchanged.
3. **Six actions only.** Approve Scope, Edit Wording, Answer Questions,
   Regenerate, Create Estimate, Advanced Edit (plus Preview Proposal). Every
   other control lives in Advanced Mode.
4. **Questions are derived, not authored.** `questions.ts` emits one question
   per genuinely missing value (selection, allowance, count, quantity, customer
   decision) using fixed lexical rules — no AI interpretation in Version 1.
5. **Wording, answers and approval are local-first.** Stored per project in
   `localStorage` (`vwx.narrativeScope.v1.<projectId>`) so the database stays
   unchanged. Scope records remain the source of truth; regenerating always
   reproduces the same text from those records.
6. **Proposals read the approved narrative.** `/app/proposals` and the proposal
   preview render the approved text with `audience: "customer"`, which excludes
   items not marked client-visible. No estimating terminology is emitted.
7. **Bilingual by construction.** Action verbs, unit labels and connective
   phrases have en-US and es-US lexicons; the narrative follows the display
   language. User-authored content is never auto-translated (ADR-028).

## Consequences

- The estimating engine, Knowledge Base and calculations are untouched; the
  narrative is a read-only projection that can be regenerated at any time.
- Contractor edits to wording are intentionally overwritten by Regenerate; the
  structured records, not the prose, remain authoritative.
- A future `ScopeInterpretationProvider` (ADR-032) can replace the deterministic
  sentence builder behind the same pure function signature.
