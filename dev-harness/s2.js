const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  const { browser, page, logs } = await h.open({ nowMs });
  for (const t of ['New Build', 'Supply & Install', 'No']) await h.click(page, t);
  await page.evaluate(() => { document.getElementById('subCountBox').value = '2'; });
  await h.click(page, 'Continue');
  await page.evaluate(() => { const i = document.querySelectorAll('.sub-name, input[placeholder^="Sub-project"]'); i[0].value = 'Main Stair'; i[0].dispatchEvent(new Event('input', { bubbles: true })); i[0].dispatchEvent(new Event('change', { bubbles: true })); i[1].value = 'Deck Glass'; i[1].dispatchEvent(new Event('input', { bubbles: true })); i[1].dispatchEvent(new Event('change', { bubbles: true })); });
  for (const t of ['Yes', 'Finished Stairs', 'Eastern', 'Straight', 'Closed']) await h.click(page, t);
  await sleep(500);
  let tx = await page.evaluate(() => document.getElementById('handoffForm').innerText);
  console.log('--- after stair\n', tx.slice(-500));
  // railing No, custom metal No, interior glass No
  for (const t of ['No']) await h.click(page, t, 0);
  tx = await page.evaluate(() => document.getElementById('handoffForm').innerText); console.log('---\n', tx.slice(-300));
  await h.click(page, 'No'); await h.click(page, 'No');
  tx = await page.evaluate(() => document.getElementById('handoffForm').innerText); console.log('---\n', tx.slice(-300));
  await h.setInstall(page, '2027-01-15');
  // open sub-project 2 (reloads the page)
  await h.click(page, 'Open');
  await sleep(4000);
  tx = await page.evaluate(() => document.getElementById('handoffForm').innerText); console.log('--- sub2\n', tx.slice(-600));
  for (const t of (process.env.SUB2||"").split(",").filter(Boolean)) await h.click(page, t);
  tx = await page.evaluate(() => document.getElementById("handoffForm").innerText); console.log("--- sub2 answered\n", tx.slice(-900));
  await page.screenshot({ path: "s2a.png" });
  if (process.env.FULL) { console.log(JSON.stringify(await h.plan(page), null, 1)); console.log(JSON.stringify(await h.summaryText(page), null, 1)); const g = await h.generate(page); if (g.payload) { const p = g.payload; console.log(JSON.stringify({ms: p.milestones, order: p.list_create_order, chain: p.chain_per_list, ps: p.project_start, pe: p.project_end, label: p.install_date_label})); p.ordered_tasks.forEach(t => console.log(t.list, "|", t.name, t.start_date, t.start_time, t.end_date, t.end_time, t.person_responsible, t.after_all_lists||"")); } else console.log("CHECK", JSON.stringify(g)); await page.screenshot({ path: "s2b.png" }); }
  console.log(logs.filter(l => /error|PAGEERROR/i.test(l)).join('\n'));
  await browser.close();
})();
