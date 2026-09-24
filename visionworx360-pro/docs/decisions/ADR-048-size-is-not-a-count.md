# ADR-048 — A size is never a count (ballpark scaling guard)

**Status:** Accepted

## Evidence

Reconstructed contribution breakdown of the bad Garage Conversion snapshot
(expected $454,350.43; sample pricebook, labor $65/h, 10% overhead + 10%
profit = ×1.21, no tax):

| line | pricebook item | qty | labor | material | subtotal |
|---|---|---|---|---|---|
| Vanity 60" double sink | bath.full_fixtures | **60** | 101,400 | 252,000 | **353,400** |
| Shower tile | bath.full_fixtures | 1 (assumed) | 1,690 | 4,200 | 5,890 |
| Rough plumbing, bathroom | bath.full_fixtures | 1 (assumed) | 1,690 | 4,200 | 5,890 |
| Platform floor | flooring.mid | 288 SF | 655 | 1,656 | 2,311 |
| plumbing.nearby ×1, electrical.basic ×3, door.interior ×4, window.unit ×2 | — | 1 each | — | — | 8,005 |

Direct cost 375,496.20 × 1.21 = **454,350.40** (engine: 454,350.43). Widening
was +30% (10 assumed counts, 5 unpriceable), applied to the band edges only —
low 285,500 / high 650,000. No dollars-vs-cents, percent-vs-decimal, duplicate
multiplier, or unit-conversion error exists in the engine; markup is exactly
×1.21 and quantity scaling is linear.

**Root cause:** one line. `Vanity 60" double sink` carried quantity 60 —
the vanity's *width in inches* parsed as a count — priced as sixty complete
bathroom fixture sets. That single line is 94% of the direct cost, a ~10x
inflation of a real garage scope. Stale kitchen scope contributed under $10k.

## Decision

1. `detectQuantity` skips size-marked numbers: inch marks (`"`, `”`, `in`,
   `inch`, `pulgadas`), dimension pairs (`16' x 18'`), and fractions (`3/4"`).
   Feet quantities used for LF/SF work are unaffected.
2. `BallparkPriceEntry.maxPlausibleCount` caps `each` work per scope line
   (default 24; 4 for bath fixtures and moderate systems, 2 for a panel).
   A count above the cap is reported as `implausibleQuantity` with the value
   and the cap — never priced, never silently dropped.
3. The recalculation integrity gate (ADR-047) still refuses to overwrite a
   credible saved band; the Garage Conversion snapshot was restored to
   $34,500 / $38,809.02 / $43,000 and flagged for review.

## Consequences

- A parsed dimension can no longer multiply a ballpark by an order of magnitude.
- Regression coverage in `scopeScaling.test.ts` pins the parser, the caps,
  linear quantity scaling, the ×1.21 markup, and the ≤30% widening bound.
