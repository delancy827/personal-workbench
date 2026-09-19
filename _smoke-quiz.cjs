const PW = 'C:\\Users\\22374\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright';
const CHROME = 'C:\\Users\\22374\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe';
const { chromium } = require(PW);
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:8123';

let pass = 0;
let fail = 0;
function check(name, ok, extra) {
  if (ok) { pass += 1; console.log('  [PASS] ' + name); }
  else { fail += 1; console.log('  [FAIL] ' + name + (extra ? ' :: ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openQuiz(page) {
  await page.evaluate(() => document.querySelector('[data-view="quiz"]').click());
  await page.waitForSelector('#quizScreenHome.active', { timeout: 5000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push('console: ' + message.text()); });

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.evaluate(() => {
    const options = (keys, texts) => keys.map((key, index) => ({ key: key, text: texts[index] }));
    const doc = {
      schema_version: 1,
      bank: { bank_id: 'demo', name: '演示题库', version: '1.0' },
      questions: [
        { question_id: 'q1', version: '1.0', question_type: 'single_choice', stem: '中国的首都是哪座城市？', options: options(['A', 'B', 'C'], ['北京', '上海', '广州']), correct_keys: ['A'], category_l1: '常识', category_l2: '地理', explanation: '北京是中国的首都。', status: 'active' },
        { question_id: 'q2', version: '1.0', question_type: 'single_choice', stem: '一年有多少个月？', options: options(['A', 'B', 'C'], ['12 个月', '10 个月', '24 个月']), correct_keys: ['A'], category_l1: '常识', category_l2: '生活', status: 'active' },
        { question_id: 'q3', version: '1.0', question_type: 'single_choice', stem: '我国现行宪法是哪一年颁布的？', options: options(['A', 'B', 'C'], ['1982 年', '1978 年', '1954 年']), correct_keys: ['A'], category_l1: '政治', category_l2: '法律', status: 'active' },
        { question_id: 'q4', version: '1.0', question_type: 'multiple_choice', stem: '下列哪些属于社会主义核心价值观？', options: options(['A', 'B', 'C'], ['富强', '加班', '和谐']), correct_keys: ['A', 'C'], category_l1: '政治', category_l2: '价值观', status: 'active' },
        { question_id: 'q5', version: '1.0', question_type: 'single_choice', stem: '水在标准大气压下的沸点是多少摄氏度？', options: options(['A', 'B', 'C'], ['100', '80', '120']), correct_keys: ['A'], category_l1: '常识', category_l2: '科学', status: 'active' },
        { question_id: 'q6', version: '1.0', question_type: 'single_choice', stem: '中国面积最大的省级行政区是？', options: options(['A', 'B', 'C'], ['新疆', '西藏', '内蒙古']), correct_keys: ['A'], category_l1: '常识', category_l2: '地理', status: 'active' }
      ]
    };
    const data = QuizData.ensure(JSON.parse(localStorage.getItem('workbench_data') || '{}'));
    const analysis = QuizImport.analyze(doc, data);
    const applied = QuizImport.apply(doc, data, { analysis: analysis, fileName: 'demo.json' });
    localStorage.setItem('workbench_data', JSON.stringify(applied.data));
  });
  await page.reload({ waitUntil: 'load' });
  await openQuiz(page);

  console.log('\n=== 首页 ===');
  check('题目数量显示 6', (await page.textContent('#quizQuestionCount')).trim() === '6');
  check('题库数量显示 1', (await page.textContent('#quizBankCount')).trim() === '1');

  console.log('\n=== 分板块练习 ===');
  await page.click('[data-quiz-action="category-open"]');
  await page.waitForSelector('#quizScreenCategory.active');
  const categories = await page.$$eval('#quizCategoryList .quiz-category-row b', (els) => els.map((el) => el.textContent.trim()));
  check('分类列表含常识与政治', categories.includes('常识') && categories.includes('政治'), categories.join('/'));
  await page.click('#quizCategoryList .quiz-category-row:first-child button[data-quiz-action="category-start"]');
  check('板块练习面板可见', await page.isVisible('#quizPractice'));
  check('板块标题显示分类', (await page.textContent('#quizPracticeMeta')).includes('常识'));
  await page.click('#quizOptions .quiz-option:first-child');
  await page.click('#quizSubmitBtn');
  const practiceResult = (await page.textContent('#quizResult')).trim();
  check('练习提交显示判题结果', /回答(正确|错误)/.test(practiceResult), practiceResult.slice(0, 40));
  await page.click('[data-quiz-action="stop"]');
  check('结束练习回到首页', await page.isVisible('#quizScreenHome.active'));

  console.log('\n=== 整卷考试（不填试卷信息） ===');
  await page.click('[data-quiz-action="exam-open"]');
  await page.waitForSelector('#quizScreenExamSetup.active');
  await page.selectOption('#quizExamCount', '4');
  await page.fill('#quizExamTitle', '');
  await page.fill('#quizExamSource', '');
  await page.fill('#quizExamYear', '');
  await page.click('[data-quiz-action="exam-start"]');
  await page.waitForSelector('#quizScreenExam.active', { timeout: 5000 });
  const examTitle = (await page.textContent('#quizExamLiveTitle')).trim();
  const examMeta = (await page.textContent('#quizExamLiveMeta')).trim();
  check('缺省试卷名称自动生成', examTitle.indexOf('综合练习') === 0, examTitle);
  check('缺省来源自动生成', examMeta.includes('个人题库'), examMeta);
  check('考试默认 4 题', examMeta.includes('/ 4 题'), examMeta);
  check('考试中不显示正确率/解析', !(await page.isVisible('#quizResult')));

  await page.click('#quizExamOptions .quiz-option:first-child');
  const afterFirst = (await page.textContent('#quizExamProgressText')).trim();
  check('选择题立即记入进度', afterFirst.includes('已答 1'), afterFirst);
  await page.click('[data-quiz-action="exam-mark"]');
  const afterMark = (await page.textContent('#quizExamProgressText')).trim();
  check('标记题立即记入进度', afterMark.includes('标记 1'), afterMark);
  check('题号导航格显示当前题', (await page.getAttribute('#quizExamQuestionGrid button.current', 'data-index')) === '0');

  await page.click('[data-quiz-action="exam-next"]');
  check('下一题生效', (await page.textContent('#quizExamLiveMeta')).includes('2 / 4'));
  await page.click('#quizExamOptions .quiz-option:last-child');
  await page.click('[data-quiz-action="exam-next"]');
  await page.click('[data-quiz-action="exam-next"]');
  check('末题不越界', (await page.textContent('#quizExamLiveMeta')).includes('4 / 4'));
  await page.click('#quizExamQuestionGrid button[data-index="1"]');
  check('题号导航跳转生效', (await page.textContent('#quizExamLiveMeta')).includes('2 / 4'));
  const markedChecked = await page.$$eval('#quizExamOptions input', (inputs) => inputs.filter((i) => i.checked).length);
  check('第 2 题选择被保留', markedChecked === 1, String(markedChecked));

  await page.click('[data-quiz-action="exam-submit"]');
  await page.waitForSelector('#confirmSheet.show', { timeout: 5000 });
  const confirmText = (await page.textContent('#confirmMsg')).trim();
  check('交卷前提示未答数量', confirmText.includes('未作答'), confirmText);
  await page.click('#confirmOk');
  await page.waitForSelector('#quizScreenExamResult.active', { timeout: 5000 });
  const score = (await page.textContent('#quizExamScore')).trim();
  const correct = (await page.textContent('#quizExamCorrect')).trim();
  const wrong = (await page.textContent('#quizExamWrong')).trim();
  const unanswered = (await page.textContent('#quizExamUnanswered')).trim();
  check('结果页显示得分', score === '25', score);
  check('结果页统计答对 1', correct === '1', correct);
  check('结果页统计答错 1', wrong === '1', wrong);
  check('结果页统计未答 2', unanswered === '2', unanswered);
  const categoryText = (await page.textContent('#quizExamCategoryResult')).replace(/\s+/g, ' ').trim();
  check('结果页有板块统计', categoryText.length > 0, categoryText.slice(0, 60));

  console.log('\n=== 交卷写入错题与统计 ===');
  const stored = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('workbench_data'));
    return {
      attempts: data.quiz_attempts.length,
      examAttempts: data.quiz_attempts.filter((a) => a.mode === 'exam').length,
      wrongActive: data.quiz_question_states.filter((s) => s.wrong_active).length,
      results: data.quiz_exam_results.length
    };
  });
  check('考试生成 4 条 attempt', stored.examAttempts === 4, JSON.stringify(stored));
  check('错题状态写入 3 题', stored.wrongActive === 3, JSON.stringify(stored));
  check('生成 1 条考试结果', stored.results === 1, JSON.stringify(stored));

  console.log('\n=== 练本次错题 ===');
  await page.click('[data-quiz-action="exam-wrong-practice"]');
  check('错题练习直接进入练习面板', await page.isVisible('#quizPractice'));
  const practiceTitle = (await page.textContent('#quizPracticeTitle')).trim();
  check('错题练习题量与结果一致', practiceTitle.includes('1 / 1'), practiceTitle);
  await page.click('[data-quiz-action="stop"]');

  console.log('\n=== 未交卷恢复 ===');
  await page.click('[data-quiz-action="exam-open"]');
  await page.selectOption('#quizExamCount', '2');
  await page.selectOption('#quizExamDuration', '0');
  await page.click('[data-quiz-action="exam-start"]');
  await page.waitForSelector('#quizScreenExam.active');
  await page.click('#quizExamOptions .quiz-option:first-child');
  await page.click('[data-quiz-action="exam-next"]');
  check('进入第 2 题', (await page.textContent('#quizExamLiveMeta')).includes('2 / 2'));
  await page.reload({ waitUntil: 'load' });
  await openQuiz(page);
  check('首页显示未完成考试入口', await page.isVisible('#quizResumeExam'));
  await page.click('[data-quiz-action="exam-resume"]');
  await page.waitForSelector('#quizScreenExam.active');
  check('恢复到第 2 题', (await page.textContent('#quizExamLiveMeta')).includes('2 / 2'));
  await page.click('#quizExamQuestionGrid button[data-index="0"]');
  const restoredChecked = await page.$$eval('#quizExamOptions input', (inputs) => inputs.filter((i) => i.checked).length);
  check('恢复第 1 题已选答案', restoredChecked === 1, String(restoredChecked));
  check('恢复后计时器在工作', (await page.textContent('#quizExamTime')).trim() !== '');

  console.log('\n=== 退出保留 ===');
  await page.click('[data-quiz-action="exam-exit"]');
  await page.waitForSelector('#confirmSheet.show');
  await page.click('#confirmOk');
  check('退出回到首页', await page.isVisible('#quizScreenHome.active'));
  check('首页保留继续入口', await page.isVisible('#quizResumeExam'));

  console.log('\n=== 控制台错误 ===');
  check('无页面脚本错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
})().catch((error) => { console.error('SMOKE ERROR: ' + error.stack); process.exit(2); });
