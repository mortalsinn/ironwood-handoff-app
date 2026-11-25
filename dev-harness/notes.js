// v15.80 demolition and disposal boxes in Production Notes: tick adds, untick removes, edits kept,
// reload adds no copy, payload sends each block once, the Deal gets typed notes only.
// Screenshot of Production Notes at 1440 light. node notes.js <outdir>
const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = process.argv[2] || '/tmp';
const pick = (page, pairs) => page.evaluate(async (pairs) => {
  for (const [n, v] of pairs) { const i = document.querySelector(`#handoffForm input[name="${n}"][value="${v}"]`); if (i) i.click(); await new Promise(r => setTimeout(r, 500)); }
}, pairs);
const boxes = (page) => page.evaluate(() => [...document.querySelectorAll('#notesContainer textarea')].map(t => (t.getAttribute('data-demo-key') || '-') + ':' + t.value.split('\n')[0]).join(' | '));
const JOB = [['projectType', 'Renovation'], ['scopeOfWork', 'Supply & Install'], ['siteProtection', 'No'], ['demoStairsDemo', 'Yes'], ['demoRailsDisp', 'Yes'], ['demoStubDemo', 'Yes'], ['jobHasTravel', 'No'],
  ['jobHasStairs', 'No'], ['jobHasRailing', 'Yes'], ['railSystem', 'Wood'], ['railingShape', 'Straight'], ['spindleType', 'Wood'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'No']];
(async () => {
  let { browser, page, logs } = await h.open({ width: 1440, height: 1000 });
  await page.evaluate(() => { const t = document.querySelector('#notesContainer textarea'); t.value = 'Customer wants the oak sample'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await pick(page, JOB); await sleep(800);
  console.log('ticked (stairs then answered No):', await boxes(page));
  await pick(page, [['demoStubDemo', 'Yes']]); await sleep(600);
  console.log('stub demolition unticked:', await boxes(page));
  await pick(page, [['demoStubDisp', 'Yes']]); await sleep(600);
  await page.evaluate(() => { const t = document.querySelector('#notesContainer textarea[data-demo-key="demoRailsDisp"]'); t.value += '\n- Dumpster on the driveway'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  console.log('stub disposal ticked, rails edited:', await boxes(page));
  const draft = await page.evaluate(() => JSON.stringify(window.buildDraftObject()));
  await browser.close();
  ({ browser, page, logs } = await h.open({ width: 1440, height: 1000, draft }));
  await sleep(800);
  console.log('after reload:', await boxes(page), '| edit kept:', await page.evaluate(() => /Dumpster/.test(document.querySelector('#notesContainer textarea[data-demo-key="demoRailsDisp"]').value)));
  await page.evaluate(() => document.documentElement.classList.add('light'));
  await page.evaluate(() => { const s = document.getElementById('secNotes'); if (window.setSectionOpen) window.setSectionOpen(s, true); s.classList.remove('hidden', 'sec-collapsed'); s.scrollIntoView({ block: 'start' }); });
  await sleep(600);
  await page.screenshot({ path: out + '/notes-1440-light.png' });
  const g = await h.generate(page); await sleep(2500);
  const p = g.payload || await page.evaluate(() => window.__LAST_PAYLOAD);
  const heads = String(p.notes).split('\n\n---\n\n').map(x => x.split('\n')[0]);
  const crm = await page.evaluate(() => window.__ZLOG.filter(x => x[0] === 'insert').map(x => x[1].APIData.Note_Content.split('\n')[0]));
  console.log('payload notes:', JSON.stringify(heads), '| project_only_notes:', p.project_only_notes.length, '| Deal notes:', JSON.stringify(crm));
  console.log(logs.filter(l => /PAGEERROR/.test(l)).join('; ') || 'no page errors');
  await browser.close();
})();
