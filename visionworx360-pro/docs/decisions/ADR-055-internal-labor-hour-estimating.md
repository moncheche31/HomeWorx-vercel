# ADR-055 — Internal labor-hour estimating

## Status
Accepted

## Context
Contractors sell time. Until now the estimate carried money but no explicit
hour model, so pace ("my crew is 20% slower"), crew capacity and small-job
non-install time were invisible and unadjustable.

## Decision
`src/domains/estimating/laborHours.ts` owns one internal labor model:

```
quantity / production assumption -> baseline hours -> x productivity multiplier
   (or a typed-in override) -> adjusted hours -> x labor rate -> labor amount
```

- **Three views**: per task, per trade rollup, project total (`LaborPlan`).
- **Settings hierarchy**: company defaults on `organizations`
  (`default_labor_rate`, `default_productivity_multiplier`, `default_crew_size`,
  `default_productive_hours_per_day`) overridden per estimate by
  `estimates.labor_settings` (JSONB). Estimate overrides never write back to
  the company profile.
- **Contractor authority**: typed hour overrides are stored verbatim, survive
  scope recalculation, and are flagged (never blocked) when far from baseline.
- **Small jobs**: mobilization, setup/protection, cleanup/disposal, material
  handling and a service-call minimum are modelled as real hours, only for
  jobs at or under the small-job hour threshold.
- **Duration**: working days = total hours / (crew size x productive hours per
  day). An estimate, never a schedule.
- **Privacy**: hours, multipliers and rates are contractor-only.
  `stripInternalLabor()` and `INTERNAL_LABOR_FIELDS` guard customer payloads;
  proposals and the client portal read only the band summary from the range
  snapshot, never its `labor` block.

Surfaces: `LaborHoursPanel` in the Estimate tab (detailed lines when present,
otherwise the ballpark engine's persisted labor summary).

## Consequences
- Ballpark ranges price from adjusted hours, so a pace change moves the range
  on the next recalculation rather than silently doing nothing.
- Non-install hours are reported internally but excluded from line pricing to
  avoid double-counting the dollar adders in `smallJob.ts`.
