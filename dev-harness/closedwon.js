// The install date choice survives the Mark Closed Won step that Generate can open.
const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  const deal = { id: '9001', Deal_Name: 'Test Customer - RAIL - 12 Test St SW', Stage: 'Proposal', Owner: { name: 'Sam Sales', email: 'sam@example.test' }, Account_Name: { name: 'Test Customer' } };
  const { browser, page, logs } = await h.open({ nowMs, stub: { dealId: '9001', deal } });
  for (const t of ['Renovation', 'Supply & Install', 'No', 'Yes', 'No', 'Continue', 'No', 'Yes', 'Wood', 'Straight', 'Wood Spindles', 'No', 'No']) await h.click(page, t);
  await h.setInstall(page, '2026-11-20');
  const g = await h.generate(page);
  console.log('check open', g.checkOpen);
  await page.evaluate(() => document.querySelector('#schedCheckOverlay [data-sc="planned"]').click());
  await sleep(2500);
  console.log('closed won overlay', await page.evaluate(() => !document.getElementById('closedWonOverlay').classList.contains('hidden')), 'override', await page.evaluate(() => window.__scheduleOverride));
  // The deal is Closed Won from now on (the stub's record does not change by itself).
  await page.evaluate(() => { const g0 = ZOHO.CRM.API.getRecord; ZOHO.CRM.API.getRecord = (o) => g0(o).then(r => { r.data[0] = Object.assign({}, r.data[0], { Stage: 'Closed Won' }); return r; }); });
  await page.evaluate(() => { document.getElementById('cwDate').value = '2026-11-18'; document.getElementById('cwAmount').value = '1000'; document.getElementById('submitClosedWon').click(); });
  await sleep(5000);
  const p = await page.evaluate(() => window.__LAST_PAYLOAD);
  console.log('payload after Closed Won:', p ? p.schedule_mode : 'none', '| check reopened', await page.evaluate(() => !document.getElementById('schedCheckOverlay').classList.contains('hidden')), '| override now', await page.evaluate(() => window.__scheduleOverride));
  console.log(logs.filter(l => /PAGEERROR/i.test(l)).join('\n'));
  await browser.close();
})();
