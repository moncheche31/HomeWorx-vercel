# Estimating Architecture Audit — 5–10 Contractor Pilot Readiness

Blunt read: the estimating system works because it has been hand-fitted to a
small number of test jobs. The *mechanisms* are mostly sound; the *content*
(what work exists, what it costs, what units it uses) is spread across four
hand-maintained lists that do not know about each other. That is why every new
job type feels like a one-off fix — because today it literally is one.

## Subsystem scorecard

| # | Subsystem | Grade | Evidence |
|---|---|---|---|
| 1 | Scope grounding (explicit / inferred / default) | **Yellow** | 3-bucket model is right (`scopeGrounding/ground.ts:39-46`, `:192-202`); vision can't price. But un-grounded lines silently use catalog defaults (900 SF flooring, 1800 SF paint — `remoteVision/lexicon.ts:143,259`) with only an `isDefault` flag nothing blocks on. |
| 2 | Quantity extraction / unit normalization | **Yellow** | `scopeGrounding/measure.ts:27-107` is genuinely unit-safe. But only cabinets get a dimension check, and **nothing multiplies by room count** anywhere — a 5-room "flooring throughout" prices as one room. |
| 3 | Assemblies / pricing data model | **Red** | Two disconnected price libraries: DB `catalog_assemblies` (225 rows, 21 trades) for Detailed vs hard-coded `ballpark/pricebook.ts:49-200` (~95 TS literals) for Ballpark. Different keys for the same work (`framing.partition_wall` vs `framing.wall.interior`). `org_assemblies` overrides do **not** affect ballpark. |
| 4 | Trade / task taxonomy | **Red** | Four competing vocabularies: `features/scope/catalog.ts:35-39` (18), catalog `trade_key` (21), `estimating/tradeTaxonomy.ts:13-31` (17), `pricing/seededProvider.ts:41-57` (15). Reconciled by a first-match keyword table (`tradeTaxonomy.ts:38-57`), lossy and order-dependent. No test asserts they agree. |
| 5 | Labor-hours model | **Green/Yellow** | Detailed is data-driven per assembly; crew size correctly never multiplies cost (`pricing/knowledgeBridge.ts:11-13,64-72`). Ballpark hours are hard-coded literals — same drift as #3. |
| 6 | Assumptions / clarification engine | **Yellow** | Impact-scored ranking is the right generic mechanism (`ballpark/questionPriority.ts:44-57`), but the topic list is kitchen/bath-shaped. Roof pitch, deck footings, siding substrate, addition foundation fall to `other: 3%` and are suppressed below the 4% ask threshold (`:23`). Auto-assumptions still swing price up to 1.35x without asking (`remoteVision/assumptions.ts:92-106`). |
| 7 | Sanity checks / outlier detection | **Red** | `scopeGrounding/sanityGate.ts:55-69` gates the dimension check to `family === "cabinets"`. Every other trade has zero unit-explosion protection. Caps are flat global constants (`ballpark/pricebook.ts:33,41-46`: 24 each / 400 LF / 6000 SF / 200 CY) sized for one room — a whole-house job with 30 doors or 500 LF of base trips them routinely. |
| 8 | Project / media / data persistence | **Green/Yellow** | Ballpark sessions, measurements, media, narrative all durable. One vestige: `features/remote-vision/hooks/useRemoteVisionSessionStore.ts:44,70` still localStorage-backed for session state. |
| 9 | Ballpark vs Detailed separation | **Red** | `estimating/modes.ts:16-17` claims "one catalog serves both." The code contradicts it. Two engines, two datasets, two key spaces, no cross-check test. |
| 10 | Test / regression architecture | **Yellow** | ~500+ tests, good discipline. But the flagship integrity tests are pinned to one transcript (`tests/regression/cabinetHallucination.test.ts:12-19`, `tests/estimating/pricingCoverage.test.ts:3-5`). Decks, roofing, siding, handyman, additions, whole-house: **zero scenario coverage** despite seeded catalog rows. |
| 11 | Job-specific hard-coding vs reusable rules | **Red** | `scopeGrounding/cabinetry.ts` is 150 lines of pure cabinet arithmetic, invoked on every job (`ground.ts:148`). Of the grounding rules in `ground.ts:61-130`, 2 are cabinet-specific, 1 is a magic "8 LF baseboard" carve-out, 1 is electrical device count — reusable rules: effectively zero. `remoteVision/lexicon.ts` has **15** work rules: no deck, roof, siding, HVAC, concrete, fence, handyman. |
| 12 | Multi-room / large-project failure modes | **Red** | See below. |

## Likely failure modes on a large multi-room job

1. Whole-house quantities priced at single-room defaults (no room multiplier).
2. Non-cabinet unit explosions pass the sanity gate untouched.
3. Exterior trades (deck/roof/siding/HVAC) never produce a candidate in the
   remote-vision path at all — only the separate ballpark catalog knows them.
4. Legitimate large quantities false-flag on the flat 24/400/6000/200 caps.
5. Expensive exterior unknowns are systematically never asked about.
6. Ballpark and Detailed disagree on the same job, with no test to catch it.

## Minimum changes BEFORE pilot

Goal: stop silent wrong numbers and stop per-job patching. Not a rewrite.

1. **One assembly registry.** Make Ballpark read the same catalog rows as
   Detailed (derive ballpark rates from `catalog_assemblies`, retire
   `ballpark/pricebook.ts` as data). Kills key drift and makes org overrides
   real in both modes. *Highest leverage single change.*
2. **One trade taxonomy.** Pick the catalog `trade_key` set as canonical; make
   the other three explicit mapping tables with a test asserting total
   coverage (no key silently falls to `unassigned`/`other`).
3. **De-cabinet the sanity gate.** Replace the `family === "cabinets"` guard
   with a generic "quantity vs any stated dimension for the same subject"
   rule, and make caps scale from project size instead of flat constants.
4. **Block, don't whisper, on defaults.** A priced line whose quantity is
   `isDefault` on a job above a size threshold must surface as a required
   confirmation, not a provenance footnote.
5. **Room-count scaling.** One reusable rule: detected rooms × per-room
   quantity for area/length trades, with the multiplier shown to the
   contractor.
6. **Broaden the lexicon to the trades the catalog already prices.** Deck,
   roof, siding, HVAC, concrete, handyman — data rows, not new code paths.
7. **Scenario regression per job type.** One gold transcript each for deck,
   bath, roof/siding, handyman, whole-house, in the shape of
   `cabinetHallucination.test.ts`, plus a ballpark-vs-detailed agreement test.
8. **Retire the remote-vision localStorage session store.**

## Can wait until AFTER pilot

- Merging `catalog_intent_aliases` (SQL) and `intentMap.ts` (TS) into one
  source of truth — today it's a documented hand-mirror; add a parity test now,
  unify later.
- Implementing the `costCatalog.ts` provider extension point (regional/licensed
  pricing).
- Crew-size-aware scheduling and productivity calibration per contractor.
- Question-topic taxonomy expansion beyond adding exterior topics.
- Refactoring `cabinetry.ts` into a general component-arithmetic engine.

## Verdict

Green-light a pilot **only** for kitchen/bath/interior-remodel work as-is.
For the full trade range the owner wants, items 1–4 above are the difference
between "generalizes" and "one-off fix per job forever." They are days of work,
not weeks, because the mechanisms already exist — they are wired to the wrong
data.
