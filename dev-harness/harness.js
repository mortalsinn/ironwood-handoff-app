// Local harness for the Ironwood Handoff widget. Usage: const h = require('./harness'); const {browser,page} = await h.open({...})
const puppeteer = require('/home/devserver/Projects/WP_Publisher/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const STUB = fs.readFileSync(path.join(__dirname, 'zoho-stub.js'), 'utf8');
exports.open = async (o = {}) => {
  const file = o.file || '/home/devserver/Projects/ironwood-handoff-app/index.html';
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], env: Object.assign({}, process.env, { TZ: o.tz || 'America/Edmonton' }) });
  const page = await browser.newPage();
  await page.setViewport({ width: o.width || 1440, height: o.height || 1000 });
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (u.includes('ZohoEmbededAppSDK')) return r.respond({ status: 200, contentType: 'application/javascript', body: STUB });
    if (u.startsWith('file:') || u.startsWith('data:')) return r.continue();
    return r.respond({ status: 404, body: '' });
  });
  await page.evaluateOnNewDocument((cfg, nowMs, draft) => {
    window.__ZSTUB = cfg;
    if (nowMs) { const off = nowMs - Date.now(); const RD = Date; const N = function (...a) { return a.length ? new RD(...a) : new RD(RD.now() + off); };
      N.now = () => RD.now() + off; N.UTC = RD.UTC; N.parse = RD.parse; N.prototype = RD.prototype; window.Date = N; }
    if (draft) localStorage.setItem('ironwood_draft_' + (cfg.dealId || '9001'), draft);
  }, o.stub || { dealId: '9001' }, o.nowMs || null, o.draft || null);
  await page.goto('file://' + file, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, o.settle || 1500));
  return { browser, page, logs };
};
// Click the visible control whose own text is exactly `text` (buttons, labels, options).
exports.click = async (page, text, idx = 0) => {
  const ok = await page.evaluate((t, idx) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const els = Array.from(document.querySelectorAll('button, label, [role=button], .opt-row, span, div')).filter(e => vis(e) && e.innerText && e.innerText.trim().split('\n')[0].trim() === t);
    // innermost first
    const inner = els.filter(e => !els.some(o => o !== e && e.contains(o)));
    const el = inner[idx];
    if (!el) return false;
    el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, text, idx);
  if (!ok) throw new Error('No visible control: ' + text);
  await new Promise(r => setTimeout(r, 350));
};
exports.leftText = (page) => page.evaluate(() => { const l = document.querySelector('#handoffForm') || document.body; return l.innerText; });
exports.setInstall = async (page, iso) => {
  await page.evaluate((v) => { const i = document.getElementById('preferredInstall'); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }, iso);
  await new Promise(r => setTimeout(r, 600));
};
// The schedule as the widget sees it: one line per task.
exports.plan = (page, opts) => page.evaluate((opts) => {
  const js = window.computeJobSchedule(opts || {});
  const out = { mode: js.mode, status: js.status, subMode: js.subMode, end: js.endLabel, finish: js.finishLabel, lanes: [] };
  js.lanes.forEach(l => out.lanes.push({ name: l.name, rows: l.rows.map(r => [r.name, r.amount + ' ' + r.unit, r.cat || '', r.startLabel || r.startDate, r.endLabel || r.endDate, r.minutes != null ? HandoffScheduler.fmt.duration(r.minutes) : '', r.percent != null ? r.percent + '%' : ''].join(' | ')) }));
  if (js.tail) out.tail = [js.tail.name, js.tail.startLabel || js.tail.startDate, js.tail.endLabel || js.tail.endDate].join(' | ');
  const st = window.scheduleStatusText(js); out.statusText = st;
  return out;
}, opts || {});
exports.summaryText = (page) => page.evaluate(() => { const s = document.getElementById('jobSummary') || document.querySelector('[id*=ummary]'); return [ (document.getElementById('prefSchedHint')||{}).textContent, s ? s.innerText : '' ]; });
exports.generate = async (page) => {
  await page.evaluate(() => { window.__LAST_PAYLOAD = null; document.getElementById('saveBtn').click(); });
  await new Promise(r => setTimeout(r, 2500));
  return page.evaluate(() => ({ payload: window.__LAST_PAYLOAD, checkOpen: !document.getElementById('schedCheckOverlay').classList.contains('hidden'), checkMsg: document.getElementById('schedCheckMsg').textContent, checkList: document.getElementById('schedCheckList').innerText, squeezeNote: document.getElementById('schedCheckSqueezeNote').textContent, plannedNote: document.getElementById('schedCheckPlannedNote').textContent, squeezeHidden: document.querySelector('[data-sc=squeeze]').classList.contains('hidden') }));
};
