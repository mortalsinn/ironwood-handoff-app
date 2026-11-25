// v15.80 demolition and disposal question: screenshots at 1440 and 390 (light and dark), the Change / Done
// flow, and an older draft with demolition sold. node demo.js <outdir>
const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = process.argv[2] || '/tmp';
const clickAll = (page, pairs) => page.evaluate(async (pairs) => {
  for (const [n, v] of pairs) { const i = document.querySelector(`#handoffForm input[name="${n}"][value="${v}"]`); if (i) i.click(); await new Promise(r => setTimeout(r, 500)); }
}, pairs);
const state = (page) => page.evaluate(() => {
  const q = document.getElementById('qDemoDisposal');
  return { answered: q.classList.contains('q-answered'), editing: q.hasAttribute('data-editing'), sum: (q.querySelector('.q-sum-value') || {}).textContent || '',
           rows: [...q.querySelectorAll('[data-demo-row]')].filter(r => !r.classList.contains('hidden')).map(r => r.getAttribute('data-demo-row')).join(','),
           ticks: [...q.querySelectorAll('input:checked')].map(i => i.name).join(',') };
});
(async () => {
  for (const [w, theme] of [[1440, 'dark'], [390, 'dark'], [1440, 'light'], [390, 'light']]) {
    const { browser, page, logs } = await h.open({ width: w, height: w < 500 ? 844 : 1000 });
    if (theme === 'light') await page.evaluate(() => document.documentElement.classList.add('light'));
    await clickAll(page, [['projectType', 'Renovation'], ['scopeOfWork', 'Supply & Install'], ['siteProtection', 'Yes'], ['demoStairsDemo', 'Yes'], ['demoRailsDemo', 'Yes'], ['demoRailsDisp', 'Yes']]);
    await sleep(600);
    await page.evaluate(() => document.getElementById('qDemoDisposal').scrollIntoView({ block: 'center' }));
    await sleep(400);
    await page.screenshot({ path: `${out}/demo-${w}-${theme}.png` });
    const errs = logs.filter(l => /PAGEERROR/.test(l));
    if (w === 1440 && theme === 'dark') {
      console.log('open:', JSON.stringify(await state(page)));
      await clickAll(page, [['jobHasTravel', 'No']]); await sleep(500);
      console.log('after travel:', JSON.stringify(await state(page)));
      await page.evaluate(() => document.querySelector('#qDemoDisposal .q-sum-change').click()); await sleep(400);
      await clickAll(page, [['demoStubDisp', 'Yes']]); await sleep(400);
      console.log('change + tick:', JSON.stringify(await state(page)));
      await page.evaluate(() => document.querySelector('#qDemoDisposal .q-done').click()); await sleep(400);
      console.log('done:', JSON.stringify(await state(page)));
      await clickAll(page, [['jobHasStairs', 'No']]); await sleep(500);
      console.log('stairs No:', JSON.stringify(await state(page)), 'notes', JSON.stringify(await page.evaluate(() => window.demoNotes().map(n => n.split('\n')[0]))));
      const draft = await page.evaluate(() => JSON.stringify(window.buildDraftObject()));
      await browser.close();
      // Reload the draft: the ticks come back.
      const r = await h.open({ draft });
      console.log('draft reload:', JSON.stringify(await state(r.page)));
      await r.browser.close();
      // An older draft: demoDisposal Yes.
      const old = JSON.parse(draft); ['demoStairsDemo', 'demoRailsDemo', 'demoRailsDisp', 'demoStubDisp'].forEach(k => delete old.form[k]); old.form.demoDisposal = 'Yes';
      const o = await h.open({ draft: JSON.stringify(old) });
      console.log('older draft:', JSON.stringify(await state(o.page)));
      await o.browser.close();
    } else await browser.close();
    if (errs.length) console.log(w, theme, errs.join('; '));
  }
})();
