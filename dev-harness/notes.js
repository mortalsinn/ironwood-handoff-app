// v15.80 demolition and disposal boxes in Production Notes: tick adds, untick removes, edits kept,
// reload adds no copy, payload sends each block once, the Deal gets typed notes only.
// Screenshot of Production Notes at 1440 light. node notes.js <outdir>
const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = process.argv[2] || '/tmp';
const pick = (page, pairs) => page.evaluate(async (pairs) => {
  for (const [n, v] of pairs) { const i = n === '@' ? document.querySelector(v) : document.querySelector(`#handoffForm input[name="${n}"][value="${v}"]`); if (i) i.click(); await new Promise(r => setTimeout(r, 500)); }
}, pairs);
const boxes = (page) => page.evaluate(() => [...document.querySelectorAll('#notesContainer textarea')].map(t => (t.getAttribute('data-demo-key') || '-') + ':' + t.value.split('\n')[0]).join(' | '));
const JOB = [['projectType', 'Renovation'], ['scopeOfWork', 'Supply & Install'], ['siteProtection', 'No'], ['demoStairsDemo', 'Yes'], ['demoRailsDemo', 'Yes'], ['demoStubDisp', 'Yes'], ['@', '#demoContinue'], ['jobHasTravel', 'No'],
  ['jobHasStairs', 'No'], ['jobHasRailing', 'Yes'], ['railSystem', 'Wood'], ['railingShape', 'Straight'], ['spindleType', 'Wood'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'No']];
(async () => {
  let { browser, page, logs } = await h.open({ width: 1440, height: 1000 });
  await page.evaluate(() => { const t = document.querySelector('#notesContainer textarea'); t.value = 'Customer wants the oak sample'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await pick(page, JOB); await sleep(800);
  // Jeff's case: three ticks on a job with no stairs gives three notes.
  console.log('3 ticks, stairs answered No:', await boxes(page));
  await page.evaluate(() => document.documentElement.classList.add('light'));
  await page.evaluate(() => { document.querySelector('#qDemoDisposal .q-sum-change').click(); });
  await sleep(500);
  await page.evaluate(() => document.getElementById('qDemoDisposal').scrollIntoView({ block: 'center' }));
  await sleep(300);
  await page.screenshot({ path: out + '/demo-3-ticks-1440-light.png' });
  await pick(page, [['@', '#demoContinue']]); await sleep(500);
  // The folded notes header: title and count apart.
  console.log('notes header:', await page.evaluate(() => { const l = document.querySelector('#secNotes label'); return JSON.stringify([l.childNodes.length, l.textContent, (l.querySelector('.sec-badge') || {}).textContent]); }));
  await pick(page, [['demoRailsDemo', 'Yes']]); await sleep(600);
  console.log('rails demolition unticked:', await boxes(page));
  await pick(page, [['demoRailsDisp', 'Yes']]); await sleep(600);
  await page.evaluate(() => { const t = document.querySelector('#notesContainer textarea[data-demo-key="demoRailsDisp"]'); t.value += '\n- Dumpster on the driveway'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  console.log('rails disposal ticked and edited:', await boxes(page));
  const draft = await page.evaluate(() => JSON.stringify(window.buildDraftObject()));
  await browser.close();
  ({ browser, page, logs } = await h.open({ width: 1440, height: 1000, draft }));
  await sleep(800);
  console.log('after reload:', await boxes(page), '| edit kept:', await page.evaluate(() => /Dumpster/.test(document.querySelector('#notesContainer textarea[data-demo-key="demoRailsDisp"]').value)));
  await page.evaluate(() => document.documentElement.classList.add('light'));
  await page.evaluate(() => { const s = document.getElementById('secNotes'); if (window.setSectionOpen) window.setSectionOpen(s, true); s.classList.remove('hidden', 'sec-collapsed'); s.scrollIntoView({ block: 'start' }); });
  await sleep(600);
  await page.screenshot({ path: out + '/notes-1440-light.png' });
  await pick(page, [['demoRailsDisp', 'Yes'], ['demoRailsDemo', 'Yes']]); await sleep(700);
  await page.evaluate(() => { const s = document.getElementById('secNotes'); s.scrollIntoView({ block: 'start' }); });
  await sleep(400);
  console.log('Jeff\'s 3 ticks again:', await boxes(page));
  await page.screenshot({ path: out + '/notes-3-boxes-1440-light.png' });
  const g = await h.generate(page); await sleep(2500);
  const p = g.payload || await page.evaluate(() => window.__LAST_PAYLOAD);
  const heads = String(p.notes).split('\n\n---\n\n').map(x => x.split('\n')[0]);
  const crm = await page.evaluate(() => window.__ZLOG.filter(x => x[0] === 'insert').map(x => x[1].APIData.Note_Content.split('\n')[0]));
  console.log('payload notes:', JSON.stringify(heads), '| project_only_notes:', p.project_only_notes.length, '| Deal notes:', JSON.stringify(crm));
  console.log(logs.filter(l => /PAGEERROR/.test(l)).join('; ') || 'no page errors');
  await browser.close();
})();
