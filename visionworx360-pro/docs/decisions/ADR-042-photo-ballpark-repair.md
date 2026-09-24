# ADR-042 — Photo ballpark: automatic-first flow, axis-aware scale, persisted stage

Status: Accepted
Supersedes parts of ADR-041 (Photo-Based Scale Inference)

## Context

Live testing of the photo ballpark on the Garage Conversion project produced a
6.6–7 ft × 6.6–7 ft "garage" (43 SF), a backsplash in a room with no cabinets,
and a *High* confidence badge on all of it. Finishing the questionnaire dropped
the contractor back on "How are you estimating this job?".

Three defects, three distinct causes:

1. **Calibration math.** `ScaleReferenceCapture` let any reference size any
   run, and `photoInference` never compared the reference's axis to the run's
   axis. A door height (80 in, `axis: "vertical"`, `isElevation: true`) was the
   default offered for room width, so 1 door → 80 in → 6.67 ft became both the
   length and the width. The catalog already carried `axis`; nothing read it.
2. **Evidence gating.** Backsplash area was derived from `cabinetRunLf` alone,
   with no check on room type or on whether cabinets exist.
3. **Navigation loop.** The page held `source` and `intakeDone` in component
   state. Any remount — refresh, route change, reconciliation — reset both, and
   the render order falls back to the source chooser when `source` is null.

## Decision

**Automatic-first.** The photo path is: upload → classify each image → honest
analysis summary → editable inference summary → high-value clarifications →
Low/Expected/High. Manual object calibration lives behind *Advanced
calibration* and is never required.

**No pretend vision.** There is no image-analysis provider. `photoAnalysis.ts`
exposes `HAS_VISION_PROVIDER = false` and a `VisionProvider` seam, and the UI
states plainly that nothing was read from the pixels. Fallback is broad size
classes plus questions — never fabricated precision.

**Axis discipline.** `TARGET_AXIS` pairs every run with its axis.
`candidateFor` refuses cross-axis references; elevation references
(`doorHeight`, `switchHeight`, `counterHeight`, `outletHeight`) are refused for
horizontal runs *unconditionally*. A non-elevation cross-axis reference is
allowed only with an explicit per-observation `allowCrossAxis`, and is widened
and down-weighted. The picker only offers same-axis rulers, each with written
axis guidance.

**Image kind.** `PhotoKind` is `room_photo | sketch_plan | rendering`. Object
scale runs only on `room_photo`; anything else falls back to answers and
allowances, capped at 0.3 confidence.

**Plausibility guards.** `PLAUSIBLE_RANGE` per run; out-of-envelope values are
dropped back to a documented allowance. Sub-60 SF habitable floor areas and
length ≈ width ≈ door height are `error`-severity warnings that force low
confidence and keep the inference out of `measurementsToAnswers`.

**Evidence gating.** `cabinetRunLf` requires confirmed cabinets;
`backsplashAreaSf` requires kitchen-or-explicit-backsplash evidence *and*
cabinets.

**Persisted stage.** `useBallparkFlow` stores `{source, stage, photos,
observations, corrections, description}` in localStorage per project. Stage is
explicit (`intake | review | questions | results`) rather than inferred, so
finishing the questionnaire always lands on results and a refresh resumes in
place. Photo *previews* cannot survive a refresh (object URLs die with the
tab); their identity, kind and every derived answer do, and the UI says which
previews need re-adding.

## Consequences

- Inference is still heuristic: counted standard objects, not measured pixels.
  Every consumer must keep rendering source type and confidence.
- Confidence is capped at 0.8 for inference and pinned to the floor whenever an
  error-severity warning exists.
- Adding a real provider means implementing `VisionProvider` and setting
  `VISION_PROVIDER`; no consumer changes.
