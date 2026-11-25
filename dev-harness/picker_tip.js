// Deal picker: the full-name tooltip on a cut-off card, at 1440 dark and light. node picker_tip.js <outdir>
const h = require('./harness');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const out = process.argv[2] || '/tmp';
(async () => {
  for (const theme of ['dark', 'light']) {
    const { browser, page, logs } = await h.open({ width: 1440, height: 900 });
    if (theme === 'light') await page.evaluate(() => document.documentElement.classList.add('light'));
    await page.evaluate(() => { window.previewDealPicker(); });
    await sleep(1200);
    // A real long name from Jeff's list, on the first card.
    await page.evaluate(() => {
      const c = document.querySelector('.dp-card');
      c.querySelector('.dp-name').textContent = 'Pomeroy Lodging - RAILING ADDITION - Kananaskis Nordic Spa Phase 3 - Production';
      c.querySelector('.dp-acct').textContent = 'Pomeroy Lodging and Hospitality Group, Kananaskis Nordic Spa Operations';
    });
    const box = await page.evaluate(() => {
      const c = document.querySelector('.dp-card');
      const r = c.getBoundingClientRect(); return { x: r.left + 40, y: r.top + 12, title: c.title, cards: document.querySelectorAll('.dp-card').length };
    });
    await page.mouse.move(box.x, box.y);
    await sleep(150);
    const early = await page.evaluate(() => document.getElementById('dpTip').classList.contains('show'));
    await sleep(350);
    const st = await page.evaluate(() => { const t = document.getElementById('dpTip'); const r = t.getBoundingClientRect(); return { show: t.classList.contains('show'), text: t.innerText, left: r.left, right: r.right, top: r.top, vw: innerWidth }; });
    console.log(theme, 'cards', box.cards, '| title:', JSON.stringify(box.title), '| at 150 ms:', early, '| tip:', JSON.stringify(st));
    await page.screenshot({ path: `${out}/picker-tip-1440-${theme}.png` });
    // A card at the right edge of the grid stays on screen.
    const edge = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.dp-card')]; const c = cards.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
      c.querySelector('.dp-name').textContent = 'A very long deal name at the right edge of the grid - RAILING ADDITION - Kananaskis Nordic Spa Phase 3 - Lower Deck';
      const r = c.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 12 };
    });
    await page.mouse.move(edge.x, edge.y); await sleep(500);
    console.log(theme, 'right edge tip:', JSON.stringify(await page.evaluate(() => { const r = document.getElementById('dpTip').getBoundingClientRect(); return { left: r.left, right: r.right, vw: document.documentElement.clientWidth }; })));
    console.log(logs.filter(l => /PAGEERROR/.test(l)).join('; ') || 'no page errors');
    await browser.close();
  }
})();
