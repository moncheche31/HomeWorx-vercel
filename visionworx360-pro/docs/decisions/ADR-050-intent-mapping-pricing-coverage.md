# ADR-050 — Deterministic intent mapping for estimate pricing coverage

**Status:** Accepted

## Context

A live Garage Conversion / Master Suite estimate carried 46 unmatched,
zero-cost lines against a 204-item library that already contained most of the
work. Two separate defects:

1. **Catalog gaps.** No library item existed for permits, window relocation,
   opening infill, structural posts, drywall repair measured by area, floor
   insulation, electrical/HVAC relocation, paint blending, shower
   waterproofing, niches, frameless enclosures, or baseboard remove-and-reinstall.
2. **Mapping by text overlap.** "Frame walls to code" shares no scoring words
   with "Frame interior 2x4 partition wall", so it scored zero; and where
   overlap did fire, it fired weakly (55) on the wrong item.

## Decision

Add an explicit, deterministic **intent alias** layer ahead of fuzzy scoring.

- `src/domains/estimating/pricing/intentMap.ts` is the authored source of
  truth: phrase → one assembly, several assemblies (composite), or *review*.
- `public.catalog_intent_aliases` mirrors it for `kb_apply_pricing`, which
  consults aliases first (score 90 exact / 80 contained) and falls back to the
  existing tiers unchanged.
- 21 assemblies were added to Library v1 to close the catalog gaps.

**Review is a first-class outcome.** "Install finished flooring" has no
defensible price until a material is chosen; the engine records
`ambiguous_material_selection` with a contractor-facing note instead of
guessing. Same for `ambiguous_multi_scope` and `missing_measured_quantity`.

**Integrity gates kept in SQL, mirrored in TS:**

- A contractor-confirmed catalog mapping always outranks an alias.
- An alias never prices across a unit mismatch (`unit_mismatch`); "Prime and
  paint trim" measured in SF will not be priced from a per-LF item.
- ADR-048 holds: an `each` line whose quantity exceeds 24 is held as
  `implausible_count` — "Vanity 60” double sink" at quantity 60 is a size, not
  a count.
- Composites price as the sum of their components; each component takes the
  line quantity once, crew size never multiplies labor, and the stored labor
  rate is the hours-weighted average of the component trade rates.

## Consequences

- The regression estimate went from 46 unmatched / 46 zero-cost lines to 8,
  every one of which is an explicit, explained contractor decision.
- Broadening coverage is now a data edit in one file plus a mirrored alias row.
- Phrase drift is caught by `src/tests/estimating/pricingCoverage.test.ts`,
  which also fails if an alias points at an assembly the library does not have.
