# ADR-036 — Contractor Copilot as a read-only review layer

Status: Accepted — Module 013

## Context

Contractors forget standard items (protection, cleanup, disposal), miss
follow-on work (a beam after a wall comes out), rarely present upgrades, and
have no fast way to build a Good / Better / Best proposal. We need help that
does not take control away from them, and does not destabilise the estimating
engine (Module 008), Narrative Scope (Module 010B) or Remote Vision (011).

## Decision

The Copilot is a **separate domain** (`src/domains/copilot`) that *reads* a
projection of the finished scope and *returns recommendations*. It never
mutates scope records, never runs pricing math, and never rewrites narrative
prose. `reviewProject()` is a pure function over deterministic, human-authored
catalogs — no AI, no network, no database in Version 1.

Four sections, fixed order:

1. `standard_items` — quietly added, defaults to **accepted** (still removable).
2. `missing_scope` — trigger-matched omissions, always **pending**.
3. `upsell` — optional upgrades, always **pending**.
4. `value_engineering` — downgrade ladders (best → good) with indicative
   percentage savings only; the estimating engine remains the price authority.

Confidence is its own vocabulary — `high`, `medium`, `optional`,
`contractor_decision` — rather than reusing the scope-item confidence type,
because the meanings differ (required vs. verified).

Decisions persist locally (`useCopilotDecisionStore`), matching the local-first
pattern of Modules 009/010B/011. No schema change is required for Version 1.

Two presentation modes. Customer mode renders only accepted recommendations,
uses the `customerLabel` / `customerRationale` strings, and is guarded by
`containsInternalTerms()` in tests so estimating vocabulary ("markup",
"allowance", "forgot", "missing") can never reach a homeowner.

Provider seams live in `extensionPoints.ts` and `registry.ts`: computer vision,
historical estimates, regional norms, manufacturer catalogs, building codes and
user behaviour. None are implemented; a future provider swaps in through
`registerCopilotProvider()` with no UI change.

## Consequences

- The contractor always has final approval; nothing is added silently to the
  estimate.
- Rules are auditable and testable, and behave identically offline.
- Catalog coverage is limited to authored rules; broadening coverage is a data
  edit in `catalog.ts`, not a code change.
- Copy is bilingual at the domain source, so recommendations stay UI-free.
