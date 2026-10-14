# Pending release: changes on `dev` not yet live

Rolling list of every change since the last release. Cleared (moved to the dated log below)
each time it goes live. Plain wording, for review with management.

## Product changes (live when released)

| # | Date | Area | Type | Change | Commit |
|---|------|------|------|--------|--------|
| 7 | 2026-10-14 | Milestones | Improvement | v15.43: "Milestones & Timeline" is a solid blue button with a calendar icon and the milestone count at the top of the plan; it was a small pill that was easy to miss. | 58301035 |

## Workflow (no change to the live product)

Checks, automation and tooling. They change nothing customers see.

| # | Date | Area | Type | Change | Commit |
|---|------|------|------|--------|--------|
| 1 | 2026-10-13 | Development workflow | Improvement | This project now runs on the same safety template as RibitOS: every change is listed here and posted to its Dev channel, nothing is saved without its line on this list, and going live is a Run button Jeff clicks. | 2e8273b3 |
| 2 | 2026-10-13 | Development workflow | Improvement | Updates that change only notes and lists skip the test run before uploading; code changes are still fully tested. | 82a092d4 |

## Released

| Date live | # | Area | Type | Change | Commit | Release |
|---|---|---|---|---|---|---|
| 2026-10-14 | 6 | Milestones | New | v15.42: Milestones button above the plan opens a milestone editor with a timeline preview. Sections start grouped into suggested milestones (Construction Stairs, Finished Stairs, Railing, Glass, Close Out); milestones can be renamed, added, removed and reordered, sections dragged between them, and each has an owner and an Internal or Client setting. On Generate, each milestone is created in Zoho Projects with its own task list; task dates and order are unchanged. Deluge change (deluge_handoff_function.dg): paste into Zoho at release. | 9cf8eb34 | b81a0be |
| 2026-10-14 | 5 | Deal link | Fix | Every handoff links its new project into the Deal's Zoho Projects section, using the call confirmed today. Deluge change (deluge_handoff_function.dg): paste into Zoho after creating the CRM connection "zcrm". | 9bf9282c | 88be016 |
| 2026-10-14 | 4 | Railing | Fix | v15.41: Wood Shop Items tasks reach Zoho tagged [Rails] like the rest of the wood shop's work, not with the internal name "[wood-before]". | 2c5b4051 | 88be016 |
| 2026-10-14 | 3 | Railing | New | v15.40: Wood Shop Items on metal jobs. Under Metal, tick Cap rail, Shoe or Tread caps, or add an item with + (remembered for next time). Shoe, tread caps and added items get a Wood Shop Items section scheduled before the metal install; a cap rail still goes on after. | c73f1068 | 4ed5219 |
