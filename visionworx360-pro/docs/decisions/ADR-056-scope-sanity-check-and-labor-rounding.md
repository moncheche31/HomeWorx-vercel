# ADR-056 — Pre-approval scope sanity check, trade grouping and labor rounding

## Status
Accepted

## Context
A generated scope reached approval with duplicate framing, shower tile filed
under framing, leftover kitchen items in a garage bed/bath conversion, and
labor-bearing items carrying zero or token hours. Labor totals also showed
penny precision and unstable rates.

## Decision

### Scope sanity check (guardrail, not an interview)
`src/domains/scopeValidation/` runs before approval and never rewrites scope.
Rules: `duplicate` (normalized-token Jaccard >= 0.8; `16x18` == `16 x 18`),
`unrelated_scope`, `suspicious_trade` (wording vs. assigned trade),
`missing_phase`, `zero_hours` (blocker), `implausible_hours` (< 0.5 hr),
`conflicting_scope`, `foreign_context`, `untreated_item`. Hour rules only fire
when hours are known — before pricing the gate stays quiet.

`evaluateScopeApproval()` blocks approval on unacknowledged blockers; warnings
and info never hard-block. Acknowledgements are keyed to the scope
fingerprint, so any later scope change re-opens the gate.

Surface: `ScopeValidationPanel` ("Review these items before approval") above
the Approve CTA in `NarrativeScopeTab`, with Keep as is / Move to <trade> /
Remove per finding.

### Trade grouping
One normalized GC taxonomy (`tradeTaxonomy.ts`); tile outranks flooring and
framing, removal wording outranks framing, cabinets/trim/stairs fold into
finish carpentry, unknown labels stay visible as `unassigned`.

### Labor rounding
Rates normalize to the nearest $0.05; extensions compute from hours x
normalized rate; displayed extended amounts round UP to the whole dollar.
Hours are never back-solved from dollars and display rounding never feeds back
into hours or rates.

### Reconciliation
Task rows are the source of truth: task hours = trade hours = project hours,
and the same for whole-dollar labor amounts. The Labor & Hours panel shows a
green "Reconciled" line, or an internal error state when it does not match.

## Consequences
No migration or backfill: legacy snapshots re-derive normalized rates and
display amounts on read.
