const h = require('./harness'); const fs = require('fs');
(async () => {
  const { browser, page } = await h.open({ nowMs: Date.UTC(2026, 10, 18, 16, 0), draft: fs.readFileSync(__dirname + '/v1569_draft.json', 'utf8'), settle: 3000 });
  await page.evaluate(() => document.getElementById('preferredInstallWrap').scrollIntoView());
  await page.screenshot({ path: 'legacy_note.png', clip: { x: 0, y: 0, width: 760, height: 520 } });
  await browser.close();
})();
