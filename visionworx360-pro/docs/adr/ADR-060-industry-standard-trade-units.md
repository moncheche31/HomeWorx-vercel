# ADR-060 — Industry-standard trade unit / quantity layer

Status: Accepted — merged on top of ADR-059 (generic work recognition).

## Decision

Ballpark estimating now derives quantities in the **unit the trade actually
estimates in**, from a single data-driven registry
(`src/domains/workRecognition/standards.ts`), not from per-trade code.

Authority hierarchy is unchanged and applies to every trade:

1. contractor-confirmed measurement
2. contractor-stated number/geometry in the transcript
3. derived geometry (one geometry model per zone)
4. media/vision signal (classification and context only)
5. visible industry allowance / documented ratio

Exact geometry and pricing rounding stay separate: `quantity` is exact,
`pricingQuantity` carries waste and unit rounding.

## What the registry holds per task family

`unitKey` (SF, LF, EA, roofing_square, SY, CY), `baseUnitKey` (the unit the
derivation natively produces), `derivation`, `wastePct`, standing assumption,
last-resort allowance, documented whole-house ratio, and at most one
high-impact clarification question with an `answeredWhen` guard.

Conventions now enforced:

- Carpet in square yards (9 SF = 1 SY); hard surfaces in SF.
- Roofing in squares (100 SF of roof surface); roof area is never house floor
  area — pitch factor is disclosed.
- Siding in SF less openings; soffit/fascia/corner trim in LF.
- Painting: wall area from perimeter x ceiling height less openings; whole-house
  fallback uses a **visible** documented ratio (3.5x floor SF), not a hidden number.
- Cabinets: base and upper runs as separate LF quantities (ADR-058), components refine.
- Windows/doors: replacement and new opening are distinct task families.
- Electrical: devices / circuits / service EA, wiring LF. Cabinet doors and
  raised-panel cabinetry can never become doors or panels.
- Plumbing: fixtures EA, rough-in EA (separate line), piping LF.
- Drywall / insulation: SF from the same geometry model.
- Concrete: slabs SF -> CY at a disclosed thickness; footings LF.
- Demo: only in scope when removal was requested; quantity follows the surface removed.
- Finish carpentry one-offs: overall width governs; components refine.

## Sanity

`plausibleMax` is unit-aware (bounds reasoned in SF/FT/CF, then expressed in the
trade's unit) and scales with the job's own geometry. A roofing-square line that
only makes sense as square feet is blocked as a conversion error.

## Pricing

Quantities stay national/industry-standard. Localization remains a pricing
concern (regional factor by ZIP/market on top of base rates). No live retail
scraping.

## Not done here (later pricing-data expansion)

- Catalog rate rows priced natively in SQ and SY (today the bridge converts to
  the catalog's unit, so roofing/carpet still price against SF rates).
- Size/type modifiers for windows and doors, and finish-tier rates for decking
  and carpet grades, are clarification questions today, not priced multipliers.
- Stair pricing by riser/stringer counts; siding opening take-offs from measured
  window/door schedules.
