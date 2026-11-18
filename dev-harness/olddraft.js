const h = require('./harness');
const fs = require('fs');
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  let { browser, page, logs } = await h.open({ nowMs, file: '/tmp/claude-1000/-home-devserver-Projects-RibitOS/d30c0804-b057-4327-bef6-c8d6d388d878/scratchpad/main_index.html' });
  for (const t of ['Renovation', 'Supply & Install', 'No', 'Yes', 'No', 'Continue', 'No', 'Yes', 'Wood', 'Straight', 'Wood Spindles', 'No', 'No']) await h.click(page, t);
  // v15.69: preferredInstall was the project START date
  await page.evaluate(() => { const i = document.getElementById('preferredInstall'); i.value = '2026-11-30'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  // edit Manufacture Railing Package to 7 days; Google Review owner untouched
  await page.evaluate(() => { const li = Array.from(document.querySelectorAll('#projectPreviewList li')).find(l => /Manufacture Railing Package/.test(l.textContent)); const inp = li.querySelector('.task-days-input'); inp.value = '7'; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => window.saveDraftState && window.saveDraftState());
  await new Promise(r => setTimeout(r, 500));
  const draft = await page.evaluate(() => localStorage.getItem('ironwood_draft_9001'));
  fs.writeFileSync('v1569_draft.json', draft);
  const oldNames = await page.evaluate(() => Array.from(document.querySelectorAll('#projectPreviewList li:not(.hidden)')).map(l => (l.querySelector('.editable-task')||{}).textContent + ' ' + l.getAttribute('data-days') + l.getAttribute('data-unit')));
  console.log('OLD', oldNames.join('\n'));
  await browser.close();
  ({ browser, page, logs } = await h.open({ nowMs, draft, settle: 3000 }));
  const p = await h.plan(page);
  console.log(JSON.stringify(p, null, 1));
  const names = await page.evaluate(() => Array.from(document.querySelectorAll('#projectPreviewList li:not(.hidden)')).map(l => (l.querySelector('.editable-task')||{}).textContent + ' ' + l.getAttribute('data-days') + (l.getAttribute('data-unit')||'') + ' sel=' + ((l.querySelector('.task-unit-sel')||{}).selectedOptions||[{}])[0].textContent));
  console.log('NEW', names.join('\n'));
  console.log(await page.evaluate(() => document.getElementById('preferredInstall').value));
  console.log(logs.filter(l => /error|PAGEERROR/i.test(l)).join('\n'));
  await browser.close();
})();
