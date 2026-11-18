const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  const { browser, page, logs } = await h.open({ nowMs });
  for (const t of ['Renovation', 'Supply & Install', 'No', 'Yes', 'No', 'Continue', 'No', 'Yes', 'Glass', 'Straight', 'No', 'No']) await h.click(page, t);
  for (const d of (process.argv[2] || '2026-12-25').split(',')) {
    await h.setInstall(page, d);
    const p = await h.plan(page);
    console.log('=====', d, p.status, p.mode, '| end', p.end, '| finish', p.finish);
    console.log(p.lanes[0].rows.join('\n'));
    console.log(JSON.stringify(p.statusText));
    console.log('HINT', (await h.summaryText(page))[0]);
    const g = await h.generate(page);
    if (g.payload) console.log('GENERATED directly', g.payload.schedule_mode, g.payload.install_date_label);
    else {
      console.log('CHECK', JSON.stringify(g));
      await page.screenshot({ path: 's3_check_' + d + '.png' });
      for (const act of (process.env.ACTS||'squeeze').split(',')) {
        if (g.squeezeHidden && act === 'squeeze') continue;
        if (false) { await page.evaluate(() => document.getElementById('saveBtn').click()); await sleep(800); }
        await page.evaluate((a) => { window.__LAST_PAYLOAD = null; document.querySelector('[data-sc=' + a + ']').click(); }, act);
        await sleep(2500);
        const pl = await page.evaluate(() => window.__LAST_PAYLOAD);
        if (!pl) { console.log(act, 'NO PAYLOAD'); continue; }
        const all = Object.values(pl.task_lists).flat();
        console.log(act, '=>', pl.schedule_mode, 'install_date=', pl.install_date, 'first', all[0].start_date, all[0].start_time, 'last', all[all.length-1].end_date, all[all.length-1].end_time, 'dur', all[0].duration, all[0].duration_type);
        console.log('   ', all.map(t => t.name.replace(/^\[[^\]]*\] /,'') + ' ' + t.start_date + (t.start_time?(' '+t.start_time):'') + '>' + t.end_date + (t.end_time?(' '+t.end_time):'') + (t.duration?(' ['+t.duration+t.duration_type+']'):'')).join('\n    '));
      }
    }
  }
  console.log(logs.filter(l => /error|PAGEERROR/i.test(l)).join('\n'));
  await browser.close();
})();
