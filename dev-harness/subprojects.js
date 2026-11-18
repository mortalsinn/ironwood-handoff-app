// Two sub-projects (finished stair + railing), install date Jan 15 2027: shared start,
// own close out each, Job Wrap-Up review last; sub-project cards show planned time.
const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pick = (page, pairs) => page.evaluate(async (pairs) => {
  for (const [n, v] of pairs) { const i = document.querySelector(`#handoffForm input[name="${n}"][value="${v}"]`); if (i) i.click(); await new Promise(r => setTimeout(r, 600)); }
}, pairs);
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  let { browser, page, logs } = await h.open({ nowMs });
  await pick(page, [['projectType', 'NewBuild'], ['scopeOfWork', 'Supply & Install'], ['jobHasTravel', 'No']]);
  await h.setInstall(page, '2027-01-15');
  await page.evaluate(() => { const b = document.getElementById('subCountBox'); b.value = '2'; b.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('subCountSet').click(); });
  await sleep(600);
  await pick(page, [['jobHasStairs', 'Yes'], ['stairGrade', 'Finished'], ['finStairType_1', 'Western'], ['finStairShape_1', 'Straight'], ['finRise_1', 'Closed'], ['finCustomTreads_1', 'Yes'], ['jobHasRailing', 'No'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'No']]);
  await sleep(2000);
  await page.evaluate(() => window.openSubProject(1));
  await sleep(4500);
  await pick(page, [['jobHasStairs', 'No'], ['jobHasRailing', 'Yes'], ['railSystem', 'Wood'], ['railingShape', 'Straight'], ['spindleType', 'Wood'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'No']]);
  await sleep(1500);
  console.log('ACTIVE', await page.evaluate(() => window.activeSubName()));
  console.log('CARDS', await page.evaluate(() => Array.from(document.querySelectorAll('.sub-card .sub-meta')).map(e => e.textContent).join(' | ')));
  console.log('SUMMARY planned', await page.evaluate(() => document.getElementById('jsDays').textContent));
  const g = await h.generate(page);
  let p = g.payload;
  if (!p && g.checkOpen) { await page.evaluate(() => document.querySelector('#schedCheckOverlay [data-sc="squeeze"]').click()); await sleep(2500); p = await page.evaluate(() => window.__LAST_PAYLOAD); }
  if (p) {
    console.log('MILESTONES', p.milestones.map(m => m.name + ' ' + m.start_date + '-' + m.end_date).join(' ; '), '| end', p.project_end);
    p.ordered_tasks.filter(t => /Follow Up|Final Invoice|Google Review|Install Finished Stair|Install Railing\b/.test(t.name)).forEach(t => console.log(' ', t.list, '|', t.name, t.start_date, t.start_time, '->', t.end_date, t.end_time, t.after_all_lists || ''));
  } else console.log('NO PAYLOAD', JSON.stringify(g));
  console.log(logs.filter(l => /PAGEERROR|error/i.test(l)).join('\n'));
  await browser.close();
})();
