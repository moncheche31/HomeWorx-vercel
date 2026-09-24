# ADR-052 — Ballpark and Detailed are two distinct estimating modes

**Status:** Accepted

## Context

Catalog V2 (ADR-051) made it possible to price far more residential work. The
risk of that depth is that the ballpark quietly turns into a preconstruction
interrogation: more coverage invites more questions, and a "fast range" that
asks fifteen questions is neither fast nor a range.

## Decision

`src/domains/estimating/modes.ts` states the two modes as a contract, not as
copy:

| | Ballpark | Detailed |
| --- | --- | --- |
| Granularity | project/room assemblies | decomposed line items |
| Output | low / expected / high range | a priced total |
| Question budget | 6 | none |
| Unknowns | become disclosed allowances | must be priced |
| Authority | assumed by the engine | confirmed by the contractor |

**Ballpark answers one question: is this roughly a $20K, $50K or $100K job?**
It infers from project type, media, drawings, stated dimensions, scope context
and regional assemblies, and surfaces at most `BALLPARK_QUESTION_BUDGET`
high-value clarifications — the ones that could actually move the number.
Everything past the budget stays a disclosed assumption the contractor can
correct and recalculate. It never asks for exact outlet counts, beam specs or
material SKUs. When uncertainty is genuinely high the band widens and says why
rather than faking precision.

**Detailed is a progression, never a restart.** `DETAILED_INHERITED_FACTS`
enumerates what carries over: client, property, project, notes, measurements,
geometry, media, scope, assumptions, answers and the saved ballpark range.
Conversion flips `intake_mode` on the same estimate row behind an explicit
confirmation — nothing is recreated, nothing converts silently, and the
original band stays in history for comparison.

**One catalog, two granularities.** There is no separate ballpark price
library; the difference is how coarsely the same assemblies are applied and who
confirms the numbers.

## Consequences

- "Build Detailed Estimate" is a visible action on a saved ballpark, not a
  buried menu item.
- Each mode states its own promise in EN and ES: ballpark emphasises speed,
  assumptions and adjustability; detailed emphasises confirmed scope,
  quantities and line items.
- `src/tests/estimating/estimatingModes.test.ts` holds the line: budget
  adherence for kitchen / bath / garage / basement, a usable range under
  ordinary unknowns, widening under sparser input, explicit inheritance, and
  EN/ES parity.
