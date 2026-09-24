# ADR-057 — Scope grounding, quantity provenance and the pre-pricing sanity gate

**Status:** Accepted

## Context

A real contractor transcript ("add a bank of cabinets… wall measures 94 inches…
three 30-inch base cabinets… glass doors… move one outlet… no permits… just
cabinet install") produced a $60k–$80k estimate for what is a one-wall cabinet
install. Three independent defects combined:

1. **Unit-blind quantity capture.** `analyzeDescription` grabbed the first
   number in a matched sentence with no unit check, so "94 inches" was applied
   to a rule whose unit is linear feet. Where no number was found it fell back
   to the lexicon default of **24 LF** for cabinets — the same 24 LF that the
   ballpark resolver reaches independently (14 LF base + 10 LF wall allowance)
   whenever a stated quantity is discarded for a multi-part plan.
2. **Context-free keyword matching.** `\bdoor(s)?\b` matched "glass doors" and
   "raised-panel door" (cabinet door styles) and added a 5-door architectural
   line; "floor level" matched flooring; "raised panel" matched the electrical
   rule; "no permits" added permits.
3. **No separation between what was asked for and what was merely seen**, and
   no gate that could refuse to emit an implausible number.

## Decision

A new `src/domains/scopeGrounding` domain sits between text analysis and
pricing.

1. **Three scope classes, never collapsed:** `EXPLICIT` (the contractor said
   it), `INCIDENTAL` (directly required by an explicit item, carrying the id of
   that item), `OBSERVATION` (seen but not requested — surfaced or turned into
   a question, never priced), plus `EXCLUDED` for stated negations.
2. **Unit-safe measurement extraction** (`measure.ts`) normalizes every stated
   dimension to canonical inches with its subject ("wall") and renders `7' 10"`.
   Bare numbers can no longer become a measured quantity; a length or area
   quantity requires an explicit unit token, and `lump_sum` rules ignore
   numbers entirely.
3. **Entity disambiguation** (`entities.ts`): cabinet door ≠ interior door,
   countertop ≠ flooring, "floor level" ≠ flooring work, bread box ≠ appliance,
   wine cabinet ≠ wine appliance. Sentence-level negation ("No permits", "No
   demolition except…") and scope fencing ("Just cabinet install") are honoured.
4. **Component arithmetic** (`cabinetry.ts`) reconciles stated component widths
   against the stated wall: three 30" bases + two 2" fillers = 94" exactly; the
   uppers total 90" and the remaining 4" is raised as a clarification instead
   of being invented as extra run.
5. **Quantity provenance** on every priced line: source (spoken/typed
   measurement, drawing, component arithmetic, derived from scope, photo
   inference, assembly default, contractor override), verbatim evidence and a
   plain-language rationale, exposed as "Why this quantity?" in the UI.
6. **Pre-pricing sanity gate** (`sanityGate.ts`) blocks unit-conversion
   explosions, quantities exceeding a stated dimension, entity mismatches,
   duplicate quantities, unrelated trades against a fenced scope, and missing
   provenance. Blockers stop pricing and ask.
7. **Estimator-level quantity limits** in the ballpark resolver: measured units
   now have plausibility ceilings (LF 400, SF 6000, CY 200, HR 400) alongside
   the existing `each` cap, and a stated total is distributed proportionally
   across a multi-part plan instead of being discarded in favour of the 24 LF
   allowance.
8. **Contractor-visible review**: "Scope interpreted from your input" shows
   Included, Assumed/Incidental, Observations, Exclusions, stated measurements
   and sanity findings before the ballpark, with per-item removal that feeds
   straight back into the recalculation.

## Consequences

- Vision/photo evidence can raise confidence and observations but can never add
  a priced trade; only explicit and incidental work prices automatically.
- Unknowns widen the range or use allowances — they never invent trades.
- The cabinet transcript now resolves to 7.83 LF of cabinets, 16 SF of laminate
  countertop, one outlet relocation and incidental baseboard removal, with
  permits, demolition, flooring and architectural doors excluded.
- Locked by `src/tests/regression/cabinetHallucination.test.ts` (gold cases
  A–J).
