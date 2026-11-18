// Network test copy of the Ironwood Handoff widget, for coworkers on the office network.
// http://<this computer>:5050  (Jeff's desktop: http://192.168.1.195:5050)
//
// - Serves the CURRENT index.html from disk on every request, so a refresh shows the latest dev.
// - The Zoho SDK is replaced by zoho-stub.js: sample deals and people, and nothing is ever sent
//   to Zoho. Generate shows the payload that would have been sent, in a panel.
// - Run: node dev-harness/serve.js   (systemd user service: handoff-testcopy.service)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = +process.env.PORT || 5050;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const STUB = path.join(__dirname, 'zoho-stub.js');
const SDK_TAG = '<script defer src="https://live.zwidgets.com/js-sdk/1.2/ZohoEmbededAppSDK.min.js"></script>';

// Sample deals. Names are made up; the widget reads the address from the deal name.
const DEALS = [
    { id: '9101', title: 'Renovation, wood railing', note: 'Answer: Renovation, wood railing, straight, wood spindles.',
      deal: { Deal_Name: 'Sample Homeowner - RAIL - 101 Sample Street SW', Account_Name: { name: 'Sample Homeowner' } } },
    { id: '9102', title: 'Finished stair, two sub-projects', note: 'Set 2 sub-projects: a finished stair in the first, a railing in the second.',
      deal: { Deal_Name: 'Sample Builder - STAIRS + RAIL - 202 Example Avenue NW', Account_Name: { name: 'Sample Builder Ltd' } } },
    { id: '9103', title: 'Glass railing', note: 'Answer: railing, glass (framed or frameless).',
      deal: { Deal_Name: 'Sample Owner - GLASS RAIL - 303 Demo Road SE', Account_Name: { name: 'Sample Owner' } } }
];

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const BANNER_CSS = `
#tcBanner { position: fixed; top: 6px; left: 50%; transform: translateX(-50%); z-index: 99999; pointer-events: none;
  background: #b45309; color: #fff; font: 600 12px/1.2 system-ui, sans-serif; padding: 5px 12px; border-radius: 999px;
  box-shadow: 0 2px 10px rgba(0,0,0,.35); white-space: nowrap; }
#tcPanel { position: fixed; inset: 0; z-index: 100000; background: rgba(2,6,23,.82); display: none; align-items: center; justify-content: center; padding: 24px; }
#tcPanel.open { display: flex; }
#tcPanel .box { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 14px; width: min(1100px, 100%); max-height: 100%;
  display: flex; flex-direction: column; font: 13px/1.45 system-ui, sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,.5); }
#tcPanel header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #1e293b; }
#tcPanel header b { font-size: 15px; }
#tcPanel .body { overflow: auto; padding: 14px 18px; }
#tcPanel table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; }
#tcPanel th, #tcPanel td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #1e293b; vertical-align: top; }
#tcPanel th { color: #94a3b8; font-weight: 600; font-size: 12px; }
#tcPanel h4 { margin: 12px 0 4px; font-size: 13px; color: #7dd3fc; }
#tcPanel pre { white-space: pre-wrap; word-break: break-word; background: #020617; padding: 10px; border-radius: 8px; font-size: 11.5px; }
#tcPanel button { background: #0284c7; color: #fff; border: 0; border-radius: 8px; padding: 7px 14px; font-weight: 600; cursor: pointer; }
`;

// Runs after the stub: show the payload instead of calling Zoho.
const PANEL_JS = `
(function () {
  var who = {};
  (window.__ZSTUB.users || []).forEach(function (u) { who[u.id] = u.name; });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function show(p) {
    var el = document.getElementById('tcPanel');
    var tasks = p.ordered_tasks || [].concat.apply([], Object.keys(p.task_lists || {}).map(function (k) { return (p.task_lists[k] || []).map(function (t) { t.list = t.list || k; return t; }); }));
    var h = '<p>Nothing was sent to Zoho. This is what the handoff would create.</p>';
    h += '<table><tr><th>Install date</th><td>' + esc(p.install_date_label || 'none') + '</td><th>Schedule</th><td>' + esc(p.schedule_mode === 'install_date' ? 'Back from the install date' : 'Planned days from today') + '</td></tr>';
    h += '<tr><th>Project start</th><td>' + esc(p.project_start) + '</td><th>Project end</th><td>' + esc(p.project_end) + '</td></tr></table>';
    if (p.milestones && p.milestones.length) {
      h += '<h4>Milestones</h4><table><tr><th>Name</th><th>Start</th><th>End</th></tr>';
      p.milestones.slice().reverse().forEach(function (m) { h += '<tr><td>' + esc(m.name) + '</td><td>' + esc(m.start_date) + '</td><td>' + esc(m.end_date) + '</td></tr>'; });
      h += '</table>';
    }
    h += '<h4>Tasks (' + tasks.length + ')</h4><table><tr><th>Task list</th><th>Task</th><th>Owner</th><th>Start</th><th>End</th></tr>';
    tasks.forEach(function (t) {
      h += '<tr><td>' + esc(t.list || '') + '</td><td>' + esc(t.name) + '</td><td>' + esc(t.owner_name || who[t.person_responsible] || '') + '</td><td>'
        + esc(t.start_date) + ' ' + esc(t.start_time || '') + '</td><td>' + esc(t.end_date) + ' ' + esc(t.end_time || '') + '</td></tr>';
    });
    h += '</table><details><summary>Full payload (JSON)</summary><pre>' + esc(JSON.stringify(p, null, 2)) + '</pre></details>';
    el.querySelector('.body').innerHTML = h;
    el.classList.add('open');
  }
  var ex = window.ZOHO.CRM.FUNCTIONS.execute;
  window.ZOHO.CRM.FUNCTIONS.execute = function (name, req) {
    return ex(name, req).then(function (r) {
      if (name === 'create_handoff_tasks' && window.__LAST_PAYLOAD) setTimeout(function () { show(window.__LAST_PAYLOAD); }, 300);
      return r;
    });
  };
  document.addEventListener('click', function (e) { if (e.target && e.target.id === 'tcClose') document.getElementById('tcPanel').classList.remove('open'); });
})();
`;

function pickerPage() {
    const items = DEALS.map(d => `<li><a href="/deal/${d.id}">${esc(d.title)}</a><div class="n">${esc(d.deal.Deal_Name)}</div><div class="n">${esc(d.note)}</div></li>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Handoff Test Copy</title><style>
body { margin: 0; background: #0f172a; color: #e2e8f0; font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 32px 16px; }
h1 { font-size: 22px; margin: 0 0 4px; } p { color: #94a3b8; }
.b { display: inline-block; background: #b45309; color: #fff; font-weight: 600; font-size: 12px; padding: 4px 10px; border-radius: 999px; }
ul { list-style: none; padding: 0; } li { background: #111c33; border: 1px solid #334155; border-radius: 12px; padding: 14px 16px; margin: 10px 0; }
a { color: #7dd3fc; font-weight: 600; font-size: 16px; text-decoration: none; } a:hover { text-decoration: underline; } .n { color: #94a3b8; font-size: 13px; }
</style></head><body><main><span class="b">Test copy: sample data, nothing is sent to Zoho</span>
<h1>Ironwood Handoff, test copy</h1><p>Pick a sample deal. The form is the current development version. Generate shows what would be sent to Zoho; nothing is sent.
Each browser keeps its own draft per deal; Reset in the form starts over.</p><ul>${items}</ul></main></body></html>`;
}

function widgetPage(d) {
    let html = fs.readFileSync(INDEX, 'utf8');
    const cfg = {
        dealId: d.id,
        deal: Object.assign({ id: d.id, Stage: 'Closed Won', Owner: { name: 'Sam Sales', email: 'sam@example.test' } }, d.deal),
        users: [
            { id: '1001', name: 'Thomas Reid', email: 'tom@example.test', zuid: '5001' },
            { id: '1002', name: 'Matthew De Man', email: 'matt@example.test', zuid: '5002' },
            { id: '1003', name: 'Joel Brandt', email: 'joel@example.test', zuid: '5003' },
            { id: '1004', name: 'Jeffery Chan', email: 'jeffery@example.test', zuid: '5004' },
            { id: '1005', name: 'Sam Sales', email: 'sam@example.test', zuid: '5005' }
        ]
    };
    const inject = `<style>${BANNER_CSS}</style>
<script>window.__ZSTUB = ${JSON.stringify(cfg)};</script>
<script src="/zoho-stub.js"></script>
<script>${PANEL_JS}</script>`;
    if (html.indexOf(SDK_TAG) === -1) throw new Error('Zoho SDK tag not found in index.html');
    html = html.replace(SDK_TAG, inject);
    const body = `<div id="tcBanner">Test copy: sample data, nothing is sent to Zoho</div>
<div id="tcPanel" role="dialog" aria-modal="true"><div class="box"><header><b>What would be sent to Zoho</b><button type="button" id="tcClose">Close</button></header><div class="body"></div></div></div>`;
    html = html.replace(/<body([^>]*)>/, (m) => m + body);
    return html;
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
    try {
        if (url.pathname === '/' || url.pathname === '/index.html') return send(200, 'text/html; charset=utf-8', pickerPage());
        if (url.pathname === '/zoho-stub.js') return send(200, 'application/javascript; charset=utf-8', fs.readFileSync(STUB, 'utf8'));
        const m = /^\/deal\/(\d+)\/?$/.exec(url.pathname);
        if (m) {
            const d = DEALS.find(x => x.id === m[1]);
            if (!d) return send(404, 'text/plain; charset=utf-8', 'No such sample deal.');
            return send(200, 'text/html; charset=utf-8', widgetPage(d));
        }
        if (url.pathname === '/health') return send(200, 'text/plain; charset=utf-8', 'ok');
        send(404, 'text/plain; charset=utf-8', 'Not found.');
    } catch (e) {
        console.error(new Date().toISOString(), req.url, e.message);
        send(500, 'text/plain; charset=utf-8', 'Test copy error: ' + e.message);
    }
});
server.listen(PORT, HOST, () => console.log(`Handoff test copy on http://${HOST}:${PORT}`));
