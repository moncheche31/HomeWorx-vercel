# ADR-059 — Generic Work Recognition and Quantity Authority

Status: Accepted

## Context

The cabinet-run fixes (ADR-058) solved a real problem — overall stated geometry
prices the job, component detail only refines it — but they solved it inside
cabinet-specific code. Every other trade still fell back to per-room catalog
defaults, so a 12x16 deck, a 12x14 room of flooring, and a 1,200 sq ft roof all
priced from a number nobody measured. Trades also disagreed on units, sanity
thresholds only protected linear feet, and negative scope ("no painting") was
handled by a short hard-coded list.

## Decision

Introduce `src/domains/workRecognition` — a trade-agnostic layer that turns
contractor intent + geometry + media into priced quantities. Adding a trade
means adding a row to `patterns.ts`, never a new code path.

### Pieces

- `units.ts` — unit families (area, length, count, volume, opening, fixture,
  circuit_device, room_zone, assembly), family-aware pricing rounding, and
  plausibility ceilings that scale with the job's own established area.
- `geometry.ts` — one parser for zones (`12x16`, `12 by 14`, `1,500 sq ft`,
  ceiling heights) and one set of derivations every trade reads from: floor
  area, wall area (perimeter x height less openings), perimeter, roof area
  (footprint x pitch factor), volume, waste.
- `patterns.ts` — declarative work patterns: subject, canonical catalog trade,
  unit + family, default action, whether an action is required, derivation
  strategy, waste, disqualifiers, allowance, standing assumption.
- `recognize.ts` — clause splitting, action-verb resolution, stated counts, and
  generic negative-scope detection.
- `resolve.ts` — the single authority hierarchy.
- `sanity.ts` — quantity plausibility by unit family, not by trade.

### Authority hierarchy (identical for every trade)

1. Contractor-confirmed durable measurement
2. A number the contractor stated in that clause
3. Geometry derived from 1/2 via the trade's derivation strategy
4. Media evidence (contextual only — never overrides 1-3)
5. Industry allowance (last resort, always disclosed and surfaced as a
   clarification)

### Invariants

- `quantity` is exact geometry and is never rounded or waste-inflated;
  `pricingQuantity` carries waste and family rounding.
- A subject without an action verb is an observation, never priced.
- Excluded work is dropped with the evidence recorded, not silently missing.
- Every pattern maps to a canonical `catalog_assemblies.trade_key` and a known
  unit key — enforced by test.

### Integration

`scopeGrounding/derivedGeometry.ts` bridges the engine into the existing
grounding path: when a lexicon keyword hit would have used a catalog default,
a matching geometry-derived quantity of the same unit family replaces it, with
provenance and assumptions attached. Cabinet run logic (ADR-058) is unchanged
and still runs first.

## Consequences

- Deck, painting, flooring, roofing, siding, drywall, framing, trim, built-ins,
  windows, doors, plumbing, electrical, HVAC, concrete and demolition all price
  from the same reasoning.
- Sanity is now generic: an implausible quantity is caught in any unit family.
- Coverage lives in `src/tests/regression/workRecognition.test.ts`.
