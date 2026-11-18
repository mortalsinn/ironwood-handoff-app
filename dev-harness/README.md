# Handoff test copy and local harness

## Test copy for the office network

**URL:** http://192.168.1.195:5050

- Pick a sample deal (renovation wood railing, finished stair with two sub-projects, glass railing).
- The form is the current `dev` version: `index.html` is read from disk on every request, so a refresh shows the latest change.
- Sample people and deals only. The Zoho SDK is replaced by `zoho-stub.js`; nothing is sent to Zoho. Generate opens a panel with what would have been sent (milestones, tasks with owners, start and end, and the full payload).
- Each browser keeps its own draft per sample deal. Reset in the form starts over.

### Service

It runs as a systemd user service, `handoff-testcopy.service` (this folder; installed in `~/.config/systemd/user/`). Lingering is on for `devserver`, so it starts at boot and restarts if it stops.

```bash
systemctl --user status handoff-testcopy      # is it running
systemctl --user restart handoff-testcopy     # restart (after editing serve.js or zoho-stub.js)
journalctl --user -u handoff-testcopy -n 50   # its log
```

Changes to `index.html` need no restart. To run it by hand instead: `node dev-harness/serve.js` (port 5050 on all interfaces; `PORT=` and `HOST=` override).

### Firewall

Coworkers reach it only once port 5050 is open. Jeff runs this once (it needs sudo):

```bash
sudo ufw allow from 192.168.1.0/24 to any port 5050 proto tcp comment 'Handoff test copy'
```

## Local harness (puppeteer)

`harness.js` opens `index.html` in headless Chromium with the stub, a fixed "now" and the Alberta time zone. Scenario scripts:

| Script | What it checks |
|---|---|
| `s1.js [date]` | Renovation wood railing against an install date; prints the plan and the payload |
| `s2.js`, `subprojects.js` | Sub-projects: shared start, own close out, Job Wrap-Up last, planned time on the cards |
| `s3.js` | Glass job and the install date check window |
| `olddraft.js`, `legacy.js` | A v15.69 draft (date meant the project start) asks before reusing it |
| `units.js` | Days and hours switching keeps the exact time |
| `closedwon.js` | The install date choice survives Mark Closed Won |
| `sched_probe.js` | Scheduler edge cases (holidays, today, weekends) |
| `testcopy_walk.js [url]` | Walks the network test copy end to end |

Run from this folder, for example `node s1.js 2026-12-23`. Screenshots (`*.png`) and saved drafts (`*.json`) are not committed.
