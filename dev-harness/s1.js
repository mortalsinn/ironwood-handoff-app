const h = require('./harness');
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  const { browser, page, logs } = await h.open({ nowMs });
  for (const t of ['Renovation', 'Supply & Install', 'No', 'Yes', 'No', 'Continue', 'No', 'Yes', 'Wood', 'Straight', 'Wood Spindles', 'No', 'No']) await h.click(page, t);
  await h.setInstall(page, process.argv[2] || '2026-12-23');
  console.log(JSON.stringify(await h.plan(page), null, 1));
  console.log(JSON.stringify(await h.summaryText(page), null, 1));
  await page.screenshot({ path: 's1.png', fullPage: false });
  const g = await h.generate(page);
  if (g.payload) { const p = g.payload; console.log('PAYLOAD keys', Object.keys(p)); console.log(JSON.stringify({ needed_by: p.needed_by, install_date: p.install_date, label: p.install_date_label, mode: p.schedule_mode, ps: p.project_start, pe: p.project_end }));
    Object.keys(p.task_lists).forEach(k => p.task_lists[k].forEach(t => console.log(k, '|', t.name, t.start_date, t.start_time, t.end_date, t.end_time, t.duration, t.duration_type, t.person_responsible, t.days))); }
  else console.log('CHECK', JSON.stringify(g));
  console.log(logs.filter(l => /error|PAGEERROR|warn/i.test(l)).join('\n'));
  await browser.close();
})();
