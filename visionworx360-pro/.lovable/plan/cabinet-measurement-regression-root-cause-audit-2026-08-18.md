# Cabinet Measurement Regression — Root-Cause Audit

Read-only. No code was changed. Findings below were reproduced by running the live
`reconcileCabinetRun` against realistic dictation phrasings and by reading the stored
project data.

## What the database actually holds

The "Kitchen Cabinets" project has exactly one durable measurement:
`wall / 94 in / spoken / confirmed`. There is no persisted narrative or note for it. So every
bad number the contractor is seeing is produced live in the client pipeline from the
transcript text — the stored 94" record is intact and is not being mutated.

## Reproduction (actual output today)

Input: `"The wall is 94 inches. Base cabinets are 30 inches wide, three of them, with two inch
fillers on either end. Uppers: a 15 inch bread box cabinet and a 15 inch glass door cabinet and
a 30 inch wine cabinet and a 30 inch cabinet..."`

Output from `reconcileCabinetRun`:

```text
wallDisplay: 2' 6"      <-- should be 7' 10"
runFeet:     2.5        <-- should be 7.833
base total:  49"        <-- should be 94"
upper total: 0"         <-- should be 90"
components:  1 x 30 base, 1 x 15 base
sentence:    1 2' 6" base cabinet, 1 1' 3" base cabinet with bread box and wine
             storage and glass doors and raised-panel door; 4" of filler strips
```

A comma-style phrasing produces `components: 1 x 94 base`, i.e. the wall itself is priced as a
single cabinet, and `base total: 98"`.

## Root causes, by the questions asked

**(1) How 94" became a wrong wall/run value —**
`src/domains/scopeGrounding/measure.ts:58` `subjectFor()` picks a subject by scanning a
±40-character window around the number. In "Base cabinets are 30 inches wide" the word `wall`
from the preceding sentence is inside that window, so the 30" cabinet width is tagged
`subject: "wall", dimensionHint: "width"`. `cabinetry.ts:78-81` then takes the *first* such
match as the wall. The wall becomes 30" → displayed `2' 6"`, run 2.5 LF. Any wrong wall value
of the shape `x' y"` (including ~6'3" = 75") comes from this line: it is a component width
that was mislabeled as the wall.

**(2) How filler grew —**
`cabinetry.ts:87-95` splits text only on `. ; : newline`. Commas do not split. A dictated
sentence is therefore one giant clause, the `FILLER` regex and `BOTH_ENDS` doubling fire once
against the whole utterance, and `fillerInches` accumulates with `+=` across every clause that
merely contains the word "filler". Combined with (1), the residual is then presented as filler.
A 19" filler is this accumulation plus a component width folded in, not a parsed 19.

**(3) The 8-foot base run —**
Nothing in the pricing path rounds linear feet up: `ground.ts:75-86` passes `run.runFeet`
(7.833) through unrounded, `GroundedScopePanel.tsx:24-27` rounds only to 2 decimals, and the
narrative prints `approximately 7.83 linear feet`. I could not reproduce an 8 LF base-cabinet
quantity from code, so this one is **unconfirmed**. The two candidates are
`ground.ts:103` (a hard-coded `quantity: 8, unitKey: "linear_foot"` for `trim.replace`, which
would read as "8 LF" on an adjacent line and be misread as the cabinet run) and
`lexicon.ts:96-106` (`cabinets.replace` default `quantity: 24` linear feet, used whenever
grounding fails to produce a run). Confirming which one is step 1 of the fix.

**(4) Depth/height contamination — yes, partially.**
`cabinetry.ts:103-112` filters `height`/`depth` hints only on the *fallback* path. When the
`WIDE` regex misses and the clause is unsplit, "24 inches deep" and "30 inches tall" sit in the
same clause as the cabinets and can be selected as a width. In the comma variant the run
totalled 98" because the 94" wall itself was consumed as a cabinet width.

**(5) Base and upper are being mixed — yes.**
The `section` latch at `cabinetry.ts:85-89` only flips on clause boundaries. With no
comma splitting, a single clause holds both runs, `kind` resolves to `base` for the whole thing
(`cabinetry.ts:117`), uppers total 0", and every specialty descriptor in the utterance is glued
onto one component ("bread box and wine storage and glass doors and raised-panel door").

**(6) Display unit regression (new, from the last change).**
`describeCabinetRun` at `cabinetry.ts:184,203` formats component widths with `formatInches`,
which renders feet-inches: a 30" cabinet prints as `2' 6"` and a 15" cabinet as `1' 3"`. Cabinet
component widths and fillers must print in plain inches. Wall/run values keep feet-inches.

## Minimum safe fix

1. **Confirm the 8 LF source** before touching anything else — trace one live session's grounded
   items and estimate lines and identify which line is showing 8.
2. **Split clauses on commas and coordinating "and"** in `cabinetry.ts:68-73`, so each cabinet
   is its own clause with its own count, width, kind and descriptor.
3. **Tighten wall selection**: only accept a wall measurement whose subject word is adjacent to
   the number in the same clause and which is not inside a clause containing `cabinet`. Prefer
   the largest such measurement. Never let a component width become the wall.
4. **Exclude depth/height everywhere**, not only on the fallback path, and never let the wall
   measurement be reused as a component width.
5. **Format component widths and fillers in inches** (`30"`, `4"`); keep `formatInches`
   feet-inches for the wall and run only.
6. **Keep geometry and pricing separate**: the exact inch record stays exact; any whole-foot
   rounding stays inside the pricing quantity and is never written back into a displayed
   dimension or into `project_measurement_items`.

## Regression tests to add with the fix

Using the contractor's exact facts (94" wall; 3 x 30" base + 2" filler each end = 94" exactly;
uppers 15 + 15 + 30 + 30 = 90" with 4" unresolved):

- wall renders `7' 10"`, run = 7.833 LF, never 8
- base reconciles to 94" with `reconciled: true`
- uppers total 90" and report exactly 4" unresolved
- component widths render `30"` / `15"`, filler `4"`
- 24" depth and 30" height never appear as widths
- descriptors stay attached to their own cabinet (bread box on one 15", wine on one 30")
- the same transcript with commas instead of periods yields identical numbers
