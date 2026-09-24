# ADR-028 — Bilingual Project Content (Deferred)

**Status:** Accepted (deferred implementation — not in Version 1)
**Date:** 2026-07-30

## Context

VisionWorx360 Pro ships bilingual (EN-US / ES-US) UI localization today via `src/i18n`.
That covers *application chrome* only: labels, navigation, validation messages, status
names, empty states. It does **not** cover user-authored project content — project names
and descriptions, room names, scope section names, scope item titles and descriptions,
notes, assumptions, exclusions, customer-facing selections, photo captions.

Contractors and their clients may not share a language. A future module will let a
project be presented in a second language without destroying the author's original text.

## Decision

1. **UI localization stays immediate and unchanged.** Switching language switches the
   interface instantly; it must never mutate or re-render user content into another language.
2. **User-authored content is stored and displayed in its original language.** The
   authored text is the authoritative record.
3. **No auto-translation in Version 1.** No AI translation calls, no background jobs, no
   inferred translation on read. Content renders exactly as authored.
4. **Translations, when added, are additive side records** — never in-place overwrites of
   the original field.

## Data model (to be implemented in a future module)

Translated content will live in a dedicated table rather than duplicated columns, so any
translatable entity can participate without schema churn:

| Field | Purpose |
| --- | --- |
| `entity_type`, `entity_id`, `field_key` | What was translated |
| `original_language` | BCP-47 tag of the authored text (e.g. `en-US`) |
| `translated_language` | BCP-47 tag of the translation (e.g. `es-US`) |
| `translated_text` | The translation itself |
| `translation_status` | `pending` / `in_progress` / `complete` / `failed` / `stale` |
| `translation_source` | `ai` / `manual` — how it was produced |
| `review_status` | `unreviewed` / `approved` / `rejected` — human sign-off |
| `reviewed_by`, `reviewed_at` | Audit of the reviewer |

Notes for the implementing module:

- `original_language` is recorded per record, not inferred from the viewer's UI locale.
- A translation goes `stale` when the source text changes; it is never silently reused.
- `review_status = approved` is the only gate for showing a translation to a client on
  proposals or client-visible scope.
- Translation rows are org-scoped and follow the same RLS/tenancy rules as their parent.

## Consequences

- Version 1 remains simple: one text, one language, no ambiguity about which text is
  authoritative.
- Future translation work is purely additive — no migration of existing content, no data loss.
- Estimating, proposals, and client presentation will resolve display text as
  "approved translation for viewer locale, else original".

## Do not reintroduce / do not do

- Do not translate user content on the fly at render time in Version 1.
- Do not overwrite an authored field with a translation.
- Do not add `*_es` / `*_en` sibling columns to content tables.
- Do not derive `original_language` from the current UI locale at read time.
