const h = require('./harness');
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0); // Wed Nov 18 2026 10:00 Alberta (UTC-6)
  const { browser, page, logs } = await h.open({ nowMs });
  await page.screenshot({ path: 'boot.png' });
  console.log(logs.join('\n'));
  console.log(await page.evaluate(() => [document.title, typeof window.computeJobSchedule, new Date().toString()]));
  await browser.close();
})();
