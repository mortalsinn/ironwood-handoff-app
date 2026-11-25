// Walk the network test copy like a coworker: pick a deal, answer, set a date, Generate, read the panel.
const puppeteer = require('/home/devserver/Projects/WP_Publisher/node_modules/puppeteer');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const base = process.argv[2] || 'http://192.168.1.195:5050';
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  const zohoCalls = []; page.on('request', r => { if (/zoho\.com|zwidgets|zohoapis/.test(r.url())) zohoCalls.push(r.url()); });
  await page.goto(base, { waitUntil: 'load' });
  console.log('PICKER', (await page.evaluate(() => document.body.innerText)).split('\n').slice(0, 4).join(' / '));
  await page.click('a[href="/deal/9101"]');
  await page.waitForSelector('#handoffForm'); await sleep(2500);
  console.log('BANNER', await page.evaluate(() => document.getElementById('tcBanner').textContent), '| title', await page.title());
  await page.evaluate(async () => {
    for (const [n, v] of [['projectType', 'Renovation'], ['scopeOfWork', 'Supply & Install'], ['siteProtection', 'No'], ['demoRailsDemo', 'Yes'], ['demoRailsDisp', 'Yes'], ['jobHasTravel', 'No'], ['jobHasStairs', 'No'], ['jobHasRailing', 'Yes'], ['railSystem', 'Wood'], ['railingShape', 'Straight'], ['spindleType', 'Wood'], ['jobHasCustomMetal', 'No'], ['jobHasInteriorGlass', 'No']]) {
      const i = document.querySelector(`#handoffForm input[name="${n}"][value="${v}"]`); if (i) i.click(); await new Promise(r => setTimeout(r, 600));
    }
    const d = document.getElementById('preferredInstall'); d.value = '2027-01-29'; d.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(1000);
  console.log('HINT', await page.evaluate(() => document.getElementById('prefSchedHint').textContent));
  await page.evaluate(() => document.getElementById('saveBtn').click());
  await sleep(4000);
  const panel = await page.evaluate(() => ({ open: document.getElementById('tcPanel').classList.contains('open'), text: document.querySelector('#tcPanel .body').innerText.slice(0, 700) }));
  console.log('PANEL open', panel.open); console.log(panel.text);
  await page.screenshot({ path: 'testcopy_panel.png' });
  console.log('Zoho network calls:', zohoCalls.length);
  console.log(logs.join('\n'));
  await browser.close();
})();
