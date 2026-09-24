# ADR-043 — Photo estimate intelligence, Phase 1

Status: Accepted
Extends ADR-042 (photo ballpark repair)

## Context

The photo path was honest but thin: it classified a package into three kinds,
printed a couple of notes, and then handed the contractor the whole photo
interview. Nothing summarized what the app actually believed about the job, and
nothing limited the questions to those that move a range.

## Decision

1. **Normalized fact model.** `PhotoAnalysisFact` carries key, value, low/high,
   unit, `sourceType` (`photo_inferred | sketch_inferred | user_confirmed |
   user_selected`), confidence + band, image ids, a basis key and an override
   flag. Every consumer renders provenance; nothing is blended.
2. **Photo Analysis Summary is the first screen after upload.** Room/project
   type, size class, approximate floor area, confirmed visible components,
   existing-condition status, likely scope categories, per-fact confidence, and
   the images each fact is attributable to. Any row is correctable in one tap,
   which jumps to the question behind it.
3. **Five to eight questions, conditional.** `clarificationsFor` picks the
   high-value set from room type, scope type, image kind and what is already
   answered, capped by `MAX_CLARIFICATIONS = 8`. The set is frozen into the
   persisted flow state when the contractor leaves the summary, so the
   interview does not shrink under them as they answer.
4. **Five image kinds.** `room_photo | rendering | sketch_plan | detail_photo |
   unknown`. Object scale stays room-photo only. A rendering never yields an
   existing-condition claim; a detail photo never establishes room size.
5. **Still no vision provider.** `HAS_VISION_PROVIDER` remains false and the
   summary says so. `VisionProvider` is the single seam; adding one changes no
   consumer.
6. **Manual calibration stays advanced-only.** The "how many doors fit across"
   flow is never the default path.

## Consequences

- Confidence shown on the summary is an average over facts and is low by
  construction when little has been established.
- Allowance-grade footprints are labeled `photo_inferred` with an explicit
  "not a measurement" basis, never `user_confirmed`.
- Save, dashboard listing, detailed mode, revisions and EN/ES behavior are
  unchanged.
