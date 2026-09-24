# Handyman / small-service coverage

VisionWorx360 Pro is one product for remodelers, handymen and service
contractors. Small work is not a separate app and not a separate estimator —
it is the same recognize → quantify → resolve → price pipeline with a task
library, a small-job money model and a pricing-source layer sized for
service work.

Code: `src/domains/handyman/` (`tasks.ts`, `recognize.ts`, `sources.ts`,
`questions.ts`, `estimate.ts`). Tests:
`src/domains/handyman/__tests__/handymanTasks.test.ts`.

## What is covered today

~100 canonical tasks with English and Spanish labels plus natural-language
aliases, across: plumbing fixtures and repairs; electrical devices and
fixtures; drywall and plaster patching and texture; interior/exterior paint and
touch-up; flooring replacement, patching, demo and transitions; cabinet
adjustment, hardware and minor repair; doors, windows, locks, screens and trim;
decks, porches, fences and rails; siding, soffit/fascia, gutters and flashing;
bath accessories and grab bars; shelving and closet hardware; mounting and
installation; caulking and weatherproofing; minor carpentry and rot repair;
and general punch-list / haul-away work.

Voice intake decomposes a compound narration ("replace toilet, fix two cabinet
doors, patch three drywall holes, replace the porch handrail, change four
switches") into independent scope items with their own quantities and prices,
then rolls them into one visit.

## Pricing sources

Provider-agnostic layer, highest priority wins:

| Rank | Kind | Status |
| --- | --- | --- |
| 100 | `contractor_custom` | Live. Unit rate, labor + material, or flat allowance. |
| 60 | `licensed_import` | Import shape only. No dataset ships in this repo. |
| 20 | `internal_curated` | Live. Built on the existing ballpark pricebook. |
| 10 | `market_reference` | Optional, advisory, never authoritative. |

Every rate carries provenance: source id, kind, market, effective date,
version, confidence and review status.

**No proprietary pricing data is embedded.** Craftsman, RSMeans and similar
datasets are licensed products. `importedDatasetSource()` exists so a licensed
organization can load its own copy without the estimator changing. Nothing here
scrapes, copies or approximates such data, and no paid subscription is wired
up.

## What lacks trustworthy pricing

These tasks are recognised, unit-correct and estimable, but have no defensible
internal rate — they resolve to `pricing_needed` and prompt the contractor for
a unit rate, flat price, labor hours or allowance. They never contribute $0.

Toilet reset and internals, bath faucet replacement, faucet repair, garbage
disposal, angle stops, P-traps, fixture caulking, doorbells, thermostats,
plaster and corner-bead repair, subfloor repair, cabinet door/hinge/drawer/
shelf/toe-kick work, door adjustment and hardware, weatherstripping, screens
and glass, deck stairs, gate repair, deck sealing, gutter cleaning, pressure
washing, dryer vents, mirrors/medicine cabinets, TV and art mounting, safety
hardware, exterior caulking, pest blocking, blocking/backing, small built-ins,
wood rot repair, hourly punch-list work and furniture assembly.

Everything else prices from the internal curated library, which is still
sample-grade money: shape-correct, disclosed as sample data, and replaced
wholesale by contractor or licensed pricing.

## Small-job money model

- Units: EA, LF, SF, HR, DAY and allowance.
- Mobilization, setup and cleanup are **visit** costs, applied once no matter
  how many punch-list items share the trip.
- A per-occurrence labor floor keeps a fifteen-minute repair from pricing as
  0.25 h, and a service-call minimum floors the visit total.
- Every value is contractor-configurable (`ServiceMinimumConfig`); nothing is
  silently hard-coded.
- Markup / overhead / profit are unchanged: this domain returns cost and labor
  and the existing estimating engine applies the organization's uplift.
- The visit minimum is not applied while any line is still `pricing_needed` —
  an incomplete total is never dressed up as a real one.

## Questions

Zero to three per visit, ranked by cost impact, and only ever traceable to a
task actually in this punch list: fixture supply responsibility, flooring
material and area, patch size and texture, decking material, paint matching,
hidden damage, fan-rated box. When uncertainty remains, an explicit allowance
is offered instead of a longer interview.

## Product positioning

`HANDYMAN` and `PROPERTY_MAINTENANCE` already exist as business types on the
organization profile. They reorder task categories in the picker
(`suggestedCategoriesFor`) — a presentation preference only. No work is hidden
from any contractor.

## Waiting on a licensed dataset

Geography-specific labor and material rates, market/ZIP-indexed pricing and
per-task confidence intervals. The provenance fields (`market`,
`effectiveDate`, `version`, `confidence`, `reviewStatus`) are already carried
end to end so an import lands without an estimator rewrite.
