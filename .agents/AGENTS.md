# Ironwood Stair & Rail - Production Handoff Protocol

## Tech Stack & Architecture
- **Single-File Setup**: The entire frontend application is housed in `index.html`. All styles use Tailwind CSS via CDN, and all logic is embedded in the bottom `<script>` tag.
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
- **SDK**: Uses the Zoho Embedded App SDK (`https://live.zwidgets.com/js-sdk/1.1/ZohoEmbededAppSDK.min.js`).
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
3. **Miro (Mermaid) Flowchart**: The app can compile the active project blocks and tasks into a Mermaid JS flowchart string, color-coded by department (e.g., Fabrication=Blue, Installation=Red, QA=Orange, Custom=Purple), and copy it to the clipboard.
4. **Data Validation**: Prior to generating the production run, the UI enforces that every block has an assigned user (checking against `"UNASSIGNED"`). It will glow red if verification fails.
5. **Default Assignees**: specific users (Matthew De Man, Thomas Macleod, Joel Nalder) are auto-populated to specific stages on DOM load.
6. **Changelog & Versioning**: There is an integrated Changelog in the top right. **CRITICAL RULE**: ALWAYS bump the version number in the `<title>` tag, the `#localSimulator` `<h1>` tag, and add release notes to the `#changelogOverlay` inside `index.html` every single time you push new features or bug fixes. Do not forget this step!

## Best Practices
- **DOM Mutations**: Be extremely careful when using `element.textContent = ...` or `element.innerHTML = ...` on pre-rendered items, as this will destroy attached SVGs (like drag handles) or custom button elements. Use `querySelector` to target inner text nodes.
- **State Preservation**: Because it operates in a Zoho iframe widget, any page refresh wipes the entire state. Ensure all actions that modify state do so defensively and provide clear UI feedback (modals, success spinners) before reloading or closing the popup.
- **Auto-Refreshing CRM**: `window.top.location.reload()` and `ZOHO.CRM.UI.Record.open()` are highly unreliable inside Zoho's strict iframe sandbox and often fail to refresh the background record data after API calls. The best practice is to show a success message instructing the user to manually "Hit F5".
- **Custom Items & Layouts**: Dynamically rendering custom items into the standard base layout can break toggle visibility. Keep custom logic highly isolated or heavily tested.

## Output Formatting for External Scripts
When providing code updates or modifications for external scripts that the user must copy and paste manually (e.g., Zoho Deluge functions, external APIs), **always provide the full, complete code block** containing the entire script with the new updates incorporated. 
Do not provide partial snippets or diffs (e.g., "add this line here"). The user should be able to Ctrl+A and Ctrl+C the entire block to replace their existing code instantly.

## Zoho Projects API & User IDs
- **API Fetching**: Do NOT rely on standalone Deluge functions to fetch Zoho Projects data into the frontend widget if REST API access isn't explicitly configured. Instead, use `ZOHO.CRM.CONNECTION.invoke("zoho_projects_connection", { url: "...", method: "GET" })` directly in the frontend. This securely bypasses CORS and permission walls.
- **ID Discrepancy**: Zoho Projects User IDs (9-digits) are completely different from Zoho CRM User IDs (19-digits). ZUIDs are not required when passing data directly to the Projects API. If using `POST /users/` to invite users to a project in a Deluge script, simply pass the native 9-digit Projects User ID.
- **Payload Extraction**: Always ensure that dynamically extracting `person_responsible` assignments from the DOM targets the actual underlying `id` attributes or `data-` attributes correctly. Avoid `.querySelector` scopes inside nested loops that might shadow variables and accidentally nullify payload data, as Zoho Projects will natively accept empty assignees (`""`) and create tasks completely unassigned without throwing an error.
