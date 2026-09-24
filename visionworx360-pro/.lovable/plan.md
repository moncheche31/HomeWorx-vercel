# Section-Scoped Book Matching + LLM Assembly Expansion

Part 1 unchanged. Part 2 replaced: assembly knowledge comes from a language model at estimate time, pricing comes only from the Craftsman book, and the contractor's role is review — never authoring.

## What I checked

- `cost_reference_nce2026`: 5,326 rows, 640 sections. Section names are mixed-quality (`Siding`, `Demolition`, `Sheet Metal, Flashing` alongside page fragments like `Add for color block`), so sections are a usable candidate filter only through a curated mapping.
- `assembly_templates` / `assembly_template_items`: 10 templates, 224 items — **job-level scope templates** (Kitchen Remodel, Roof Replacement) a contractor applies manually to create scope items. `tpl.roof.replacement` already lists 12 ordered components. Right shape, wrong role: no conditional flags, no quantity rules, no book binding, no generation/caching provenance, and they create scope rather than expanding a priced line. I'll keep them as-is and store cached expansions separately.
- LLM path already in use: `src/features/remote-vision/services/visionUnderstanding.server.ts` calls the Lovable AI Gateway server-side with a strict "no prices, no invented quantities" contract. Assembly expansion reuses that exact pattern and its guardrails.

---

## PART 1 — Section-scoped book matching (build first)

New table `nce_section_map`: `(trade_key, category_key nullable, assembly_key nullable, section_pattern, priority)` — most specific binding wins.

```text
roofing  -> Roofing%, Roof Coatings and Adhesives, Sheet Metal, Flashing, Sheet Metal Flashing
siding   -> Siding, Lumber, Siding, Board Siding, Soffit Systems
decks    -> Decks, Deck Railing and Stairs, Lumber%
windows  -> Windows, Window Sills%, Window Wells
```

`nce_book_lookup` gains a scoped mode: resolve the line's trade/category/assembly key to its section set, restrict candidates to those sections, then run the existing trigram + keyword scoring inside that reduced set. Global search stays as fallback for unmapped lines. All existing safety behavior is unchanged: no `Add for.../Deduct` rows as standalone matches, blank book values never overwrite, weak/tied matches stay `ambiguous_book_match`, contractor overrides untouched.

Then re-run tagging + `apply_book_line_pricing` + `apply_book_labor_rates` on the three active estimates and read back job cost, 40% sell price, book-derived vs curated vs flagged counts, and remaining true gaps.

---

## PART 2 — LLM assembly expansion (design, not built yet)

### (a) Prompt and schema

One server-only function, `expandAssembly`, in the same style as the vision analyst. Input: the recognized scope phrase, trade, project context already in the database (existing vs new construction, materials mentioned in narration, what photos showed, quantity/unit if known). Output: strict JSON, validated with zod, rejected wholesale if it fails validation.

```json
{
  "assembly_label": "Asphalt shingle roof replacement, existing sheathing",
  "components": [
    {
      "sequence": 1,
      "name": "Ice and water shield at eaves and valleys",
      "search_terms": ["ice and water shield", "eave protection membrane"],
      "typical_unit": "SF",
      "inclusion": "standard",
      "quantity_basis": "first_3ft_of_eave",
      "reason": "Code-required at eaves in cold climates"
    }
  ]
}
```

Fields are deliberately narrow: name, `search_terms` (what to look for in the book), `typical_unit`, `inclusion` (`standard` | `conditional` | `existing_typically`), `quantity_basis` (an enum of derivation rules the app already understands — `same_as_parent`, `eave_lf`, `ridge_lf`, `perimeter_lf`, `per_penetration`, `factor`, `manual`), and a one-line reason. Cap at ~15 components. Temperature low, schema strict, same-input determinism preferred.

### (b) The LLM never prices — enforced, not requested

Three layers, because a prompt instruction alone is not enforcement:

1. **Schema omission**: the response schema has no price, cost, rate, hours, or wage field. Anything extra is stripped by zod before the value leaves the function.
2. **Guard check**: reject the whole expansion if any string field parses as currency or an hours figure; log and fall back to unexpanded.
3. **Pipeline separation**: expansion output is `(name, search_terms, unit, inclusion, quantity_basis)` only. It enters the pricing pipeline through the same Part 1 book matcher every other line uses — there is no code path where a component can carry a cost into an estimate line. Every priced child line keeps `pricing_source = book/curated` provenance, so a "LLM-priced" line is not representable.

The LLM also never supplies quantities — only a `quantity_basis` naming which existing derivation rule applies. Unresolvable basis = Needs Review, never 1.

### (c) Where it fits in the flow

```text
narration / photos
  -> scope recognition (existing intent matcher)
  -> [NEW] assembly expansion:  cache hit? reuse : call LLM
  -> contractor review of the component checklist
  -> book pricing per included component (Part 1 scoped matcher)
  -> canonical cost rollup -> ballpark band / detailed lines
```

Expansion runs after recognition, before pricing, and only for scope items whose assembly is expandable (a "roofing" phrase, not a single "install one pipe boot" line). Each expanded component becomes a child estimate line under one parent, so totals, margin, crew hours, and the whole-dollar/quarter-hour invariants keep working unchanged. Ballpark applies the default checklist immediately for speed; detailed requires the review pass.

### (d) Contractor review UI

An assembly panel on the scope/estimate line:

```text
Roofing — asphalt shingle replacement           24 SQ     [Regenerate]
---------------------------------------------------------------------
[x] 1  Tear off existing, 1 layer          24 SQ    $ ...
[ ] 2  Replace sheathing (usually existing)   --    --
[x] 3  Ice & water at eaves/valleys       120 LF    $ ...
[x] 4  Synthetic underlayment              24 SQ    $ ...
[x] 5  Drip edge, all edges               210 LF    $ ...
[x] 6  Field shingles                      24 SQ    $ ...
[?] 7  Ridge vent — does this roof have one?   38 LF
[x] 8  Ridge caps                          38 LF    $ ...
[!] 9  Custom copper valley — no book match  flagged for review
---------------------------------------------------------------------
        Assembly total  $ ...    [+ Add component]   [Save as my template]
```

Checkbox includes/excludes (excluded rows stay visible, never silently vanish). Conditional rows show their question until answered. Quantities are editable and an edit permanently marks the component contractor-authored. Each row can show its "why" line and the book row it priced from. Nothing here asks him to author knowledge — only to confirm or correct.

### (e) Caching and reuse

New tables, separate from `assembly_templates`:

- `assembly_expansions` — one row per `(organization, assembly signature)` where the signature is trade + normalized phrase + the few context facts that change composition (existing vs new, material family). Stores the component list, generation model/version, and whether the contractor edited it.
- `assembly_expansion_components` — the component rows, including the contractor's include/exclude and quantity edits.

Lookup order at estimate time: contractor-edited expansion for this signature → unedited cached expansion → fresh LLM call. A contractor-edited expansion is never silently overwritten by a regeneration; regenerating is an explicit button that diffs new vs saved and asks what to keep. Over time his real practice accumulates as a byproduct of normal work — the outcome he wanted without a dictation session.

### (f) Failure modes, honestly

| Failure | Behavior |
|---|---|
| Component has no book match even scoped | Line is created with its quantity kept, labor left unresolved (never AI-guessed), and material filled by the AI material estimate described in (h), clearly labeled. Flagged in the same review path Part 1 uses, so the total is visibly estimated rather than quietly wrong. |
| LLM hallucinates a component that doesn't belong | Contractor unchecks it in review; ballpark risk is real, so anything not marked `standard` is excluded by default in ballpark, and a first-time (uncached, unreviewed) expansion tags the line "auto-expanded, unreviewed" on the estimate and proposal. |
| LLM omits a real component | Undercounting persists but is smaller than today. Mitigations: "+ Add component" in the panel, and seeding the prompt with the section list from Part 1 so the model sees what the book actually stocks for that trade. Not solvable perfectly — worth stating plainly. |
| Invalid JSON / gateway 4xx / 5xx | No expansion. The line prices exactly as it does today (single book match), with a "not expanded" note. 429/5xx retry with backoff; 402/403 surface the gateway message and stop. Expansion never blocks an estimate from being produced. |
| Model drift changes composition between runs | Cache is the defense: once expanded and reviewed, that signature never re-generates unless the contractor asks. Stored expansions record model + prompt version so a drift can be identified later. |
| Duplicate components across sibling scope items | Deduplicate within an estimate by book row + surface; overlaps the contractor keeps are his call, and flagged when quantities look double-counted. |

### (g) Labor hours stay visible per component — never collapsed

T&M billing depends on hours, so hours are a first-class output of every expanded component, not a byproduct of a dollar figure.

- Each expanded component carries its own `labor_hours` and `labor_rate`, derived from the book's craft-hours column (`B1@.093` → 0.093 hr/SF × quantity) and the craft wage × NH multiplier. Never a lump sum.
- The AI never supplies hours or rates. A component whose book row has no craft hours stays `labor_unresolved` and is flagged — it is not filled with an estimate.
- The assembly review panel shows hours per component next to the dollars, and the parent line shows the summed hours.
- The existing crew-hours → calendar-duration display keeps working: expanded children are the hour-bearing rows, the parent is a rollup, and the blended crew-size calculation sums children so a roof expanded into 10 components produces one correct duration, not a double count.
- Regression tests: hours present on every priced component; parent hours = sum of included children; quarter-hour normalization preserved; T&M view renders hours for an expanded assembly.

### (h) Material price resolution and the estimated/real distinction

Resolution order per component, first hit wins:

```text
1. Book material cost                        source: 'nce_book'         (primary)
2. Live provider price (when a key exists)   source: 'live_provider'    (slots in here later,
                                                                        reuses the existing
                                                                        material_pricing_providers
                                                                        adapter architecture)
3. AI-estimated material cost                source: 'ai_estimated_material'
4. Contractor override                       source: 'contractor'       (always wins, any stage)
```

The AI material fallback is a separate, narrow call: given the component name, unit, and region, return only `{ unit_material_cost, basis }` where `basis` is a one-line statement of what the number reflects ("mid-grade residential material, national average"). It runs only when steps 1 and 2 produce nothing. The same guards as expansion apply: no hours, no rates, no labor field in the schema, and any response carrying one is rejected.

**Making the distinction visible** — this is the trust requirement, so it appears everywhere the number does:

- **Per line/component**: a small source chip next to the material figure — `Book` (neutral), `Live` (neutral), `Est.` (amber), `Yours` (contractor override). Hover/tap shows the book row and section, the provider, or the AI's stated basis.
- **Never blended**: material and labor stay separate columns, and an estimated material never merges into a book-sourced total without its chip. No mixed-source cell exists.
- **Estimate header banner**: "3 lines use estimated material pricing — $4,120 of $51,764" with a link that filters the list to exactly those lines.
- **Filter/sort**: a "show estimated only" toggle on the line list.
- **Totals panel**: job cost splits into book-sourced vs estimated dollars, so the share of the estimate resting on estimates is a number he can see, not something he has to hunt for.
- **Proposal/PDF**: internal views carry the chips; the client-facing proposal shows prices only, with an internal-only estimated-content note on the contractor's copy.
- **Override**: editing any estimated price flips it to `contractor` provenance and drops the amber chip — same override path as every other line, preserved through refresh and reprice.

### Effort


- Part 1: one build session, then reprice and report.
- Part 2: schema + expansion function + guards, then the review panel, proven end-to-end on roofing against Pembroke before any other trade is turned on. Trades are enabled one at a time, each verified against a real estimate.

## Proposed order

1. Part 1: section map, scoped matcher, reprice the three estimates, report.
2. Part 2 skeleton: expansion function + caching tables + guards, roofing only, Pembroke as the proof.
3. Review panel, then enable trades one at a time.
