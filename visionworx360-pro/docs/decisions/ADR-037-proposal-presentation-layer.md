# ADR-037 — Proposal as a deterministic presentation layer

Status: Accepted — Module 014

## Context

Contractors lose jobs on presentation, not on price. The approved Scope of
Work (Module 010B), the estimate (Module 008), the project photos (Module 004)
and the Copilot's accepted upgrades (Module 013) already exist — what is
missing is a premium, customer-ready way to show them. We must not destabilise
any of those modules, and the customer must never see estimating internals.

## Decision

The proposal is a **separate domain** (`src/domains/proposal`) that *reads* a
projection of finished artefacts and *returns a document*. `buildProposal()` is
a pure function: no math, no rewriting of narrative prose, no database, no AI
in Version 1.

- **Pricing authority stays with Module 008.** The proposal receives one
  finished `baseTotal` from the latest estimate. Economy / Good / Premium are
  presentation multipliers over that single authoritative figure, marked
  indicative, and shown as "pending" when no estimate exists. The proposal
  never sums line items itself.
- **Scope authority stays with Module 010B.** `splitScopeSections()` only
  groups the approved narrative for display; it never rewrites a sentence.
- **Customer language is enforced in code.** `sanitize.ts` holds a bilingual
  forbidden-term list (markup, overhead, margin, labor rate, waste factor,
  confidence, assumption, Knowledge Base, …). Internal lines are dropped in
  customer mode and a regression test asserts the assembled customer document
  contains none of them.
- **Themes are token sets, not components.** Classic / Modern / Luxury /
  Minimal are declarative `--proposal-*` token blocks in `src/styles.css`; a
  fifth theme, or a per-organization brand theme, needs no component change.
- **Contractor control is explicit.** Which investment levels appear, which
  sections appear, the warranty wording and the vision wording are all
  contractor-editable. The cover can never be hidden.
- **Local-first persistence.** Theme, visibility toggles and acceptance live in
  `localStorage` per project (same approach as Modules 009 / 010B / 011 / 013).
  Nothing is written back to the scope or estimate tables.
- **Bilingual by construction.** Every generated string is authored in both
  en-US and es-US in `content.ts`; UI chrome lives in the `proposal` i18n
  namespace. Consistent with ADR-028, user content is never auto-translated.

## AI seams

`extensionPoints.ts` declares — but does not implement — providers for
prose rewriting, sales coaching, financing options and follow-up drafts.
`registry.ts` exposes a single deterministic provider today, so an AI provider
can be registered later without touching a component, route or stored shape.

## Consequences

- A proposal can be produced before the scope is approved; the document is
  marked `awaitingApproval` and the contractor sees a warning the customer
  never receives.
- Tier amounts are indicative until the contractor confirms them, which is
  stated in the customer-visible note under the investment section.
- Sharing is via the print route (`Print / Save PDF`); a hosted customer link
  is deliberately out of scope for Version 1.
