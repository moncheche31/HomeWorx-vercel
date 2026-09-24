# ADR-066 — One band writer, fail-closed RPCs, and no $0 "resolved" line

Status: accepted
Supersedes nothing. Enforces ADR-062 at the database layer.

## Context

The forensic audit found three defects that survived every prior "universal
repair" because each repair fixed one implementation while another kept
writing:

1. Nine `SECURITY DEFINER` mutation functions were `EXECUTE`-able by `anon`.
   Their guard (`IF auth.uid() IS NOT NULL AND NOT is_org_member(...)`) is
   deliberately permissive so trusted server-side calls with no `auth.uid()`
   work — which means anonymous callers skipped the check entirely.
2. Two engines wrote `estimates.range_snapshot`: the JS canonical cost graph
   (`source: "canonical_lines"`) and the SQL `rebuild_estimate_ballpark`
   (`source: "detailed_invariant_cost"`, flat heuristic spread), the latter
   firing from triggers on every ordinary line edit. ADR-062 held in JS only.
3. `enforce_estimate_line_cost_basis` marked any contractor-owned line
   `resolved` with no dollar-amount test, so a phantom price override
   produced a resolved $0 line. Four such lines existed in production.

## Decision

**Authorization is grant-level, not body-level.** `anon` and `PUBLIC` lose
`EXECUTE` on every `SECURITY DEFINER` function in `public`; `authenticated`
and `service_role` keep it. The permissive in-body guard stays, because it is
what allows trusted server-side (service-role) calls; the exposure was the
grant, not the guard.

**One band writer.** When an estimate has any non-archived line, or its saved
snapshot has `source: "canonical_lines"`, the SQL trigger no longer computes a
band. It stamps `range_snapshot.needsCanonicalRefresh = true`. The canonical
JS pipeline is the only writer of the authoritative band and clears the marker
whenever it runs. Line CRUD (`createEstimateLine`, `updateEstimateLine`,
`archiveEstimateLine`) now re-runs `refreshBallparkFromCanonicalLines` itself,
so ordinary editing keeps the band correct instead of leaving it to a second
engine. A refresh failure never fails the edit; the band is marked stale.
An estimate with no lines and no canonical snapshot may still be bootstrapped
by the SQL/intake path.

**A resolved line must carry money.** `resolved` now requires real labor time
priced at a real rate, or a real material / equipment / subcontract / other
cost — or an explicit `pricing_provenance.noCharge = "true"` intent. A
contractor-owned line with none of these is held `unresolved` with reason
`contractor_price_missing`; a system-priced one gets `zero_priced`. A labor
rate with zero hours is not a price. This is a write-path trigger, not a
periodic sweep, so the state is unreachable rather than merely cleaned up.

**Structural integrity.** `estimate_line_items.project_id` has a real foreign
key to `projects`, and `validate_estimate_line_item` rejects a line whose
`scope_item_id` belongs to a different project.

**Explicit pricing method is a decision.** `apply_org_pricing_method_defaults`
no longer treats an explicit `overhead_profit` choice with a zero target
margin as "unset"; it only fills in a NULL method, and otherwise supplies just
the missing overhead/profit percentages.

## Consequences

- Four live production lines moved from resolved-$0 to
  `contractor_price_missing` and now surface for contractor review.
- Any estimate whose lines change outside the JS path shows a stale-band
  marker instead of a silently divergent number.
- Remaining audit items (session value-store consolidation, 83-column line
  provenance, pgTAP coverage of the pricing triggers) are unaddressed and
  tracked from the audit document.
