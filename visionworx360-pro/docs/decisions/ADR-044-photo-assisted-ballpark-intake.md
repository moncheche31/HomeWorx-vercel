# ADR-044 — Photo-assisted ballpark intake, Phase 1

Status: Accepted
Extends ADR-041 (photo scale inference), ADR-043 (photo estimate intelligence)

## Context

The photo path classified images into five kinds, showed a fact list, and then
went straight from the interview to a number. Contractors had no place to see —
or fix — the assumptions the range actually rested on, and the question budget
(eight) still read as an interview.

## Decision

1. **Seven photo kinds.** `room_photo | detail_photo | exterior | sketch_plan |
   rendering | damage_photo | unknown`. Object-scale calibration stays
   room-photo only; an exterior shot never drives interior finishes, and a
   damage shot never sizes a room.
2. **Photos are ordered.** Upload order is editable; the first whole-room shot
   is the one the summary leans on.
3. **Four summary sections.** Confirmed observations, uncertain observations,
   known measurements (each with provenance), unknown measurements. Nothing
   unanswered is promoted to "confirmed".
4. **Three to seven questions.** `MAX_CLARIFICATIONS = 7`,
   `MIN_CLARIFICATIONS = 3`; the set stays conditional on room, scope and
   image kind, and tops up from the high-value list rather than padding.
5. **Assumptions review is a gate.** The photo path never jumps from the last
   question to a range. `AssumptionsReviewPanel` shows every input with a
   Contractor / Photo / Assumed / Unknown badge and one-tap edit.
6. **No new persisted stage.** The durable session still knows four stages; the
   assumptions review persists as `review`, so no RPC or CHECK constraint
   changed and completed-snapshot semantics are untouched.

## Consequences

- Pricing formulas, completed range persistence, dashboard behavior, versioning
  and the simplified button hierarchy are unchanged.
- A photo remains a weak clue: contractor measurements always win, and anything
  unknown widens the range instead of being invented.
