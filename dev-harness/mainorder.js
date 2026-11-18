const h = require('./harness');
(async () => {
  const nowMs = Date.UTC(2026, 10, 18, 16, 0);
  const { browser, page } = await h.open({ nowMs, file: '/tmp/claude-1000/-home-devserver-Projects-RibitOS/d30c0804-b057-4327-bef6-c8d6d388d878/scratchpad/main_index.html' });
  for (const t of ['Renovation', 'Supply & Install', 'No', 'Yes', 'No', 'Continue', 'No', 'Yes', 'Glass', 'Straight', 'No', 'No']) await h.click(page, t);
  console.log(await page.evaluate(() => Array.from(document.querySelectorAll('#projectPreviewList li:not(.hidden)')).map(l => (l.querySelector('.editable-task')||{}).textContent).join('\n')));
  await browser.close();
})();
