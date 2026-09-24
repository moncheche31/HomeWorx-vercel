# Diagnostic: latest 94-inch cabinet-bank estimate

## Evidence inspected

- Latest active project: **Kitchen Cabinets**, project `e970…9217`, last updated **2026-08-18 19:29:36 UTC**.
- Persisted intake (`project_notes`): a new cabinet bank, one outlet moved to countertop level, and a 94-inch wall. It does **not** contain the cabinet component schedule, oak finish, laminate selection, minor baseboard, or explicit exclusions listed in the report request.
- Confirmed measurement (`project_measurement_items`): **94 inches**, subject `wall`, status `confirmed`, from spoken capture.
- Latest generated narrative (`project_narrative_scopes`): base cabinetry 7.83 LF, upper cabinetry 7.83 LF, countertop 16.32 SF **“with new sink cutouts,”** and generic electrical work 1 EA.
- Two project photos exist: one existing-condition photo and one rendering.
- There are **zero** persisted `estimates`, `estimate_line_items`, `estimate_ballpark_sessions`, `scope_items`, and `scope_sections` for this project. The range, labor, and duration shown on this screen are browser-only Remote Vision scenario calculations, not database estimate lines.

## Root-cause report

### 1. Exact source of the $2,122 electrical low range

The contractor sentence is: “There is one outlet on that back wall that needs to be relocated up higher to countertop level.”

The specific relocation rule in `src/domains/remoteVision/lexicon.ts` only matches a move/relocate/raise verb **before** the outlet noun within 40 characters. “outlet … needs to be relocated” is reversed, so `mechanical.outlet_relocate` (`$385`, 3 hours) does not match. The broad `mechanical.electrical` rule matches `outlet` instead and supplies **$3,200 and 20 labor hours**.

`src/domains/scopeGrounding/ground.ts` correctly resolves the quantity to **1 each**, but it does not change the selected rule. `src/domains/remoteVision/scenarios.ts` calculates:

```text
quantity scale     = 1 / 1 = 1.00
scenario factor    = 0.78
low spread factor  = 1 - 0.15 = 0.85
low price          = round($3,200 × 1.00 × 0.78 × 0.85)
                   = $2,122
labor              = 20 × 1.00 × 0.90 = 18 hours
```

There is no regional factor, catalog rate, hourly labor rate, material breakout, minimum charge, overhead, markup, permit, or duplicate aggregation. It is one legacy lump-sum rule scaled by scenario constants.

### 2. Exact source of the sink cutout

`src/domains/remoteVision/lexicon.ts` hardcodes the countertop scope title as **“countertops with new sink cutouts.”** That title is emitted for every countertop match, regardless of sink evidence. Here, “countertop” in “countertop level” also falsely triggers the countertop rule. `src/domains/scopeGrounding/ground.ts` derives **16.32 SF** from a fixed 25-inch depth:

```text
7.833 LF × 25/12 FT = 16.32 SF
```

The earlier grounding fix validates quantity provenance, while the unsupported cutout is embedded in presentation text. There is no sink-evidence gate or disambiguation between a work surface and an outlet-height reference. Feature-level removals also cannot remove only the cutout modifier while retaining a countertop.

### 3. Cabinet quantity and detail reaching pricing

- Base cabinetry: exact **7.833 LF**, priced at **8 LF**.
- Upper cabinetry: exact **7.833 LF**, priced at **8 LF**, inferred across the same wall.
- Both use the confirmed 94-inch wall; this geometry is correct.

Pricing still uses legacy defaults from `remoteVision/lexicon.ts`: base `$9,100 / 24 LF` and 25 hours / 24 LF; upper `$5,400 / 24 LF` and 15 hours / 24 LF.

The current persisted intake contains none of the component schedule, so no components reach reconciliation or pricing. `scopeGrounding/cabinetry.ts` can preserve recognized components as descriptive `detail`, but `remoteVision/scenarios.ts` ignores that detail and scales one base and one upper line solely by LF. Specialty boxes, glass doors, wine storage, bread box, fillers, and oak match can at best survive as prose; they do not refine cost or labor.

### 4. Exact 3-day duration calculation

```text
generic electrical  20 × 1.00 × 0.90          = 18.000 h
base cabinets        25 × (7.833/24) × 0.90   =  7.343 h
upper cabinets       15 × (7.833/24) × 0.90   =  4.406 h
countertop            12 × (16.32/55) × 0.90  =  3.561 h
raw economy total                              ≈ 33.31 h
shown labor                                      33 h
duration             ceil(raw hours / 16)        3 days
```

The reproduced mid-range is 37 hours / 3 days. `remoteVision/scenarios.ts` assumes 16 crew-hours/day. The bad generic electrical match contributes 18–20 hours; cabinet hours are also legacy proportional defaults rather than component-aware productivity.

### 5. Input-to-output comparison

| Contractor intent | Current result | Finding |
|---|---|---|
| 94-inch wall | 7.833 LF base + upper | Correct geometry; priced at 8 LF |
| One receptacle moved upward | Generic electrical circuits/devices, 1 EA | Wrong assembly; causes $2,122 low and 18 economy hours |
| Laminate countertop | 16.32 SF countertop | Plausible geometry, but material detail absent from persisted input |
| No sink/cutout | “with new sink cutouts” | Unsupported hardcoded addition |
| Three 30-inch bases + fillers | No component schedule | Omitted before persistence/current analysis |
| Four described upper components | No component schedule | Omitted before persistence/current analysis |
| Butterscotch oak match | Generic mid-grade assumption | Omitted/distorted |
| Minor affected baseboard | No trim line | Omitted from persisted intake |
| No permit/demo/flooring/doors | No priced lines | Not added, but explicit exclusions were not persisted |

The latest measurement capture transcript includes “94 inches wide, 8 foot high,” but produced no durable item row. The earlier confirmed 94-inch row remains authoritative; the 8-foot height does not reach the estimate.

### 6. New architecture vs. live path

TradeUnitStandards/Generic Work Recognition is invoked inside `groundScope → recognizeWork`, but only as a **quantity fallback/bridge** on this screen. It does not select priced assemblies, labor, scenario costs, or duration.

The live price remains controlled by:

- `src/domains/remoteVision/lexicon.ts`: hardcoded regexes, defaults, costs, hours, and prose.
- `src/domains/remoteVision/scenarios.ts`: level factors, spreads, ratios, and 16 crew-hours/day.

This is a hybrid path: new geometry/provenance wrapped around legacy pricing. The common intelligent estimate engine and catalog assemblies are not used.

### 7. Stale browser/session contamination

No stale estimate rows or ballpark snapshots exist in the database, and a fresh diagnostic browser had no Remote Vision local state. The user’s actual browser-local contents cannot be read remotely, so contamination there is **not proven**.

Confirmed risks remain:

- Project sessions are scoped, but unlinked work shares `vwx.remoteVision.session.unlinked`.
- Reset clears only the Remote Vision session; durable photos and the separate narrative record survive.
- App-data keys are not cleared on sign-out/account switch.

For this incident, the database supports **input loss plus legacy recomputation** more strongly than cross-project contamination: the detailed schedule and exclusions are absent from persisted intake, while the wrong price and sink prose reproduce exactly from the saved generic note.

## Proposed generalized fix

1. **Use one canonical recognized-work model before pricing.** Convert Remote Vision candidates into action + subject + modifiers + exact/pricing quantity + provenance, then select assemblies from that model. Remove parallel pricing decisions from the legacy lexicon.
2. **Make intent parsing order-independent and entity-aware.** Treat “move outlet” and “outlet needs to be moved” identically; distinguish “countertop height” from countertop installation.
3. **Separate base scope from optional modifiers.** A countertop may carry `sinkCutoutCount: 0|n|unknown`; only explicit sink/cutout intent can set a positive count. Never embed optional work in a generic title.
4. **Persist structured intake before scenario generation.** Store merged transcript, measurements, exclusions, component schedule, material/finish signals, and provenance so a scenario is reproducible without browser state.
5. **Carry components through pricing.** Keep 94 inches authoritative and 8 LF as ballpark pricing quantity, while component modifiers refine labor/material allowances and display in inches. Component arithmetic validates but never replaces overall geometry.
6. **Calculate duration from resolved labor tasks.** Use common assembly/productivity labor, crew size, and productive hours/day rather than Remote Vision feature-level legacy hours.
7. **Harden exclusions and isolation.** Make exclusions typed and modifier-level, enforce them before pricing, remove the shared unlinked session or bind it to user/draft identity, and define explicit new-intake handling for photos/narrative/session data.
8. **Add cross-trade regressions.** Cover reversed grammar, height-reference false friends, prohibited optional modifiers, one-device relocations, component-rich run geometry, persisted replay, and fresh-project/browser isolation.

## Implementation scope after approval

- Replace Remote Vision’s legacy scenario inputs with canonical recognized work and common assembly/labor outputs.
- Add structured modifier/component/exclusion contracts and durable replay data.
- Correct outlet relocation and countertop-height parsing, remove unconditional sink-cutout prose, and preserve cabinet details.
- Add focused unit, integration, persistence, and live-path regressions for this case plus non-cabinet analogues.
