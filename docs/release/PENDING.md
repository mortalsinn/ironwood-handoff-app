# Pending release: changes on `dev` not yet live

Rolling list of every change since the last release. Cleared (moved to the dated log below)
each time it goes live. Plain wording, for review with management.

## Product changes (live when released)

| # | Date | Area | Type | Change | Commit |
|---|------|------|------|--------|--------|
| 4 | 2026-10-14 | Railing | Fix | v15.41: Wood Shop Items tasks reach Zoho tagged [Rails] like the rest of the wood shop's work, not with the internal name "[wood-before]". | (this commit) |

## Workflow (no change to the live product)

Checks, automation and tooling. They change nothing customers see.

| # | Date | Area | Type | Change | Commit |
|---|------|------|------|--------|--------|
| 1 | 2026-10-13 | Development workflow | Improvement | This project now runs on the same safety template as RibitOS: every change is listed here and posted to its Dev channel, nothing is saved without its line on this list, and going live is a Run button Jeff clicks. | 2e8273b3 |
| 2 | 2026-10-13 | Development workflow | Improvement | Updates that change only notes and lists skip the test run before uploading; code changes are still fully tested. | 82a092d4 |

## Released

| Date live | # | Area | Type | Change | Commit | Release |
|---|---|---|---|---|---|---|
| 2026-10-14 | 3 | Railing | New | v15.40: Wood Shop Items on metal jobs. Under Metal, tick Cap rail, Shoe or Tread caps, or add an item with + (remembered for next time). Shoe, tread caps and added items get a Wood Shop Items section scheduled before the metal install; a cap rail still goes on after. | c73f1068 | 4ed5219 |
