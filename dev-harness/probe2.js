const h = require('./harness');
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  const { browser, page, logs } = await h.open({ nowMs });
  const steps = JSON.parse(process.argv[2]);
  for (const t of steps) {
    if (t.startsWith('JS:')) { await page.evaluate(t.slice(3)); await new Promise(r => setTimeout(r, 500)); }
    else await h.click(page, t);
  }
  const txt = await page.evaluate(() => { const f = document.getElementById('handoffForm'); return f ? f.innerText : ''; });
  console.log(txt.slice(-1800));
  await page.screenshot({ path: 'probe2.png' });
  console.log(logs.filter(l => /error|PAGEERROR/i.test(l)).join('\n'));
  await browser.close();
})();
