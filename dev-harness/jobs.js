// Walks real jobs through the form and checks every due time: on the quarter hour, inside working
// hours, never on a weekend or stat holiday, and the payload sent to Zoho equals the screen.
// node jobs.js [job] [installDate]   jobs: reno metal constr supply nodate tight sub1 sub3 sub4 (all when blank)
const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pick = (page, pairs) => page.evaluate(async (pairs) => {
  for (const [n, v] of pairs) { const i = document.querySelector(`#handoffForm input[name="${n}"][value="${v}"]`); if (i) i.click(); await new Promise(r => setTimeout(r, 600)); }
}, pairs);
const setDate = (page, id, iso) => page.evaluate((id, v) => { const i = document.getElementById(id); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }, id, iso);
const NB = [['projectType', 'NewBuild'], ['scopeOfWork', 'Supply & Install'], ['jobHasTravel', 'No']];
const RENO = [['projectType', 'Renovation'], ['scopeOfWork', 'Supply & Install'], ['siteProtection', 'No'], ['demoRailsDemo', 'Yes'], ['demoRailsDisp', 'Yes'], ['demoStubDemo', 'Yes'], ['jobHasTravel', 'No']];
const RAIL = [['jobHasStairs', 'No'], ['jobHasRailing', 'Yes'], ['railSystem', 'Wood'], ['railingShape', 'Straight'], ['spindleType', 'Wood'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'No']];
const METAL = [['jobHasStairs', 'No'], ['jobHasRailing', 'Yes'], ['railSystem', 'Metal'], ['railingType', 'FullMetal'], ['railingShape', 'Straight'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'No']];
const CONSTR = [['jobHasStairs', 'Yes'], ['stairGrade', 'Construction'], ['constStairType_1', 'Western'], ['constStairShape_1', 'Straight'], ['jobHasRailing', 'No'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'No']];
const STAIR = [['jobHasStairs', 'Yes'], ['stairGrade', 'Finished'], ['finStairType_1', 'Western'], ['finStairShape_1', 'Straight'], ['finRise_1', 'Closed'], ['finCustomTreads_1', 'Yes'], ['jobHasRailing', 'No'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'No']];
const JOBS = {
  reno: { shared: RENO, subs: [{ a: RAIL, end: '2026-12-23' }] },
  metal: { shared: NB, subs: [{ a: METAL, end: '2027-01-22' }] },
  constr: { shared: NB, subs: [{ a: CONSTR, end: '2026-12-11' }] },
  supply: { shared: [['projectType', 'NewBuild'], ['scopeOfWork', 'Supply Only'], ['jobHasTravel', 'No']], subs: [{ a: RAIL, end: '2026-12-18' }] },
  nodate: { shared: RENO, subs: [{ a: RAIL }] },
  tight: { shared: RENO, subs: [{ a: RAIL, end: '2026-11-27' }] },
  sub1: { shared: NB, n: 1, subs: [{ a: RAIL, start: '2026-11-30', end: '2026-12-23' }] },
  sub3: { shared: NB, n: 3, subs: [{ a: STAIR, end: '2027-01-29' }, { a: RAIL, start: '2026-12-07', end: '2026-12-31' }, { a: RAIL, start: '2027-01-04' }] },
  sub4: { shared: NB, n: 4, subs: [{ a: STAIR, end: '2027-02-26' }, { a: RAIL, start: '2027-01-11', end: '2027-02-12' }, { a: RAIL, start: '2026-11-30', end: '2026-12-04' }, { a: STAIR }] }
};
const run = async (name, dateOverride) => {
  const job = JOBS[name];
  const { browser, page, logs } = await h.open({ nowMs: Date.UTC(2026, 10, 18, 16, 0) });
  await pick(page, job.shared);
  if (job.n > 1) { await page.evaluate((n) => { const b = document.getElementById('subCountBox'); b.value = String(n); b.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('subCountSet').click(); }, job.n); await sleep(700); }
  for (let i = 0; i < job.subs.length; i++) {
    const sp = job.subs[i];
    if (i > 0) { await sleep(1500); await page.evaluate((i) => window.openSubProject(i), i); await sleep(4500); }
    await pick(page, sp.a);
    if (sp.start) await setDate(page, 'prefStart', sp.start);
    const end = i === 0 && dateOverride ? dateOverride : sp.end;
    if (end) await setDate(page, 'preferredInstall', end);
    await sleep(700);
  }
  const screen = await page.evaluate(() => {
    const js = window.computeJobSchedule(), S = HandoffScheduler, probs = [];
    const all = []; js.lanes.forEach(l => l.rows.forEach(r => all.push(r))); if (js.tail) all.push(js.tail);
    all.forEach(r => {
      [[r.startDate, r.startTime], [r.endDate, r.endTime]].forEach(([d, t]) => {
        const iso = d.slice(6) + '-' + d.slice(0, 2) + '-' + d.slice(3, 5);
        if (!S.isWorkDayIso(iso)) probs.push(r.name + ' on a day off ' + iso);
        if (!/:(00|15|30|45)$/.test(t)) probs.push(r.name + ' odd time ' + t);
        const [hh, mm] = t.split(':').map(Number), m = hh * 60 + mm, wd = new Date(iso + 'T12:00:00Z').getUTCDay();
        const wh = S.config.workingHours[wd]; const o = wh && +wh[0].split(':')[0] * 60, c = wh && +wh[1].split(':')[0] * 60;
        if (wh && (m < o || m > c)) probs.push(r.name + ' outside hours ' + t);
      });
    });
    return { status: js.worst, lanes: js.lanes.map(l => l.name + ': ' + l.view.status + ' ' + (l.view.start ? S.fmt.day(S.wallNow(+l.view.start + 6 * 3600000)) : '')),
             rows: all.map(r => r.name + '|' + r.startDate + ' ' + r.startTime + '|' + r.endDate + ' ' + r.endTime), probs: probs,
             legacy: !document.getElementById('prefLegacy').classList.contains('hidden'), hint: document.getElementById('prefSchedHint').textContent, card: (document.getElementById('jsSchedLine') || {}).textContent };
  });
  const g = await h.generate(page);
  let p = g.payload, note = '';
  let want = screen.rows;
  if (!p && g.checkOpen) {
    note = 'check: ' + g.checkMsg;
    // Choose "Create with planned times" (PLANNED=1) or "Create with this schedule" when offered.
    const mode = await page.evaluate((pl) => { const q = document.querySelector('#schedCheckOverlay [data-sc="squeeze"]'); const useQ = !pl && q && !q.classList.contains('hidden'); (useQ ? q : document.querySelector('#schedCheckOverlay [data-sc="planned"]')).click(); return useQ ? null : 'planned'; }, !!process.env.PLANNED);
    want = await page.evaluate((mode) => { const js = window.computeJobSchedule({ mode }); const all = []; js.lanes.forEach(l => l.rows.forEach(r => all.push(r))); if (js.tail) all.push(js.tail); return all.map(r => r.name + '|' + r.startDate + ' ' + r.startTime + '|' + r.endDate + ' ' + r.endTime); }, mode);
    await sleep(2500); p = await page.evaluate(() => window.__LAST_PAYLOAD);
  }
  let mism = 'no payload';
  if (p) {
    const ts = p.ordered_tasks || [].concat(...Object.keys(p.task_lists).map(k => p.task_lists[k]));
    const sent = ts.map(t => t.name + '|' + t.start_date + ' ' + t.start_time + '|' + t.end_date + ' ' + t.end_time);
    mism = sent.filter(x => want.indexOf(x) === -1).length + want.filter(x => sent.indexOf(x) === -1).length + (note ? ' (' + note + ')' : '');
  }
  if (p) {
    // Demolition and disposal: notes only, never a task.
    const ts2 = p.ordered_tasks || [].concat(...Object.keys(p.task_lists).map(k => p.task_lists[k]));
    const demoTasks = ts2.filter(t => /Removal|Disposal|Remove Existing/.test(t.name)).length;
    const heads = String(p.notes || '').split('\n\n---\n\n').map(x => x.split('\n')[0]).filter(x => /^(Demolition|Disposal) - /.test(x));
    const dup = heads.filter((x, i) => heads.indexOf(x) !== i).length;
    await sleep(1500);
    const crm = (await page.evaluate(() => (window.__ZLOG || []).filter(x => x[0] === 'insert').map(x => x[1].APIData.Note_Content))) || [];
    const onDeal = crm.filter(c => /^(Demolition|Disposal) - /.test(c)).length;
    console.log('   demolition notes: ' + (heads.join(', ') || 'none') + ' | duplicates ' + dup + ' | project_only_notes ' + (p.project_only_notes || []).length + ' | on the Deal ' + onDeal + ' | demolition tasks: ' + demoTasks);
  }
  console.log('== ' + name + ' | ' + screen.status + ' | problems ' + screen.probs.length + ' | payload vs screen mismatches ' + mism);
  console.log('   lanes: ' + screen.lanes.join('; ') + (screen.legacy ? ' | OLDER DRAFT NOTE SHOWN' : ''));
  console.log('   hint: ' + screen.hint + (screen.card ? ' | card: ' + screen.card : ''));
  if (screen.probs.length) console.log('   ' + screen.probs.slice(0, 5).join('; '));
  const errs = logs.filter(l => /PAGEERROR/i.test(l)); if (errs.length) console.log('   ' + errs.join('; '));
  await browser.close();
};
(async () => { const names = process.argv[2] ? [process.argv[2]] : Object.keys(JOBS); for (const n of names) await run(n, process.argv[3]); })();
