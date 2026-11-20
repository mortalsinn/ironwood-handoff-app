// v15.79: own start and install date per sub-project. Jobs with 1, 3 and 4 sub-projects.
// node windows.js [1|3|4]
const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pick = (page, pairs) => page.evaluate(async (pairs) => {
  for (const [n, v] of pairs) { const i = document.querySelector(`#handoffForm input[name="${n}"][value="${v}"]`); if (i) i.click(); await new Promise(r => setTimeout(r, 600)); }
}, pairs);
const setDate = (page, id, iso) => page.evaluate((id, v) => { const i = document.getElementById(id); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }, id, iso);
const SHARED = [['projectType', 'NewBuild'], ['scopeOfWork', 'Supply & Install'], ['jobHasTravel', 'No']];
const STAIR = [['jobHasStairs', 'Yes'], ['stairGrade', 'Finished'], ['finStairType_1', 'Western'], ['finStairShape_1', 'Straight'], ['finRise_1', 'Closed'], ['finCustomTreads_1', 'Yes'], ['jobHasRailing', 'No'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'No']];
const RAIL = [['jobHasStairs', 'No'], ['jobHasRailing', 'Yes'], ['railSystem', 'Wood'], ['railingShape', 'Straight'], ['spindleType', 'Wood'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'No']];
const GLASS = [['jobHasStairs', 'No'], ['jobHasRailing', 'No'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'Yes']];
const PLANS = {
  1: [{ answers: RAIL, start: '2026-11-30', end: '2026-12-23' }],
  3: [{ answers: STAIR, start: '', end: '2027-01-29' }, { answers: RAIL, start: '2026-12-07', end: '2026-12-18' }, { answers: RAIL, start: '2027-01-04', end: '' }],
  4: [{ answers: STAIR, start: '', end: '2027-02-26' }, { answers: RAIL, start: '2027-01-11', end: '2027-02-12' }, { answers: RAIL, start: '2026-11-30', end: '2026-12-04' }, { answers: STAIR, start: '', end: '' }]
};
(async () => {
  const n = +(process.argv[2] || 3), plan = PLANS[n];
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  const { browser, page, logs } = await h.open({ nowMs, width: +(process.env.W || 1440) });
  await pick(page, SHARED);
  if (n > 1) { await page.evaluate((n) => { const b = document.getElementById('subCountBox'); b.value = String(n); b.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('subCountSet').click(); }, n); await sleep(700); }
  for (let i = 0; i < plan.length; i++) {
    if (i > 0) { await sleep(1500); await page.evaluate((i) => window.openSubProject(i), i); await sleep(4500); }
    await pick(page, plan[i].answers);
    if (plan[i].start) await setDate(page, 'prefStart', plan[i].start);
    if (plan[i].end) await setDate(page, 'preferredInstall', plan[i].end);
    await sleep(800);
  }
  const st = await page.evaluate(() => ({
    hint: document.getElementById('prefSchedHint').textContent, forLbl: document.getElementById('prefDatesFor').textContent,
    card: document.getElementById('jsCard').innerText.replace(/\n+/g, ' / '),
    cards: Array.from(document.querySelectorAll('.sub-card')).map(c => c.innerText.replace(/\n+/g, ' | ')),
    order: !document.getElementById('prefOrderErr').classList.contains('hidden')
  }));
  console.log(JSON.stringify(st, null, 1));
  if (process.env.SHOT) { await page.screenshot({ path: 'windows_' + n + '_' + (process.env.W || 1440) + '.png' }); await page.evaluate(() => document.getElementById('preferredInstallWrap').scrollIntoView()); await page.evaluate(() => document.getElementById('prefDateBtn').click()); await sleep(400); await page.screenshot({ path: 'windows_' + n + '_' + (process.env.W || 1440) + '_dates.png' }); await page.keyboard.press('Escape'); }
  const g = await h.generate(page);
  let p = g.payload;
  if (!p && g.checkOpen) { console.log('CHECK', g.checkMsg, '|', g.checkList.replace(/\n/g, '; ')); await page.evaluate(() => document.querySelector('#schedCheckOverlay [data-sc="squeeze"]:not(.hidden)') ? document.querySelector('#schedCheckOverlay [data-sc="squeeze"]').click() : document.querySelector('#schedCheckOverlay [data-sc="planned"]').click()); await sleep(2500); p = await page.evaluate(() => window.__LAST_PAYLOAD); }
  if (p) {
    console.log('PROJECT', p.project_start, '->', p.project_end, '| install label', p.install_date_label, '| mode', p.schedule_mode);
    (p.milestones || []).slice().reverse().forEach(m => console.log('  MILESTONE', m.name, m.start_date, '->', m.end_date));
    const ts = p.ordered_tasks || [].concat(...Object.keys(p.task_lists).map(k => p.task_lists[k]));
    const odd = ts.filter(t => t.end_time && !/:(00|15|30|45)$/.test(t.end_time)).length;
    console.log('  tasks', ts.length, 'odd end times', odd);
    ts.filter(t => /Follow Up|Final Invoice|Google Review/.test(t.name)).forEach(t => console.log('   ', t.list, '|', t.name.slice(8), t.start_date, t.start_time, '->', t.end_date, t.end_time));
  } else console.log('NO PAYLOAD', JSON.stringify(g).slice(0, 400));
  console.log(logs.filter(l => /PAGEERROR|error/i.test(l)).join('\n'));
  await browser.close();
})();
