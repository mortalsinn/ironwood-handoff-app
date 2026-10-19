# Pending release: changes on `dev` not yet live

Rolling list of every change since the last release. Cleared (moved to the dated log below)
each time it goes live. Plain wording, for review with management.

## Product changes (live when released)

| # | Date | Area | Type | Change | Commit |
|---|------|------|------|--------|--------|
| 29 | 2026-10-19 | Job Tags | Improvement | v15.59: Job Tags opens on only the tags suggested for the job (from the answers and the deal name), not every tag in Zoho Projects. "All tags (N)" opens the full list; the tag box searches as you type and Enter picks the one match or adds a new tag. A restored draft keeps each tag's colour. Widget only, no Zoho function change. | pending |
| 24 | 2026-10-15 | Documents (Zoho function) | Fix | A "+" in an attachment's file name is kept when it is copied into Documents (WorkDrive turned it into a space). Paste the full create_handoff_tasks. | 7a99623e |

## Workflow (no change to the live product)

Checks, automation and tooling. They change nothing customers see.

| # | Date | Area | Type | Change | Commit |
|---|------|------|------|--------|--------|
| 1 | 2026-10-13 | Development workflow | Improvement | This project now runs on the same safety template as RibitOS: every change is listed here and posted to its Dev channel, nothing is saved without its line on this list, and going live is a Run button Jeff clicks. | 2e8273b3 |
| 2 | 2026-10-13 | Development workflow | Improvement | Updates that change only notes and lists skip the test run before uploading; code changes are still fully tested. | 82a092d4 |

## Released

| Date live | # | Area | Type | Change | Commit | Release |
|---|---|---|---|---|---|---|
| 2026-10-15 | 28 | Timeline | Improvement | v15.58: the Timeline's "Create phases in Zoho Projects" switch is removed. One sub-project is one job with its phases; two or more turn sub-projects on by themselves. | 3a212b67 | 9f6f34c |
| 2026-10-15 | 27 | Plan polish | Improvement | v15.57: the task duration is a full-size control (wider number, unit spelled out as days or hrs, wide click area with a drawn arrow); the summary strip has a labelled Hide summary / Show summary button and collapses to one slim line with the finish date and working days, remembered per browser | 85f38377 | 440cd30 |
| 2026-10-15 | 26 | Plan layout | Improvement | v15.56: the plan's section cards always run in one column, top to bottom, at every screen size, in the tab and the pop-up, detailed and compact (wide tabs used to split them into side-by-side columns). Checked at 1280, 1366, 1920 and 2560. | 819e3598 | b152e3e |
| 2026-10-15 | 25 | Job summary | Improvement | v15.55: the job summary is always the strip under the plan on the right, at every screen size and in the pop-up (it used to fall back to a card on the left below 1500px). On narrow screens the phase bar and its key take their own line inside the strip. | a26dd9e6 | 5b4e60e |
| 2026-10-15 | 23 | Handoff progress | New | v15.54: a live progress window replaces the button spinner during Generate: percentage, current step and count, completed steps, and time left measured from the run. The Zoho function reports each step through the new helper set_handoff_progress (deluge_set_handoff_progress.dg, returns string; paste as a new standalone function FIRST) into the CRM variable handoff_progress. @mentions in CRM Notes.txt now read as names. Paste both functions. | 9018053c | a709483 |
| 2026-10-15 | 22 | Documents (Zoho function) | New | At handoff every CRM attachment on the deal is copied into the project's Documents tab, plus one CRM Notes.txt with the deal description, the handoff production notes and every CRM note (app drafts and project-link notes left out). Re-runs overwrite instead of duplicating. Function pasted; zoho_projects_connection has WorkDrive.files.ALL, WorkDrive.workspace.ALL, ZohoProjects.documents.ALL. Tested: text file, image and notes copied at full size. | d28ff605 | a709483 |
| 2026-10-15 | 21 | Stair scheduling | Improvement | v15.53: construction and finished stair scheduling (section and all its tasks) default to Matthew De Man; they were left blank. Metal shop scheduling stays with Jeffery Chan. | bb17bf4e | beb3e3d |
| 2026-10-15 | 20 | Job tags | Improvement | v15.52: Project Tags renamed Job Tags. On a sub-project job the section states the tags are one set for the whole job, shared by all sub-projects, and that removing one removes it from every sub-project. | 48989602 | beb3e3d |
| 2026-10-15 | 19 | Sub-projects | Fix | v15.51: the sub-project count is a number box (1 to 12) with Continue; Open and Reset reopen the same deal in the web tab instead of dropping to the job list; no false "blueprint was damaged" notice for a sub-project with no sections; names always show after a switch. | 41786e62 | 8e398f6 |
| 2026-10-15 | 18 | Sub-projects | Improvement | v15.50 + Zoho function: the Job Wrap-Up Google review depends on the final invoice of every sub-project (one dependency call each; tested 2 of 2). Function already pasted. | f15c8def | 4bb136b |
| 2026-10-15 | 16 | Timeline | Improvement | v15.49: the Milestones button is now Timeline; its groups are called phases. On sub-project jobs it is shown too, as one bar per sub-project from the same start plus the Job Wrap-Up (preview only). | 73e1ea4d | b565886 |
| 2026-10-15 | 17 | Stairs | Improvement | v15.49: Steel Stairs renamed Metal Stairs (tasks too). Stair types in the order Temporary, Construction, Finished, Metal, and their sections follow that order. | 73e1ea4d | b565886 |
| 2026-10-15 | 14 | Sub-projects | New | v15.48: a job can be split into named sub-projects. Shared questions (owner, new build or renovation, scope, travel) are asked once; the rest once per sub-project. Each becomes its own task list and milestone in Zoho, all starting today, each on its own timeline with its own follow up and final invoice; one Google review after the last. Split view: sub-project cards, a draggable divider, and the sub-project on screen as one list. One sub-project works as before. | b83bde0d | 8e8789c |
| 2026-10-15 | 15 | Sub-projects (Zoho function) | New | create_handoff_tasks: each sub-project's task chain starts fresh instead of waiting on the sub-project before it, and the retry check matches list plus task name, so each sub-project's close out tasks are created. Paste the full function into Zoho. | b83bde0d | 8e8789c |
| 2026-10-15 | 13 | Project tags | Improvement | v15.47: smart tags. The tags that fit the job are ticked from the answers; client, address and interior / exterior are matched from the deal and account names; suggested tags are listed first and people tags are hidden from the picker. Only existing Zoho tags are suggested. | 5d2db286 | 621887c |
| 2026-10-15 | 11 | Stairs | New | v15.46: Steel Stairs is a stair type. One line per stair or landing; the metal shop gets measure, shop drawing, fabrication and coating, Joel gets the install, and the wood shop is not involved (Don Anderson needed this by hand). | 2b1b1192 | ccada96 |
| 2026-10-15 | 12 | Owner tags | Fix | Zoho function: owner tags work on jobs with no project tags. The existing tags were only loaded when a job had project tags, so every owner tag was re-created and refused as a duplicate. Paste the full create_handoff_tasks into Zoho. | 2b1b1192 | ccada96 |
| 2026-10-15 | 9 | Wood shop items | Fix | v15.45: custom wood shop items are saved in the CRM variable handoff_wood_items, so everyone sees one shared list (was per browser). Needs the zcrm connection to have the variables scope. | 720827d1, 53078090 | a512f8f |
| 2026-10-15 | 10 | Launch from outside | New | New function run_handoff_rest (deluge_run_handoff_rest.dg): the REST door to create_handoff_tasks, so a handoff Claude launches runs the same function as the Generate button. Paste as a new standalone function with REST API OAuth on. | 720827d1, 53078090 | a512f8f |
| 2026-10-15 | 8 | Milestones | Improvement | v15.44: the milestone window uses the full screen; the timeline has months across the top, shaded alternate months, working days on each bar, room after the last milestone so nothing is cut off, labels beside bars too short for them, and summary chips in the header. | d7c2cd49 | 01f84a2 |
| 2026-10-14 | 7 | Milestones | Improvement | v15.43: "Milestones & Timeline" is a solid blue button with a calendar icon and the milestone count at the top of the plan; it was a small pill that was easy to miss. | 58301035 | 25dac30 |
| 2026-10-14 | 6 | Milestones | New | v15.42: Milestones button above the plan opens a milestone editor with a timeline preview. Sections start grouped into suggested milestones (Construction Stairs, Finished Stairs, Railing, Glass, Close Out); milestones can be renamed, added, removed and reordered, sections dragged between them, and each has an owner and an Internal or Client setting. On Generate, each milestone is created in Zoho Projects with its own task list; task dates and order are unchanged. Deluge change (deluge_handoff_function.dg): paste into Zoho at release. | 9cf8eb34 | b81a0be |
| 2026-10-14 | 5 | Deal link | Fix | Every handoff links its new project into the Deal's Zoho Projects section, using the call confirmed today. Deluge change (deluge_handoff_function.dg): paste into Zoho after creating the CRM connection "zcrm". | 9bf9282c | 88be016 |
| 2026-10-14 | 4 | Railing | Fix | v15.41: Wood Shop Items tasks reach Zoho tagged [Rails] like the rest of the wood shop's work, not with the internal name "[wood-before]". | 2c5b4051 | 88be016 |
| 2026-10-14 | 3 | Railing | New | v15.40: Wood Shop Items on metal jobs. Under Metal, tick Cap rail, Shoe or Tread caps, or add an item with + (remembered for next time). Shoe, tread caps and added items get a Wood Shop Items section scheduled before the metal install; a cap rail still goes on after. | c73f1068 | 4ed5219 |
