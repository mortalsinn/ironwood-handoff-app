// Summary card at 1440: construction stair, tight install date (needs the scratchpad walk.js fill helper).
const h = require('./harness');
const W = require(process.env.WALK || '/tmp/claude-1000/-home-devserver-Projects-RibitOS/d30c0804-b057-4327-bef6-c8d6d388d878/scratchpad/walk.js');
(async () => {
  const prefs = { projectType: 'NewBuild', scopeOfWork: 'Supply & Install', siteProtection: 'No', demoDisposal: 'No', jobHasTravel: 'No', jobHasStairs: 'Yes', stairGrade: 'Construction', constStairType: 'Western', constStairShape: 'Straight', jobHasRailing: 'No', jobHasCustomMetal: 'No', jobHasInteriorGlass: 'No' };
  const { browser, page } = await h.open({ nowMs: Date.UTC(2026, 10, 18, 16, 0), width: +(process.env.W || 1440), height: 900 });
  await W.fill(page, prefs, ['Curved']);
  await page.evaluate(() => { const b = document.getElementById('subCountSet'); if (b) b.click(); }); await W.sleep(800);
  await W.fill(page, prefs, ['Curved']);
  await h.setInstall(page, process.argv[2] || '2026-11-20');
  await W.sleep(600);
  const box = await page.evaluate(() => { const c = document.getElementById('jsCard'); c.scrollIntoView(); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.screenshot({ path: 'summary_card_' + (process.env.W || 1440) + '.png', clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.w + 16, height: Math.min(900, box.h + 16) } });
  if (process.env.FULL) await page.screenshot({ path: 'summary_full_' + (process.env.W || 1440) + '.png' });
  console.log(await page.evaluate(() => document.getElementById('jsCard').innerText.replace(/\n+/g, ' / ')));
  await browser.close();
})();
