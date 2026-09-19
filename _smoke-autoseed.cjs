const PW = 'C:\\Users\\22374\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright';
const CHROME = 'C:\\Users\\22374\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe';
const { chromium } = require(PW);
const BASE = 'http://127.0.0.1:8123';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  // clear any leftover and reload so auto-seed path runs
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.click('#drawerBtn');
  await page.waitForTimeout(250);
  await page.click('[data-view="quiz"]');
  await page.waitForSelector('#view-quiz.active', { timeout: 8000 });
  await page.waitForTimeout(800);
  const q = (await page.textContent('#quizQuestionCount')).trim();
  const b = (await page.textContent('#quizBankCount')).trim();
  console.log('auto-seed question=', q, 'bank=', b);
  const ok = q === '544' && b === '1';
  console.log(ok ? 'AUTO-SEED OK' : 'AUTO-SEED FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
