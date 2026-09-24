# ADR-062 — One authoritative cost pipeline for ballpark and detailed pricing

**Status:** Accepted

## Context

The live Master Suite Garage Conversion showed a ballpark of
$75,833 / $90,970 / $109,167 while its own estimate lines totalled $24,708 of
direct cost. The snapshot was not stale: it had just been recomputed with
`source: "scope_recalc"`, which re-priced the structured scope through the
sample pricebook and produced a $54,582 job cost. Two authoritative costing
paths were live for the same estimate, so the two numbers could never agree.

## Decision

1. **One pipeline.** `refreshBallparkFromCanonicalLines` derives the band from
   the estimate's canonical cost lines whenever any exist. The scope pricer
   (`recalculateBallparkFromScope`) survives only to bootstrap a first band for
   an estimate that has no lines yet.
2. **Reconciliation is proven, not asserted.** The band's expected value *is*
   the detailed selling price; `reconcileBandToCanonical` stores the delta in
   the snapshot and it must be `0`.
3. **Composite exclusivity.** `resolveCompositeExclusivity` rolls declared
   atomic children (bath supply lines, basic circuits, subfloor prep) into
   their composite parent. Children stay visible for audit and contribute $0.
4. **Uncertainty, not extra scope.** Low/High are an uncertainty percentage
   around one invariant job cost, widened by assumed quantities, unresolved
   scope and unconfirmed measurement fields.
5. **Cost-basis invariants everywhere.** `applyCostInvariants` forces permits
   and inspections to zero labor and bills design/engineering as professional
   services on the scope path too, matching the database triggers.
6. **Market sanity is advisory.** `evaluateMarketSanity` flags $/SF outliers
   against 2026 benchmarks and never changes a dollar.

## Consequences

- The garage rebuilt to $32,816 / $41,180 / $49,544 on a $24,708 job cost with a
  $0 reconciliation delta; the inflated band is kept as history.
- Quarter-hour labor and whole-dollar money invariants are unaffected.
- Regression coverage lives in
  `src/tests/regression/canonicalCostPipeline.test.ts`.
