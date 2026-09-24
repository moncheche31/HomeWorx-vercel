# ADR-051 — Residential Pricing Catalog & Assemblies V2

**Status:** Accepted

## Context

The ballpark pricebook carried ~35 sample items. Whole trades a residential
remodeler sells every week — tile, cabinets, countertops, appliances, roofing,
siding, gutters, decks, concrete, fencing, water heaters, mini-splits,
accessibility work, restoration, drywall repair, general conditions — had no
price subject at all, so those scope lines surfaced as blockers instead of
money.

## Decision

1. **Catalog V2.** `src/domains/ballpark/pricebook.ts` expands to ~110 sample
   entries across the residential trades. Same canonical rules: round,
   conservative, waste-inclusive placeholder money, flagged as sample data and
   replaceable wholesale by licensed regional pricing.
2. **Assemblies, not single keys.** A scope line may expand into several priced
   parts — a tiled shower is waterproofing plus wall tile; a cabinet package is
   base plus wall run; a deck is framing plus decking. Each part is quantified
   independently so the breakdown stays explainable.
3. **Finish tiers.** `withFinishTier` scales *material* money only
   (value 0.82 / standard 1 / premium 1.38). Permits, demolition, framing,
   drywall, insulation, restoration and general conditions are tier-insensitive:
   a permit does not cost more because the client picked quartz. Labor hours
   never move with the tier.
4. **Mapping.** ~60 new deterministic, specific-first readings in
   `quantityResolution.ts`, each sized from saved geometry when available and
   from a conservative disclosed allowance otherwise, so ballpark mode always
   completes. Overlapping wording rolls up through the consolidation families.

**Coverage is not permission to guess.** A bare "demolition" line still has no
price subject, and a size is still never read as a count (ADR-048 holds).

## Consequences

- Seven representative residential scopes (bath, kitchen, basement, garage
  conversion, exterior envelope, outdoor living, aging-in-place/restoration)
  now price every line with zero blockers — enforced by
  `src/tests/estimating/residentialCoverage.test.ts`.
- Broadening coverage is a data edit: one pricebook entry plus one reading.
- Because more work is priced, bands are legitimately higher than pre-V2 saved
  snapshots; the recalculation divergence gate is what governs adoption.
