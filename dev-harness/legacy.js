// A v15.69 draft (install date = project START) must not be used silently.
const h = require('./harness');
const fs = require('fs');
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  const draft = fs.readFileSync(__dirname + '/v1569_draft.json', 'utf8');
  const { browser, page, logs } = await h.open({ nowMs, draft, settle: 3000 });
  const box = await page.evaluate(() => ({ shown: !document.getElementById('prefLegacy').classList.contains('hidden'), msg: document.getElementById('prefLegacyMsg').textContent, keep: document.getElementById('prefLegacyKeep').textContent }));
  console.log('NOTE', JSON.stringify(box));
  const g = await h.generate(page);
  console.log('GENERATE', JSON.stringify({ payload: !!g.payload, checkOpen: g.checkOpen, msg: g.checkMsg, squeezeNote: g.squeezeNote }));
  console.log('KEEP LABEL', await page.evaluate(() => document.getElementById('schedCheckSqueeze').textContent));
  // Keep it: the normal check follows (the date is tight).
  await page.evaluate(() => document.querySelector('#schedCheckOverlay [data-sc="squeeze"]').click());
  await new Promise(r => setTimeout(r, 1500));
  console.log('AFTER KEEP', await page.evaluate(() => ({ legacy: window.__legacyInstall, checkOpen: !document.getElementById('schedCheckOverlay').classList.contains('hidden'), msg: document.getElementById('schedCheckMsg').textContent, note: !document.getElementById('prefLegacy').classList.contains('hidden') })));
  const ver = await page.evaluate(() => window.buildDraftObject().scheduleVersion);
  console.log('DRAFT scheduleVersion now', ver);
  console.log(logs.filter(l => /PAGEERROR|error/i.test(l)).join('\n'));
  await browser.close();
})();
