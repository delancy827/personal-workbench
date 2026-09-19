const PW = 'C:\\Users\\22374\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright';
const CHROME = 'C:\\Users\\22374\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe';
const { chromium } = require(PW);
const BASE = 'http://127.0.0.1:8123';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type() + ': ' + m.text()); });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  const before = await page.evaluate(() => ({
    quizUI: typeof window.QuizUI,
    quizData: typeof window.QuizData,
    quizImport: typeof window.QuizImport,
    quizExam: typeof window.QuizExam,
    quizStats: typeof window.QuizStats,
    viewQuiz: document.getElementById('view-quiz') ? document.getElementById('view-quiz').className : 'missing',
    screenHome: document.getElementById('quizScreenHome') ? document.getElementById('quizScreenHome').className : 'missing'
  }));
  console.log('before: ' + JSON.stringify(before));
  await page.evaluate(() => document.querySelector('[data-view="quiz"]').click());
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({
    viewQuiz: document.getElementById('view-quiz').className,
    screenHome: document.getElementById('quizScreenHome').className,
    screenCategory: document.getElementById('quizScreenCategory').className,
    practiceDisplay: document.getElementById('quizPractice').style.display,
    emptyDisplay: document.getElementById('quizEmptyState').style.display,
    cats: document.getElementById('quizCategoryList').innerHTML.length
  }));
  console.log('after: ' + JSON.stringify(after));
  await browser.close();
})().catch((e) => { console.error('DEBUG ERROR: ' + e.stack); process.exit(2); });
