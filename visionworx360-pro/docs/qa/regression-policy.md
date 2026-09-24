# Contractor Pilot — Regression Protection Policy

Regression protection is part of the definition of done for every change.
Nothing that already worked may quietly stop working.

## Protected workflows

- create estimate / project flows (CRM: projects, clients, properties)
- on-site walkthrough; Estimate from Photos or Video, including prerecorded
  video upload
- voice/text notes and dimension capture
- scope generation, approval and revision
- Ballpark inference/assumptions, question answering, edit/revise assumptions,
  current-range persistence, Use This Ballpark
- pricing catalog mappings, assemblies, allowances, contractor overrides,
  no stale-snapshot regression
- Ballpark vs Detailed separation; the original ballpark is preserved
- proposal generation and proposal settings
- contractor / client / realtor / buyer proposal variants
- proposal before/after image hierarchy
- As Illustrated pricing behavior
- print / browser Save as PDF
- email / share / client portal / change-request workflow
- auth, session, tenant isolation, and the `attachConfiguredAuth` guardrail
- EN/ES parity
- mobile layouts and field usability
- existing saved projects/proposals; migrations stay backward-compatible

## Discipline

1. Inspect the current implementation and its existing tests before modifying
   a protected workflow.
2. Prefer small additive changes and shared domain logic to broad rewrites.
3. Never rename or remove persisted fields, statuses, routes or public
   behavior without backward-compatible handling.
4. Every bug fix ships with a regression test so the bug cannot return.
5. Keep the pilot smoke suite current (below).
6. After each meaningful change: focused tests -> full suite -> typecheck ->
   production build. New failures get investigated, never dismissed. Known
   flaky tests are isolated and documented here, never used to hide a
   regression.
7. Do not publish/deploy unless explicitly requested.

## Pilot smoke / regression suite

`src/tests/pilot/`

- `pilotCriticalPath.test.ts` — runs the real engines end to end over the
  critical path: scope -> ballpark (coverage, ordering, plausibility window,
  finish tiers) -> question budget and assumption correction -> engine-version
  auto-heal -> mode separation and in-place detailed conversion -> proposal
  (band-backed investment, no internal language, all variants, gallery
  hierarchy, As Illustrated clamping, ES structure) -> print route, tokenized
  share access, sanitized share document, change-request lifecycle -> auth
  attacher and protected-subtree guardrails.
- `pilotSurfaces.test.ts` — structural inventory of the field entry points
  (CRM creation, walkthrough steps, photo/video upload, voice capture,
  narrative scope tab and review dialogs, ballpark/proposal/print/portal
  routes) plus EN/ES key parity across the primary namespaces.

Run focused:

```
bunx vitest run src/tests/pilot
```

## Known flaky tests

None currently. Add an entry here (test name, symptom, why it is flaky, owner)
before quarantining anything.
