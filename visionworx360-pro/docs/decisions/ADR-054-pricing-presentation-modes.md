# ADR-054 — Estimate pricing presentation modes and small-job economics

## Status
Accepted.

## Decision
One estimate can be sold three ways without being rebuilt:

- `total` — one price (or one ballpark range), no breakout.
- `labor_materials` — labor and material subtotals plus the combined total.
- `labor_only` — the contractor supplies labor, the owner supplies materials, so
  material sell money is excluded from the customer price.

Pricing mode is stored on `estimates.pricing_mode` (default `total`) and is a
**sell/presentation** decision only. Scope, quantities, assumptions, answers,
assemblies, the labor model and pricing history are identical in every mode.

### Labor-only is never engine amnesia
The engine keeps resolving the complete assembly — material quantities, demo,
protection, prep, handling, disposal and sequencing all continue to drive labor
hours. Labor-only only removes material SELL money, and adds a disclosed
handling adder (`OWNER_SUPPLIED_HANDLING_PCT = 5%` of labor) for receiving and
staging owner-supplied material.

### No double counting
`presentPricing()` pro-rates overhead, profit, contingency and tax across the
direct-cost buckets, so labor + material + other + handling always equals the
presented total. `presentBand()` scales a ballpark band by the same factor, so a
labor-only ballpark stays a ballpark and never becomes a pretend time sheet.

### Customer disclosure stays the contractor's call
`ProposalSettings.pricingDisclosure` (`total_only`, `category_subtotals`,
`labor_materials`, `labor_only`, or null = follow the estimate) decides how much
the customer document shows. Default remains one total.

### Small jobs
`src/domains/ballpark/smallJob.ts` adds mobilization and service-call minimum
economics below a $3,500 job threshold, so a door swap or a drywall patch is not
priced as a fraction of a remodel. Small-job economics are a sell-price layer and
can be switched off for raw unit-math checks.

## Coverage added
Handyman-scale resolution: partition framing falls back to a disclosed allowance
when no geometry exists, and support posts/columns now match the structural
subject instead of dropping out unpriced.

## Verification
`src/tests/estimating/pricingModes.test.ts` (45 tests) covers kitchen labor-only,
bathroom labor + materials, drywall/paint repair, door replacement, small
plumbing and electrical work, trim/built-ins, minor framing, structural one-offs,
mode-switch preservation, disclosure control and persistence defaults.
