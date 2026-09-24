# ADR-053 — Ballpark plausibility policy + question priority

Status: accepted
Supersedes nothing. Extends ADR-051 (Residential Catalog V2) and ADR-052 (two estimating modes).

## Context

"Ballpark" was drifting toward two opposite failures: bands so wide they were
useless for planning ($10K–$120K on a ~$60K project), and interviews that crept
toward detailed-estimate interrogation (stud counts, trim LF, beam specs) in
pursuit of precision the mode never promised.

Per-assumption widening (`GEOMETRY_WIDEN_PCT`, `ALLOWANCE_WIDEN_PCT`,
`UNPRICEABLE_WIDEN_PCT`) explains *why* a band is uncertain, but summing it
across a 40-line residential scope produces spreads no contractor trusts.

## Decision

1. **Plausibility policy** (`src/domains/ballpark/plausibility.ts`).
   Band width is governed by a size-aware relative window, not a fixed dollar
   width. Base relative spread falls with project size (0.46 under $5K → 0.22
   over $200K); evidence completeness (dimensions, priced coverage, allowance
   ratio, contractor corrections, media) tightens or widens that base within a
   hard ceiling (0.72) and floor (0.10 / $1,200).
   `finalizeBallparkBand()` constrains around an unchanged expected value,
   preserves the engine's low/high asymmetry, and re-checks after presentation
   rounding. Both pricing paths — the interview (`range.ts`) and the scope
   recalculation (`scopeRecalc.ts`) — end there, so they cannot drift.

2. **Question priority** (`src/domains/ballpark/questionPriority.ts`).
   Infer first, ask second. `planBallparkQuestions()` drops detailed-only
   subjects (pattern-matched), anything already inferable from project evidence,
   and anything whose expected swing is below `MIN_QUESTION_IMPACT_PCT` (4%).
   Survivors are ranked by calibrated topic impact (dimensions 35%, structural
   22%, bath type 18%, plumbing relocation 15%, finish tier 14%, …) and capped
   at `BALLPARK_QUESTION_BUDGET`. Every drop carries a reason, so a suppressed
   question becomes a disclosed assumption rather than silence.

Estimates stay deterministic and offline: no live lookups during generation.

## Verification

`src/tests/estimating/ballparkPlausibility.test.ts` (56 tests) prices twelve
fixtures from minimal realistic input — kitchen at three sizes, half /
three-quarter / full bath, tub-to-shower, basement finish, bedroom remodel,
master suite garage conversion (regression), deck, simple addition — and asserts
per fixture: no unpriced blockers, band inside its plausibility window, expected
value grounded per priced assembly, tier ordering preserved, and ≤3 questions
with dimensions never re-asked and no detailed-only leakage.

## Limitations

- Topic impact percentages are calibrated judgement, not measured from closed
  jobs; they should be re-fit once pilot actuals exist.
- The pricebook remains versioned sample data, so tests assert shape, ordering
  and ratios rather than absolute dollars.
- Evidence completeness counts media items, but does not yet weight the
  *quality* of drawings vs snapshots.
