# ADR-058 — Run Geometry Authority (Ballpark)

Status: Accepted

## Context

Cabinet estimates were being corrupted: a 94" wall came out as 2' 6", filler
totals were nonsense, component depths/heights leaked into widths, and the
rounded pricing quantity (8 LF) was written back over the exact geometry.

The underlying mistake was architectural, not cabinet-specific: the estimator
rebuilt overall geometry out of component detail, and treated one number as
both the measurement and the pricing quantity.

## Decision

1. **Overall stated geometry is authoritative.** Authority order for any run:
   confirmed durable project measurements > contractor-stated run in the
   transcript > component arithmetic. Component detail refines a run; it never
   replaces one. Implemented in `src/domains/scopeGrounding/cabinetRuns.ts`.
2. **Geometry and pricing quantity are separate fields.** `quantity` holds the
   exact value (7.833 LF, displayed `7' 10"`); `pricingQuantity` holds the
   ballpark linear feet rounded UP (8 LF). Rounding never flows back.
3. **Base and upper runs are separate quantities and separate priced lines**
   (`cabinets.replace`, `cabinets.upper`). Uppers inherit the base run only as a
   disclosed assumption when no upper run was stated.
4. **Price now, disclose the assumption.** A missing detail produces an
   assumption or clarification, never a blocking question — Ballpark mode
   stays fast.
5. **Visual evidence is contextual only.** Photos can confirm that uppers exist;
   they never set a dimension.
6. **Action verbs stay grounded** in what the contractor said; uppers default to
   `install`, not `replace`.

## Consequences

- `lexicon.ts` splits the old combined cabinetry cost (14,500 / 40 hr) into
  base (9,100 / 25 hr) and upper (5,400 / 15 hr) so a full kitchen totals the
  same while a base-only job no longer overprices.
- The scope review panel shows exact geometry with the pricing quantity beside
  it, never instead of it.
- Regression coverage: `src/tests/regression/cabinetRunAuthority.test.ts`
  (gold 94" case, comma dictation, sparse input, L-shape 8+6=14, distinct upper
  run, confirmed-measurement precedence, rounding isolation).
