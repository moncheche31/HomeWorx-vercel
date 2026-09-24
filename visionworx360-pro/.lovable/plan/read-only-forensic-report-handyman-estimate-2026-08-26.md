# Read-only forensic report: Handyman estimate

## Scope
Produce a plain-language forensic report for project `081453d1-179a-47f7-aa22-a5a4f56a9eda` and estimate `f279f3e2-68fd-4092-821f-2bdf9c59af92`. Make no code or database changes.

## Verified evidence to report
1. Present Michael’s verbatim stored narration and inventory the 11 attached JPEGs by filename and capture time.
2. Trace the actual generation path from Photos/Video intake through deterministic `analyzeDescription`, scope admission, quantity grounding, narrative generation, replay persistence, and scenario pricing. Distinguish this from the unused voice-draft parser and from manually applied scope templates.
3. Explain each fabricated line from its stored evidence and provenance:
   - “plumbing chase” became a plumbing lump-sum default;
   - fascia was misclassified as 2,800 SF of siding through a two-room catalog default;
   - localized white paint became 736 SF of interior painting;
   - trim wording became 113 LF of trim;
   - 10×21 ceiling insulation became a 1,800 SF two-room default.
   Confirm whether any persisted window scope exists.
4. Explain photo handling: photos were attached, but this run persisted `visual_status = no_media`, no visual observations, no provider/model ID, and no analyzed timestamp. Therefore no LLM vision output contributed to this saved scope or price.
5. Trace the door question to the deterministic observation generated from “access door,” then distinguish it from the scope-filtered fixed ballpark question library.
6. Reconstruct the cost basis from the three stored scenario snapshots, including every assembly, quantity, labor hour, labor/material subtotal, markup, and low/high spread. Identify siding as the dominant driver.
7. Call out persistence state: zero `scope_items`, zero `estimate_line_items`, zero ballpark-session rows, and null estimate `range_snapshot`; the UI result was backed by the serialized `__remoteVisionReplay` rather than canonical estimate lines.

## Technical references
Cite exact file and line ranges for the deterministic parser, admission/grounding, replay commit path, photo-analysis prompt, media fusion authority, question filtering, assembly mapping, canonical scenario pricing, and range construction. Separate behavior present when the Aug 25 replay was captured from protections added afterward, so current code is not mistaken for the historical cause.
