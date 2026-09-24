# ADR-061 — Contractor pricing method: target gross margin vs. overhead + profit

## Status
Accepted.

## Context
Contractors mark jobs up in two incompatible ways. Applying both at once
double-charges the client and hides the real margin.

## Decision
A single `method` field decides pricing. The two methods are mutually
exclusive by construction — there are no independent toggles.

**A. `target_gross_margin` (recommended default for new companies)**
`sellingPrice(before tax) = jobCost / (1 - targetGrossMarginPct/100)`
`grossProfit$ = sellingPrice - jobCost`
Line overhead/profit percentages are zeroed and the gross-up is distributed
across lines so line totals reconcile to the roll-up.

**B. `overhead_profit` (legacy, unchanged)**
Overhead = % of direct cost. Profit = % of (direct cost + overhead).

**Contingency** is a COST layer in both methods. It is computed before the
pricing method and is part of `jobCost`, so it is counted exactly once and is
never marked up twice.

Tax always applies last, to the selling price.

## Scope of the setting
- Company default: `organizations.default_pricing_method` +
  `default_target_gross_margin_pct` / `default_overhead_pct` /
  `default_profit_pct`.
- Per-estimate override: `estimates.pricing_method` +
  `target_gross_margin_pct`, applied at insert by a BEFORE INSERT trigger that
  only fills values the caller did not choose.
- Existing estimates keep `overhead_profit` with their saved percentages: no
  saved estimate is ever silently repriced. Changing the method shows a
  deliberate before/after selling-price preview and only reprices on save.
- Ballpark and detailed modes price with the SAME method.

## Benchmarks (not standards, not endorsements)
Presets 30 / 33 / 40% are labelled as benchmarks and published guidance with
attribution and source links (NAHB 2024 remodeler average; Qualified Remodeler
contributor benchmarks). The UI states there is no universal overhead/profit
pair, and that the required gross margin follows from company overhead plus the
desired net profit.

## Visibility
Method, job cost, gross profit $ and realized margin % are contractor-internal
only (`proposal-no-print`); no proposal, share link or PDF renders them.

## Tests
`src/tests/estimating/pricingMethod.test.ts` — math, mutual exclusivity,
contingency-once, tax ordering, legacy invariance and per-estimate isolation.
