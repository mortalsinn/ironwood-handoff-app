// New build answered to the end, then switched to Renovation: the new questions must open in order,
// the answered ones stay folded in one bar, and the sub-project count never shows beside its own row.
// node reno_switch.js <outdir> [file]
const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = process.argv[2] || '/tmp';
const file = process.argv[3];
const pick = (page, pairs) => page.evaluate(async (pairs) => {
  for (const [n, v] of pairs) { const i = n === '@' ? document.querySelector(v) : document.querySelector(`#handoffForm input[name="${n}"][value="${v}"]`); if (i) i.click(); await new Promise(r => setTimeout(r, 500)); }
}, pairs);
const state = (page) => page.evaluate(() => {
  const vis = (e) => !!e && !e.classList.contains('hidden') && e.getClientRects().length > 0;
  const form = document.getElementById('handoffForm');
  const tops = [...form.children].filter(e => e.classList.contains('q') && !e.classList.contains('hidden'));
  const bar = document.getElementById('answeredBar');
  return {
    bar: vis(bar) ? bar.querySelector('.ab-count').textContent : 'none',
    open: tops.filter(q => !q.classList.contains('q-answered')).map(q => q.id),
    rows: tops.filter(q => q.classList.contains('q-answered') && !q.classList.contains('q-stowed')).map(q => q.id),
    subCountBox: vis(document.getElementById('subCountBox')) && document.getElementById('subCountBox').getClientRects().length > 0,
    site: (document.querySelector('input[name="siteProtection"]:checked') || {}).value || ''
  };
});
(async () => {
  const { browser, page, logs } = await h.open({ width: 1440, height: 1000, file });
  await page.evaluate(() => document.documentElement.classList.add('light'));
  await pick(page, [['projectType', 'NewBuild'], ['scopeOfWork', 'Supply & Install'], ['jobHasTravel', 'No']]);
  await sleep(500);
  // Sub-project count: 1, Continue.
  await page.evaluate(() => { const b = document.getElementById('subCountBox'); if (b) { b.value = '1'; b.dispatchEvent(new Event('input', { bubbles: true })); const s = document.getElementById('subCountSet'); if (s) s.click(); } });
  await sleep(700);
  await pick(page, [['jobHasStairs', 'No'], ['jobHasRailing', 'Yes']]);
  await sleep(800);
  console.log('new build:', JSON.stringify(await state(page)));
  // Show, then Change on the project type, the way Jeff did it.
  await page.evaluate(() => document.getElementById('answeredBar').click()); await sleep(400);
  console.log('expanded:', JSON.stringify(await state(page)));
  await page.evaluate(() => document.querySelector('#qProjectContext .q-sum-change').click()); await sleep(400);
  await pick(page, [['projectType', 'Renovation']]);
  await sleep(1000);
  const s1 = await state(page);
  console.log('switched to renovation:', JSON.stringify(s1));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: out + '/reno-switch-' + (file ? 'live' : 'dev') + '.png' });
  if (!file) {
    await pick(page, [['siteProtection', 'Yes']]); await sleep(700);
    console.log('site protection Yes:', JSON.stringify(await state(page)));
    console.log('demolition button:', await page.evaluate(() => document.getElementById('demoContinue').textContent));
    await page.screenshot({ path: out + '/reno-switch-demo-open.png' });
    await page.evaluate(() => document.getElementById('demoContinue').click()); await sleep(800);
    const s3 = await state(page);
    console.log('demolition confirmed:', JSON.stringify(s3));
    await page.screenshot({ path: out + '/reno-switch-after.png' });
  }
  console.log(logs.filter(l => /PAGEERROR/.test(l)).join('; ') || 'no page errors');
  await browser.close();
})();
