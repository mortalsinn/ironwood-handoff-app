// v15.79 draft migration: a v15.78 sub-project draft (one install date for the job) opens with that
// date as every sub-project's install date and blank start dates. An install date before the start
// date shows the error beside the box.
const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pick = (page, pairs) => page.evaluate(async (pairs) => {
  for (const [n, v] of pairs) { const i = document.querySelector(`#handoffForm input[name="${n}"][value="${v}"]`); if (i) i.click(); await new Promise(r => setTimeout(r, 600)); }
}, pairs);
const RAIL = [['jobHasStairs', 'No'], ['jobHasRailing', 'Yes'], ['railSystem', 'Wood'], ['railingShape', 'Straight'], ['spindleType', 'Wood'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'No']];
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  let { browser, page, logs } = await h.open({ nowMs });
  await pick(page, [['projectType', 'NewBuild'], ['scopeOfWork', 'Supply & Install'], ['jobHasTravel', 'No']]);
  await page.evaluate(() => { const b = document.getElementById('subCountBox'); b.value = '2'; b.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('subCountSet').click(); });
  await sleep(700); await pick(page, RAIL); await sleep(1500);
  await page.evaluate(() => window.openSubProject(1)); await sleep(4500);
  await pick(page, RAIL); await sleep(1500);
  // Make it look like a v15.78 draft: version 2, one job date, no dates in the snapshots.
  const draft = await page.evaluate(() => {
    const d = window.buildDraftObject();
    d.scheduleVersion = 2; d.form.preferredInstall = '2027-01-15'; delete d.form.prefStart;
    Object.keys(d.subProjects.snaps).forEach(k => { const f = d.subProjects.snaps[k].draft.form; delete f.preferredInstall; delete f.prefStart; });
    return JSON.stringify(d);
  });
  await browser.close();
  ({ browser, page, logs } = await h.open({ nowMs, draft, settle: 3500 }));
  const r = await page.evaluate(() => {
    const plan = window.subProjectPlan();
    return { active: window.activeSubName(), lanes: plan.map(p => p.name + ' start=' + (p.startDate || '-') + ' end=' + (p.endDate || '-')), version: window.buildDraftObject().scheduleVersion,
             legacy: !document.getElementById('prefLegacy').classList.contains('hidden') };
  });
  console.log('MIGRATED', JSON.stringify(r));
  // Install date before the start date.
  await page.evaluate(() => { const s = document.getElementById('prefStart'); s.value = '2027-02-01'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(600);
  console.log('ORDER', await page.evaluate(() => ({ err: !document.getElementById('prefOrderErr').classList.contains('hidden'), errText: document.getElementById('prefOrderErr').textContent, hint: document.getElementById('prefSchedHint').textContent, badge: document.getElementById('jsReady').textContent })));
  const g = await h.generate(page);
  console.log('GENERATE', JSON.stringify({ payload: !!g.payload, checkOpen: g.checkOpen, msg: g.checkMsg, squeezeHidden: g.squeezeHidden }));
  console.log(logs.filter(l => /PAGEERROR|error/i.test(l)).join('\n'));
  await browser.close();
})();
