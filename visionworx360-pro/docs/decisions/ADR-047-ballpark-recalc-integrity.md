# ADR-047 — Ballpark recalculation integrity gate and narrative↔scope reconciliation

**Status:** Accepted

## Context

A Garage Conversion project produced a new Ballpark of ~$454,350 expected
($285,500–$650,000) after the Scope of Work narrative was rewritten. The saved,
credible band was $34,500–$43,000. Root cause: narrative interpretation only
diffed sentence-to-sentence, so structured scope from an earlier, unrelated
scope (kitchen work) stayed included and was priced again on every refresh.
The recalculation then replaced the saved snapshot unconditionally.

## Decision

1. **Reconciliation** (`src/domains/scopeInterpretation/reconcile.ts`): included
   scope items that the *current* narrative never describes are surfaced as
   proposed removals with reason `notInNarrative`. They are exclusions, never
   deletions, and always require explicit contractor confirmation.
2. **Integrity gate** (`src/domains/ballpark/recalcGate.ts`): a scope-derived
   band is rejected when unreconciled scope remains, or when it diverges
   implausibly from the last credible band. The prior snapshot is preserved and
   flagged `needsReview` instead of being overwritten.
3. **Surfacing**: `readBallparkReview` exposes the held state and
   `BallparkRangeCard` shows "Pricing needs review" (EN/ES) with the last
   credible range still displayed.

## Consequences

- A wildly wrong number can no longer replace a credible saved ballpark.
- Stale scope is visible and reviewable rather than silently priced.
- Issued/locked estimates and historical snapshots remain immutable; nothing is
  deleted as part of reconciliation.
