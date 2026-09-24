# ADR-041 — Photo-Based Scale Inference

Status: Accepted

## Context

Photo-only and realtor-package intake needs a ballpark before anyone has a tape
measure on site. Rooms are full of objects whose size is effectively
standardized (24" dishwasher, 30" range, 24" base-cabinet depth, ~36" counter
height, 60" tub, 80" door, 48" switch height, 12"/24" tile), so counting how
many of them span a run yields an approximate dimension.

## Decision

1. **Analysis is separate from pricing.** `src/domains/ballpark/scaleReferences.ts`
   holds the reference catalog; `src/domains/ballpark/photoInference.ts` turns
   human-confirmed observations into normalized measurements. The pricing engine
   (`multiInput.ts` → `range.ts`) consumes only normalized answers, never raw
   image output. The single bridge is `measurementsToAnswers()`.
2. **Every value carries provenance.** `MeasurementEstimate` records value, band
   (low/high), unit, `sourceType` (`confirmed | user_entered | inferred |
   assumed`), a 0–1 confidence, the photo IDs, the scale references used, and a
   confirmation flag. Inferred confidence is hard-capped at 0.8.
3. **Precedence.** A typed/spoken answer beats an inference; an inference beats a
   size-class allowance. Allowance-grade values are never passed off as
   evidence — they stay in the `assumed` ledger bucket.
4. **Band widening.** `INFERRED_FOOTPRINT_WIDEN_PCT = 6` sits between a measured
   footprint (0) and a size-class allowance (10). Photo intake still adds its
   own 12% and confidence is still capped at `medium`.
5. **Correction, not restart.** `confirmMeasurement` / `adjustMeasurement`
   return a new inference with derived quantities recomputed; photo provenance
   survives the correction. Later measurements or a sketch refine the same
   estimate through the existing `refinement.ts` path.

## Consequences

- The ledger gains an `inferred` bucket, rendered distinctly from `measured`.
- A new `inferredFootprint` risk and `inferred-footprint` warning replace the
  `assumedFootprint` risk when the footprint came from photo scale references.
- No claim of computer-vision accuracy is made anywhere: the app never reads a
  dimension from pixels; a human confirms which objects are visible and how many
  span the run.

## Limitations

- Observations are human-tagged. There is no automatic object detection yet;
  swapping one in later only replaces the observation producer.
- Photos remain on the device in this phase, so `photoIds` are local identifiers
  until photo persistence is wired to the project media tables.
