# ADR-038 — Knowledge Engine as the shared contractor brain

Status: Accepted — Module 015

## Context

Construction knowledge was accumulating in silos: Copilot (013) held omission
and upsell rules, Narrative Scope (010B) held prose, Remote Vision (011) held
assumptions, Knowledge Base (007B) held priced assemblies. The same fact — "a
kitchen demo needs floor protection" — risked being written three times, in two
languages, with three different confidence vocabularies.

## Decision

`src/domains/knowledge` is a single, deterministic, read-only source of truth
for construction *knowledge* — not price. It answers: what work is required,
what sequence it follows, what contractors commonly forget, what safety, code,
permit and inspection reminders apply, what upgrades are worth presenting, and
what value-engineering alternatives exist.

Boundaries:

- **No pricing.** Module 008 remains the only price authority. Value
  engineering expresses `lower | similar | higher`, never a number or percent.
- **No AI, no network, no database in Version 1.** `reviewProject`-style pure
  functions over human-authored catalogs; identical input gives identical
  output, offline.
- **No mutation of scope, estimate or narrative records.** Consumers read
  recommendations and decide.

Structure:

- `items.ts` — atomic bilingual knowledge items. Each carries a contractor
  rationale *and* a separate customer value statement.
- `catalog.ts` — entries for 10 project types plus major activities, composed
  from item keys rather than duplicated prose.
- `matching.ts` — deterministic accent- and punctuation-insensitive scoring
  over trigger terms, synonyms, trades, project types, assembly keys.
- `overrides.ts` — organization copy-on-write. Platform seeds are frozen; an
  organization's disabled items, added items, re-graded confidence and replaced
  labels are stored as deltas and applied at read time. A platform knowledge
  update can therefore never overwrite a contractor's customization.
- `versioning.ts` — one active version, effective dates, archive without delete.
- `providers.ts` / `registry.ts` / `extensionPoints.ts` — the swap seams.

Confidence uses four levels: `high`, `medium`, `optional`,
`contractor_decision_required`. Permits, inspections and structural judgment are
always contractor decisions — the engine never asserts a code requirement as
fact.

Customer language is authored at the source, not derived by stripping words. No
customer string may imply the contractor forgot something; the Copilot's
`containsInternalTerms()` guard is applied to knowledge strings in tests.

## Integration

`copilotBridge.ts` converts knowledge into Copilot recommendation shape and
merges by `sectionKey:itemKey`, so Module 013 keeps its pipeline, sections,
decisions and customer guard unchanged while gaining shared knowledge. Narrative
Scope, Remote Vision and Proposal consume the same engine through
`getKnowledgeEngine()`.

## Data ownership

Contractor data is never pooled, sold, or used to train anything. The
`RegionalBenchmarkExtension` and `HistoricalEstimateExtension` seams are
specified as anonymized and opt-in; neither is implemented.

## Consequences

- One place to fix a knowledge gap; every module improves at once.
- Catalog coverage is bounded by authored entries — broadening is a data edit.
- Any future AI layer is additive: it registers through `registerKnowledgeEngine`
  or a pipeline extension, and the deterministic answer remains the floor.
