# Ironwood Stair & Rail - Production Handoff Protocol

## 🚨 CRITICAL RULES 🚨
1. **MANDATORY VERSION BUMP**: Every single time you modify logic, fix a bug, or add a feature to `index.html`, you MUST:
   - Bump the version number in the `<title>` tag.
   - Bump the version number in the `#localSimulator` `<h1>` tag.
   - Bump the version number in the `vX.XX` header UI tag.
   - Add a detailed entry to the `#changelogOverlay` modal.
   - **Do this in the same step as your code changes, before pushing to git.**

## Tech Stack & Architecture
- **Single-File Setup**: The entire frontend application is housed in `index.html`. All styles use Tailwind CSS via CDN, and all logic is embedded in the bottom `<script>` tag.
- **Styling (v12.1+)**: Tailwind is NO LONGER loaded from a CDN. The compiled stylesheet is inlined in `<style id="tw-compiled">`. CRITICAL: if you add a Tailwind class to index.html that was never used before, it will NOT render until the stylesheet is regenerated. Regenerate with:
  `npx -y tailwindcss@3.4.17 -c tailwind.config.js -i tw-input.css -o tailwind.out.css --minify` (config content = ['index.html'], input = the three @tailwind directives), then replace the contents of the `tw-compiled` style tag. Alternatively use a handwritten CSS rule in the main `<style>` block. SortableJS 1.15.2 and canvas-confetti 1.6.0 are also inlined; the only external script is Zoho's SDK.
- **Styling Guidelines**:
  - Uses Tailwind CSS defaults with extended colors (slate for dark themes, sky/emerald/rose/orange for specific states).
  - Modern, clean aesthetic utilizing `bg-slate-900`, `backdrop-blur`, glassmorphism, rounded corners (`rounded-xl`), and subtle borders.
  - Interactive elements must use distinct hover states (`hover:bg-slate-800`, `transition-all`).
- **Icons**: Inline SVGs are used for all iconography (Feather icons or similar minimal stroke icons).

## Deployment Flow
- **GitHub & Render**: The codebase is deployed via Render which watches the `main` branch on GitHub.
- **Workflow**: 
  1. Make changes locally.
  2. Commit and push (`git add index.html && git commit -m "..." && git push`).
  3. Wait approximately 60 seconds for Render to finish deploying the updated `index.html`.
  4. Instruct the user to "hard refresh" the app in their browser.

## Zoho CRM Integration
- **SDK**: Uses the Zoho Embedded App SDK (`https://live.zwidgets.com/js-sdk/1.2/ZohoEmbededAppSDK.min.js`).
- **Initialization**: `ZOHO.embeddedApp.init()` must be called to bind context.
- **Context Fetching**: `ZOHO.embeddedApp.on("PageLoad", function(data){...})` is used to fetch the active Entity and EntityId (e.g., the Deal record ID).
- **Functions**: To generate the project structure, the app invokes a Deluge function via `ZOHO.CRM.FUNCTIONS.execute("create_handoff_tasks", { arguments: JSON.stringify({...}) })`.
- **API Updates**: To perform fast CRM updates (like "Mark Closed Won"), use `ZOHO.CRM.API.updateRecord({ Entity, RecordID, APIData })`. 
  - *CRITICAL LEARNING*: If you want to silently update data, do NOT pass `Trigger: ["workflow", "blueprint", "approval"]`. This will fire the user's backend CRM automations (e.g., automatically pushing Deals into Zoho Projects prematurely). Pass `Trigger: []` or omit the trigger block to bypass background automations.
- **Local Simulation**: The app provides a "Local Simulator" screen (`#localSimulator`) that mimics the Zoho context for testing without needing to deploy to Zoho Widget hosting every time.

## Core Features & Logic
1. **Drag and Drop**: Utilizes `SortableJS`.
   - Top-level blocks are sortable via `.block-handle`.
   - Task items inside blocks are sortable and transferrable between blocks using `group: 'shared-tasks'` and `handle: '.task-drag-handle'`. Always preserve the drag handle SVG when modifying DOM innerHTML dynamically.
2. **Dynamic UI Generation**: Tasks and checkboxes build dynamically based on conditional rules (e.g., Glass Spindles changes "Railing Installation" to "Railing Framework Installation").
3. **Miro export removed (v11.28)**: The Copy Miro Code / Mermaid flowchart generator was a development-era tool and has been deleted.
4. **Data Validation**: Prior to generating the production run, the UI enforces that every block has an assigned user (checking against `"UNASSIGNED"`). It will glow red if verification fails.
5. **Default Assignees**: specific users (Matthew De Man, Thomas Macleod, Joel Nalder) are auto-populated to specific stages on DOM load.

## Best Practices
- **DOM Mutations**: Be extremely careful when using `element.textContent = ...` or `element.innerHTML = ...` on pre-rendered items, as this will destroy attached SVGs (like drag handles) or custom button elements. Use `querySelector` to target inner text nodes.
- **State Preservation**: Because it operates in a Zoho iframe widget, any page refresh wipes the entire state. Ensure all actions that modify state do so defensively and provide clear UI feedback (modals, success spinners) before reloading or closing the popup.
- **Auto-Refreshing CRM**: `window.top.location.reload()` and `ZOHO.CRM.UI.Record.open()` are highly unreliable inside Zoho's strict iframe sandbox and often fail to refresh the background record data after API calls. The best practice is to show a success message instructing the user to manually "Hit F5".
- **Custom Items & Layouts**: Dynamically rendering custom items into the standard base layout can break toggle visibility. Keep custom logic highly isolated or heavily tested.

## Output Formatting for External Scripts
When providing code updates or modifications for external scripts that the user must copy and paste manually (e.g., Zoho Deluge functions, external APIs), **always provide the full, complete code block** containing the entire script with the new updates incorporated. 
Do not provide partial snippets or diffs (e.g., "add this line here"). The user should be able to Ctrl+A and Ctrl+C the entire block to replace their existing code instantly.

## Deluge Parser Constraints (learned 2026-07-28)
The Zoho CRM function editor rejected a script with "Improper code format" until ALL of the following were removed. When writing Deluge, stick to constructs already proven in this repo's `deluge_handoff_function.dg`:
- **No `variable = null;` assignments** — use an empty string `""` sentinel and compare with `== ""` (comparing an API result `== null` is fine; assigning null is not).
- **No boolean flag assignments** (`flag = false;`) — use string flags: `flag = "no";` / `flag = "yes";`.
- **No collection literals in assignments** (`list = {1,2,3};`) — build lists with `"1,2,3".toList(",")` or `List()` + `.add()`.
- **No bare `!variable` negation** — write `variable == "no"` / explicit comparisons (`!list.contains(x)` on a method call IS fine).
- **Avoid `||`** — restructure into sequential ifs; `&&` is proven fine.
- **ASCII only** — no em-dashes or smart quotes anywhere, including comments.
- **No `break`/`while`** — use a for-each over a fixed list with a guard flag for retry loops.
- Paste over the existing standalone function; never create a new function (the widget calls it by name via ZOHO.CRM.FUNCTIONS.execute).

## v10.0 Workflow (Archetype) Engine
The right-panel blueprint is generated from `ARCHETYPES` in index.html — the team's six production workflows (compiled from the July 2026 Miro sessions; spec artifact referenced in project memory). Rules:
- Each archetype block reconciles (created when its `when(state)` is true, removed when false) — existing blocks are NEVER re-rendered, so user edits survive. Change task definitions in `ARCHETYPES`, not in DOM code.
- Task fields: `phase` (setup/fab/qa/install/wrap — drives color), `owner` (role: SALES/TOM/MATT/JOEL/JEFFERY — resolved against the live Projects roster; SALES = the Deal owner), `site` (hidden on Supply Only jobs), `esa` ([ESA] prefix when travel flagged), `cond(state)` (e.g. Needs Site Measure checkbox, Renovation removal tasks).
- Blocks whose tasks are all hidden hide entirely (no empty milestones/validation).
- `applyRoleDefaults()` only fills UNASSIGNED inputs — never overwrite a human assignment.
- Drafts carry `schema: 10`; pre-v10 drafts skip the right-panel snapshot and regenerate fresh.
- Every job ends with the Accounting Close Out block (Jeffery / Zoho Books) — do not remove.

## v12.0 Shared Drafts
- "Save Draft" persists the draft to the Deal itself as chunked CRM Notes titled `IRONWOOD_DRAFT [i/N] - widget draft data, do not delete` (28k chars/chunk; savedBy/savedAt lead the JSON so chunk 1 carries the meta). Anyone opening the widget on that Deal auto-loads the newest of shared-vs-local at PageLoad, with an authorship banner.
- Auto-save while typing stays LOCAL only (API rate limits); shared writes happen on the explicit Save Draft button. Overwrite protection compares the remote savedAt against loadedSharedSavedAt and confirms before clobbering a newer save. Last-write-wins by design.
- Generate success and Reset both delete the shared draft notes (post-generation truth lives in Zoho Projects). All shared-draft calls are fail-soft: any API error falls back to local-only behavior.
- Uses only APIs already proven in this widget: getRelatedRecords / insertRecord / deleteRecord on Notes, plus ZOHO.CRM.CONFIG.getCurrentUser for authorship.

## v11.0 Timeline & Dependencies
- Every archetype task has `days: N` (default working days) rendered as an editable `.task-days-input` per task; `data-days` on the `<li>` is the payload source of truth (the input handler syncs both it and the `value` attribute so snapshots keep edits). Section headers show a live `.block-days-total` badge.
- On Generate the widget computes start/end dates per task: each Zoho task list is a parallel lane, tasks sequential within the lane by working days (weekends skipped), anchored on the generation date, format MM-dd-yyyy. `chain_group` (per visible block) marks section boundaries.
- The Deluge script passes start_date/end_date on task creation and wires finish-to-start dependencies at chain_group boundaries using captured task ids (existing-task fetch captures name→id_string so retries can wire too). Dependency calls are FAIL-OPEN with two endpoint attempts (task update with predecessor_ids, then /dependency/) — verify which one the portal accepts via execution logs on first live run.
- Drafts carry `schema: 11`; older snapshots regenerate fresh.
- Zoho admin side: portal dependency mode (strict vs flexible) and per-user "predecessor completed" notifications are configured in Zoho Projects, not the widget.

## v9.0 Architecture Contracts (do not regress these)
1. **Event delegation on `#projectPreviewList`**: All "+ add task" buttons and contenteditable task edits are handled by ONE delegated listener on the persistent container. Never bind per-button listeners on preview-panel content — the auto-save snapshot (`previewListHTML` via innerHTML) destroys element listeners on restore, delegation survives. Inline `onclick` attributes are still valid inside the snapshot (they serialize) — that's why openUserModal/delete buttons keep them.
2. **`window.triggerAutoSave`**: intentionally exposed globally. Inline onclick handlers execute in global scope, so a closure-only `triggerAutoSave` silently no-ops there (this was a real bug pre-v9.0).
3. **Idempotent SortableJS**: always bind drag-and-drop through `initSortable()`/`bindAllSortables()` (they destroy the previous instance stored on `el._sortable` first). Direct `new Sortable(...)` after a restore double-binds.
4. **`data-user-edited`**: stamped on a task `<li>` when the user renames it inline. `setTaskText()` skips those tasks — never overwrite a user's manual rename from `updateBlueprintPreview`.
5. **Live checkbox queries**: `updateBlueprintPreview` derives `anyRequirementChecked` from a live `form.querySelectorAll` and change events are delegated on the form — custom options added after load must keep working.
6. **Escape user input**: run any user-typed text through `escapeHtml()` before inserting into innerHTML templates; `sanitizeLabel()` for strings embedded in inline onclick attributes.
7. **Backend result contract**: the Deluge function returns strings prefixed `"Error"` (hard failure — nothing usable created), `"Warning"` (project exists but some tasks failed — widget shows "Handoff Incomplete", keeps the draft, retry is safe) or `"Success"`. The frontend parses these prefixes; keep them stable.
8. **Backend idempotency**: `create_handoff_tasks` re-uses an existing project with the same name and skips tasks whose names already exist, so retries fill gaps instead of duplicating. Do not reintroduce blind delays (the old postman-echo call) — readiness is polled against the real tasklists endpoint.
9. **Notes after success**: production notes are pushed to the Deal only AFTER the Deluge function succeeds, so failed attempts + retries can't duplicate notes.

## Zoho Projects API & User IDs
- **API Fetching**: Do NOT rely on standalone Deluge functions to fetch Zoho Projects data into the frontend widget if REST API access isn't explicitly configured. Instead, use `ZOHO.CRM.CONNECTION.invoke("zoho_projects_connection", { url: "...", method: "GET" })` directly in the frontend. This securely bypasses CORS and permission walls.
- **ID Discrepancy**: Zoho Projects User IDs (9-digits) are completely different from Zoho CRM User IDs (19-digits). ZUIDs are not required when passing data directly to the Projects API. If using `POST /users/` to invite users to a project in a Deluge script, simply pass the native 9-digit Projects User ID.
- **Payload Extraction**: Always ensure that dynamically extracting `person_responsible` assignments from the DOM targets the actual underlying `id` attributes or `data-` attributes correctly. Avoid `.querySelector` scopes inside nested loops that might shadow variables and accidentally nullify payload data, as Zoho Projects will natively accept empty assignees (`""`) and create tasks completely unassigned without throwing an error.
