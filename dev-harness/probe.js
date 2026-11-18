const h = require('./harness');
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  const { browser, page, logs } = await h.open({ nowMs });
  for (const t of process.argv.slice(2)) await h.click(page, t);
  const txt = await page.evaluate(() => { const f = document.getElementById('handoffForm'); return f ? f.innerText : ''; });
  console.log(txt.slice(-1500));
  await page.screenshot({ path: 'probe.png' });
  console.log(logs.filter(l => /error|PAGEERROR/i.test(l)).join('\n'));
  await browser.close();
})();
