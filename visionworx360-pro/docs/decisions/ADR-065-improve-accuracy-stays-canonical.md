# ADR-065 — "Improve accuracy" refines facts; the canonical pipeline still owns price

**Status:** Accepted

## Context

`BallparkRangeCard` advertised "N key details missing" from a high-value subset,
while `/app/ballpark?resume=inputs` re-opened a broader question set — the count
never matched the cards. Worse, completing that pass called `persistComplete`,
writing an intake-derived `rangeSnapshot` (from `buildBallpark` /
`buildMultiInputBallpark`) onto an estimate that already had canonical cost
lines. That violates ADR-062 (one authoritative cost pipeline) and defeats
ADR-047, because a credible saved band could be replaced by a second engine's
number right after a clarification.

## Decision

1. **One clarification selector.** `selectImproveAccuracyQuestions` /
   `improveAccuracyQuestionIds` (`src/domains/ballpark/improveAccuracy.ts`) are
   used by both the card (count) and the page (frozen question set).
2. **Facts first, then the owning pipeline.**
   `refreshBallparkAfterClarification` saves nothing itself: geometry is stored
   as a project measurement, `repair_estimate_pricing` re-derives canonical
   quantities/labor, then `refreshBallparkFromCanonicalLines` rebuilds the band.
3. **No intake overwrite.** When the server reports `hasCanonicalLines`, the page
   persists session continuity only. An estimate with no canonical lines may
   still bootstrap its first band from the intake/scope pricer.
4. **Gate on the canonical path too.** A credible band is never replaced by a
   zero or admittedly-incomplete candidate, and a clarification round is subject
   to the 2.5× divergence check. `contractorInitiated` clears only the
   "unreconciled scope" block; the new `assumptionCorrection` flag (an explicit
   typed quantity) is the sole divergence bypass. Blocked candidates leave the
   prior band current and flag `needsReview` with `pendingRecalc`.

## Consequences

- The advertised count equals the number of cards asked.
- Pricing settings, target margin, labor settings, cost bases and band position
  survive a clarification round untouched.
- Coverage: `src/tests/regression/improveAccuracyCanonical.test.ts`.
