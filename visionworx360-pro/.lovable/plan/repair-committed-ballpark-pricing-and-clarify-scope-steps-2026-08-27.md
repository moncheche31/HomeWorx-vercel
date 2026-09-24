# Repair committed ballpark pricing and clarify scope steps

## Goal
Keep the selected Photos/Video ballpark’s item-level costs intact when scope is committed, while preserving Needs Review flags and strict detailed-estimate behavior. Clarify the two scope-related workflow steps without removing distinct functionality.

## Pricing repair
- Extend the canonical commit payload with an auditable per-item ballpark pricing snapshot derived from the selected scenario’s existing contractor breakdown: quantity/unit, labor hours and rate, material/other costs, assembly key, and pricing basis.
- After scope sync, stamp those selected-scenario values onto the matching system-owned estimate lines instead of allowing fuzzy database catalog matching to substitute unrelated assemblies (for example roof tear-off, house wrap, deck staining, or egress windows).
- Preserve contractor/manual overrides and never treat the ballpark snapshot as contractor-confirmed evidence. Allowance lines remain `ballpark_allowance` and Needs Review, but remain resolved and included in the ballpark total.
- Update scope synchronization so an existing ballpark estimate accepts changed assumed allowance quantities from its own scope rows; detailed estimates will continue to accept only contractor/measurement/geometry quantities.
- Ensure repricing/reconciliation runs when existing scope quantities change, not only when a brand-new estimate line is inserted.

## Landscaping and windows
- Repair landscaping’s stale placeholder path: its 2,700 SF allowance must sync and retain the selected scenario pricing instead of reverting to quantity 1 / $0.
- Keep uncounted windows strict: no silent “1 window” allowance. Add a direct window-count question and keep the item visibly unpriced/Needs Review until Michael supplies a count. Do not include a fabricated window cost in the canonical total.

## Existing affected estimates
- Add a guarded migration/backfill for ballpark estimates that already contain an `originalBallpark.contractorBreakdown.tasks` snapshot. Restore only system-owned, non-overridden lines that can be matched to their own scope feature key and snapshot task.
- Rebuild the canonical ballpark after restoration so Pembroke’s saved main estimate reflects the preserved selected scenario costs (approximately the original mid-range total, minus any count-based item that still lacks contractor evidence).
- Scan other recent Photos/Video estimates, including Kitchen Cabinet Ads, for the same mismatch and report findings without altering contractor overrides.

## Workflow labels
- Keep both steps because they serve different purposes:
  - current “Review Scope”: item-by-item included work, assumptions, and missing questions;
  - current “Scope of Work”: final narrative wording, approval/save, and proposal preview.
- Rename them in English and Spanish to explicit action labels such as “Review Items” and “Approve & Save,” while retaining the existing screens and actions.

## Verification
- Add regression tests covering exact scenario-cost preservation, allowance quantity sync, landscaping, strict uncounted windows, override protection, and the clarified bilingual labels.
- Run focused estimating/Remote Vision tests and verify the preview build.
- Read Pembroke’s saved estimate lines and canonical range again after migration, confirming realistic roofing, siding, fascia, deck, columns, and landscaping costs, with windows visibly unresolved until counted.
