# Fix: "Replace" wording, lost cabinet detail, and non-durable Remote Vision estimates

Two confirmed defects came out of tracing the cabinet test job end to end, plus one durability gap found in the live data.

## What's wrong today

**1. The app says "Replace" when the contractor said "add".**
Each keyword rule in the scope lexicon carries a single fixed verb. The cabinet rule is hard-wired to `replace`, so "add a bank of cabinets on the back wall" comes out as "Replace kitchen cabinetry". Nothing anywhere reads the contractor's actual verb. That wording implies demolition and disposal the contractor never quoted.

**2. All the cabinet detail the app worked out gets thrown away.**
The reconciliation step already computes base vs upper cabinets, their widths, counts, and the filler strips, and uses it to check the arithmetic against the 94" wall. Immediately after that check, the detail is discarded — the scope line keeps only "cabinetry, 7.8 linear feet". Specialty items the contractor named (bread box, wine cabinet, glass doors) are not captured at all, so they can never appear in the scope of work or the proposal.

**3. The Remote Vision estimate never reaches the project.**
The live "Kitchen Cabinets" project has 2 photos and the confirmed 94" wall measurement stored, but no scope items, no estimate, and no narrative. Everything else the contractor produced in that session exists only in the browser. If the durable-commit step is not reached, the work is lost.

## What to build

### A. Contractor's verb wins
New module `src/domains/remoteVision/actionVerb.ts` exporting `resolveActionKey(sentence, ruleDefault)`. Ordered matching, English and Spanish: replace/swap (and "tear out ... and install new") → replace; paint/refinish → paint; move/relocate → modify; repair/patch/fix → repair; remove/demo/tear out → remove; build/frame → build; add/install/new/put in → install. Falls back to the rule default when the sentence states no action.

Wire it in `analyze.ts` where each detected feature is built (the matched sentence is already in hand), carry `actionKey` on the feature, and have `narrative.ts` prefer the feature's verb over the rule's. Result: "Install kitchen cabinetry", and where the contractor said "no demolition", no demolition verb appears.

### B. Keep the cabinet component detail
- Extend the cabinet component record with a `descriptor` field so named specialty items (bread box, wine cabinet, glass doors, raised-panel doors) are captured alongside width and kind.
- Attach the reconciliation summary to the grounded cabinet line instead of dropping it after the arithmetic check.
- Render it as a detail clause on the scope sentence, e.g. "Install kitchen cabinetry (approximately 7' 10"): three 30" base cabinets with 2" fillers each end; uppers include a bread-box cabinet, a glass-door cabinet, a wine cabinet and a glass/raised-panel cabinet."

### C. Make the estimate durable earlier
Today only "Approve" commits. Change the Remote Vision session so reaching the Estimate step writes the intake text and the grounded scope to the project as a draft, with Approve still the point that marks the scope approved. A contractor who closes the app after seeing a number keeps their work.

## Technical notes

- Files: `src/domains/remoteVision/actionVerb.ts` (new), `analyze.ts`, `narrative.ts`, `types.ts`, `src/domains/scopeGrounding/cabinetry.ts`, `ground.ts`, `types.ts`, `src/features/remote-vision/hooks/useRemoteVisionCommit.ts`.
- Verb strings stay inside the existing action-key vocabulary the narrative generator already localizes, so no new translation keys are needed for A.
- New regression coverage in `src/tests/regression/cabinetHallucination.test.ts`: the gold transcript must yield the install verb, never the replace verb, and the scope sentence must name the base/upper components. Existing assertions in that file stay untouched.
- No pricing-model change in this pass: the split between the lexicon's flat feature costs and the itemized ballpark pricebook is real but is separate work.
