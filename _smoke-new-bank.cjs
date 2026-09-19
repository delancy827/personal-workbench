/**
 * 使用真实新清洗题库跑工作台刷题冒烟。
 * 依赖本地 HTTP：SMOKE_BASE，默认 http://127.0.0.1:8123
 */
const PW = 'C:\\Users\\22374\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright';
const CHROME = 'C:\\Users\\22374\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe';
const fs = require('fs');
const path = require('path');
const { chromium } = require(PW);
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8123';
const BANK = path.join(__dirname, 'published-quiz-banks', '中国石化思想素质新清洗库_20260919.json');

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass += 1; console.log('  [PASS] ' + name); }
  else { fail += 1; console.log('  [FAIL] ' + name + (extra ? ' :: ' + extra : '')); }
}

(async () => {
  const doc = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.evaluate((documentBank) => {
    const scoped = (window.WorkbenchStore ? WorkbenchStore.loadScoped() : null) || QuizData.ensure(JSON.parse(localStorage.getItem('workbench_data') || '{}'));
    const data = QuizData.ensure(scoped);
    const analysis = QuizImport.analyze(documentBank, data);
    const applied = QuizImport.apply(documentBank, data, { analysis, fileName: 'new-clean.json' });
    if (window.WorkbenchStore) WorkbenchStore.saveScoped(applied.data);
    else localStorage.setItem('workbench_data', JSON.stringify(applied.data));
  }, doc);
  await page.reload({ waitUntil: 'load' });
  // 打开抽屉后进入刷题视图
  await page.click('#drawerBtn');
  await page.waitForTimeout(300);
  await page.click('[data-view="quiz"]');
  await page.waitForSelector('#view-quiz.active', { timeout: 8000 });
  await page.waitForSelector('#quizQuestionCount', { timeout: 8000 });
  // 等 QuizUI 渲染题量
  await page.waitForFunction(() => {
    const el = document.getElementById('quizQuestionCount');
    return el && el.textContent.trim() !== '0';
  }, { timeout: 8000 }).catch(() => {});

  const qCount = (await page.textContent('#quizQuestionCount')).trim();
  const bCount = (await page.textContent('#quizBankCount')).trim();
  console.log('\n=== 新清洗库首页 ===');
  check('题目数量显示 544', qCount === '544', qCount);
  check('题库数量显示 1', bCount === '1', bCount);

  // 企业知识板块
  await page.click('[data-quiz-action="category-open"]');
  await page.waitForSelector('#quizScreenCategory.active');
  const cats = await page.$$eval('#quizCategoryList .quiz-category-row b', (els) => els.map((el) => el.textContent.trim()));
  check('分类含中国石化企业知识', cats.includes('中国石化企业知识'), cats.join('/'));
  check('分类含价值观', cats.includes('价值观'), cats.join('/'));

  // 企业知识练习一题
  const rows = await page.$$('#quizCategoryList .quiz-category-row');
  for (const row of rows) {
    const title = await row.$eval('b', (el) => el.textContent.trim());
    if (title === '中国石化企业知识') {
      await row.$eval('button[data-quiz-action="category-start"]', (btn) => btn.click());
      break;
    }
  }
  await page.waitForSelector('#quizPractice', { timeout: 5000 });
  const stem = (await page.textContent('#quizQuestionStem')).trim();
  const meta = (await page.textContent('#quizPracticeMeta')).trim();
  check('企业知识练习可打开', stem.length > 5, stem.slice(0, 40));
  check('板块标题正确', meta.includes('中国石化企业知识'), meta);

  // 随机抽一题提交，确认判题
  const options = await page.$$('#quizOptions .quiz-option');
  check('题目有选项', options.length >= 2, String(options.length));
  if (options[0]) {
    await options[0].click();
    await page.click('#quizSubmitBtn');
    const result = (await page.textContent('#quizResult')).trim();
    check('提交后出现判题结果', /回答(正确|错误)/.test(result), result.slice(0, 40));
  }

  // 关键修订题干应已去掉污染前缀
  const dirty = await page.evaluate(() => {
    const data = QuizData.ensure((window.WorkbenchStore ? WorkbenchStore.loadScoped() : null) || JSON.parse(localStorage.getItem('workbench_data') || '{}'));
    const ids = ['paper_33e4b9badbc5', 'paper_0a4d118b951d', 'hist_8cc16893ab29', 'hist_9e5e0e5fa8c1', 'hist_e30200d9c1ad'];
    return ids.map((id) => {
      const q = data.quiz_questions.find((x) => x.question_id === id);
      const v = q && QuizData.currentVersion(data, q);
      return { id, stem: v && v.stem, keys: v && v.correct_keys };
    });
  });
  console.log('\n=== 关键题核对 ===');
  dirty.forEach((item) => console.log(item.id, '|', (item.stem || '').slice(0, 50), '|', item.keys));
  check('污染题干已修复', dirty[0].stem && dirty[0].stem.startsWith('治理环境'), dirty[0].stem && dirty[0].stem.slice(0, 30));
  const zaofeng = dirty.find((d) => d.id === 'hist_8cc16893ab29');
  check('企业作风题存在', !!zaofeng && !!zaofeng.stem && zaofeng.stem.includes('企业作风'), zaofeng && zaofeng.stem);
  const yuanjing = dirty.find((d) => d.id === 'hist_9e5e0e5fa8c1');
  check('企业愿景题答案为 B', !!yuanjing && Array.isArray(yuanjing.keys) && yuanjing.keys.join('') === 'B', yuanjing && JSON.stringify(yuanjing.keys));
  const hexin = dirty.find((d) => d.id === 'hist_e30200d9c1ad');
  check('核心价值理念题干已重写', !!hexin && !!hexin.stem && hexin.stem.includes('五大核心价值理念'), hexin && hexin.stem && hexin.stem.slice(0, 40));

  console.log('\n页面错误:', errors.length ? errors.slice(0, 5) : '无');
  check('无页面 JS 错误', errors.length === 0, errors[0]);
  await browser.close();
  console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
