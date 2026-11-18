const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  const { browser, page, logs } = await h.open({ nowMs });
  for (const t of ['Renovation', 'Supply & Install', 'No', 'Yes', 'No', 'Continue', 'No', 'Yes', 'Wood', 'Straight', 'Wood Spindles', 'No', 'No']) await h.click(page, t);
  await h.setInstall(page, '2026-12-23');
  const toggle = (name, u) => page.evaluate((name, u) => { const li = Array.from(document.querySelectorAll('#projectPreviewList li')).find(l => l.textContent.includes(name)); const s = li.querySelector('.task-unit-sel'); s.value = u; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return li.getAttribute('data-days') + ' ' + li.getAttribute('data-unit') + ' label=' + s.selectedOptions[0].textContent; }, name, u);
  for (const [n, u] of [['Railing Take Off Sheet', 'days'], ['Railing Take Off Sheet', 'hrs'], ['Railing Install Photos', 'days'], ['Railing Install Photos', 'hrs'], ['Install Railing', 'hrs'], ['Install Railing', 'days']]) { console.log(n, '->', u, ':', await toggle(n, u)); await sleep(400); }
  await sleep(600);
  const p = await h.plan(page); console.log(p.lanes[0].rows.filter(r => /Take Off Sheet|Install Photos|Install Railing/.test(r)).join('\n'));
  await browser.close();
})();
