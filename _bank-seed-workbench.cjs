/**
 * 将 published-quiz-banks 下三套标准题库合成一份 workbench 导入包，
 * 并校验远程 Gist 抓取链路。
 */
const fs = require('fs');
const path = require('path');
const QuizData = require('./quiz-data.js');
const QuizImport = require('./quiz-import.js');
const QuizRemote = require('./quiz-remote.js');

const PUB = path.join(__dirname, 'published-quiz-banks');
const FILES = [
  '中国石化思想素质新清洗库_20260919.json',
  '思想素质综合正式库.json',
  '中国石化思想素质网络增补库.json'
];

let data = QuizData.ensure({});
for (const file of FILES) {
  const p = path.join(PUB, file);
  if (!fs.existsSync(p)) { console.log('跳过缺失:', file); continue; }
  const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
  const analysis = QuizImport.analyze(doc, data);
  console.log(file, '→', JSON.stringify(analysis.summary));
  if (!analysis.valid) { console.log('  无效:', analysis.errors.slice(0, 5)); continue; }
  const applied = QuizImport.apply(doc, data, { analysis, fileName: file, now: '2026-09-19T12:00:00.000Z' });
  data = applied.data;
}

const banks = data.quiz_banks.filter((b) => !b.is_deleted);
const questions = data.quiz_questions.filter((q) => !q.is_deleted && q.status === 'active');
const byBank = {};
questions.forEach((q) => { byBank[q.bank_id] = (byBank[q.bank_id] || 0) + 1; });
console.log('合并后题库数:', banks.length, '可用题:', questions.length);
banks.forEach((b) => console.log(' -', b.bank_id, b.name, byBank[b.bank_id] || 0));

// write a ready-to-import package for the workbench UI
const outDoc = {
  schema_version: 1,
  exported_at: new Date().toISOString(),
  bank: {
    bank_id: 'sinopec-sixiang-suzhi-20260919',
    name: '中国石化思想素质新清洗库（2026-09-19）',
    version: '2026.09.19',
    description: '新清洗主库 544 题；本地 published-quiz-banks 可直接导入。',
    source: 'E:\\workbuddyworkspace\\mmsh\\题库清洗\\output\\新清洗_20260919',
    language: 'zh-CN'
  },
  questions: JSON.parse(fs.readFileSync(path.join(PUB, FILES[0]), 'utf8')).questions
};
const outPath = path.join(PUB, '工作台导入_新清洗主库_20260919.json');
fs.writeFileSync(outPath, JSON.stringify(outDoc, null, 2), 'utf8');
console.log('已写出工作台导入包:', outPath);

// smoke local practice pool
const sample = QuizData.activeQuestions(data).slice(0, 3);
sample.forEach((q) => {
  const v = QuizData.currentVersion(data, q);
  console.log('样例:', q.question_id, q.category_l1, '|', (v && v.stem || '').slice(0, 40), '| ans', v && v.correct_keys);
});

(async () => {
  try {
    const source = QuizRemote.getSources({})[0];
    const empty = QuizData.ensure({});
    const fetched = await QuizRemote.fetchSource('', source, empty);
    console.log('远程抓取 OK:', fetched.document.bank.name, fetched.document.questions.length, '题', 'gist_at', fetched.gist_updated_at);
    console.log('远程分析:', JSON.stringify(fetched.analysis.summary));
  } catch (error) {
    console.log('远程抓取失败(本地库不受影响):', error.message);
  }
})();
