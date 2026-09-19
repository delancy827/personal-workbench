const fs = require('fs');
const QuizData = require('./quiz-data.js');
const QuizImport = require('./quiz-import.js');

const SRC = 'E:\\workbuddyworkspace\\mmsh\\题库清洗\\output\\新清洗_20260919\\';
const OUT = 'published-quiz-banks\\中国石化思想素质新清洗库_20260919.json';
const BANK_ID = 'sinopec-sixiang-suzhi-20260919';
const BANK_NAME = '中国石化思想素质新清洗库（2026-09-19）';
const BANK_VERSION = '2026.09.19';

const imp = JSON.parse(fs.readFileSync(SRC + '题库_新清洗_导入版_20260919.json', 'utf8'));
const formal = JSON.parse(fs.readFileSync(SRC + '题库_新清洗_正式库_20260919.json', 'utf8'));
const metaById = new Map(formal.map((item) => [item.id, item]));

const DIFFICULTIES = ['easy', 'medium', 'hard', 'unknown'];
const IMPORTANCE = ['low', 'normal', 'high', 'critical'];

function text(value) { return typeof value === 'string' ? value.trim() : (value == null ? '' : String(value).trim()); }
function answerKeys(value) {
  return String(value == null ? '' : value).split(/[,\s、;；/|]+/).map((part) => part.trim().toUpperCase()).filter(Boolean);
}
function isoOrNull(value) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00Z' : raw);
  return isNaN(date.getTime()) ? null : date.toISOString();
}
function sourceYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : null;
}

const questions = imp.map((item) => {
  const meta = metaById.get(item.sid) || {};
  const options = Object.keys(item.options || {}).sort().map((key) => ({ key: key, text: text(item.options[key]) }));
  const question = {
    question_id: text(item.sid) || 'sinopec-' + item.id,
    version: '1.0',
    question_type: item.type === 'multiple' ? 'multiple_choice' : 'single_choice',
    stem: text(item.question),
    options: options,
    correct_keys: answerKeys(item.answer),
    explanation: text(meta.explanation) || text(item.analysis) || null,
    category_l1: text(meta.subcategory) || text(item.category) || text(item.section) || '未分类',
    category_l2: text(meta.category) || text(item.section) || null,
    tags: Array.isArray(meta.tags) ? meta.tags.map(text).filter(Boolean) : [],
    difficulty: DIFFICULTIES.includes(meta.difficulty) ? meta.difficulty : 'unknown',
    importance: IMPORTANCE.includes(meta.importance) ? meta.importance : 'normal',
    source: text(meta.source) || text(item.paper) || null,
    source_year: sourceYear(meta.source_year),
    source_question_no: meta.source_question_number == null ? null : text(meta.source_question_number),
    status: 'active'
  };
  const created = isoOrNull(meta.created_at);
  const updated = isoOrNull(meta.updated_at);
  if (created) question.created_at = created;
  if (updated) question.updated_at = updated;
  return question;
});

const document = {
  schema_version: 1,
  exported_at: new Date().toISOString(),
  bank: {
    bank_id: BANK_ID,
    name: BANK_NAME,
    version: BANK_VERSION,
    description: '2026-09-19 清洗批次：思维/思想素质主库，共 ' + questions.length + ' 题，含答案核查、来源与难度字段。',
    source: 'E:\\workbuddyworkspace\\mmsh\\题库清洗\\output\\新清洗_20260919',
    language: 'zh-CN'
  },
  questions: questions
};

const checked = QuizImport.validateDocument(document);
console.log('校验：' + (checked.valid ? '通过' : '失败'));
if (!checked.valid) {
  console.log(checked.errors.slice(0, 10).join('\n'));
  process.exit(1);
}
console.log('题目数：' + document.questions.length);

const empty = QuizData.ensure({});
const analysis = QuizImport.analyze(document, empty);
console.log('空库导入预览：' + JSON.stringify(analysis.summary));
if (analysis.summary.add !== questions.length) {
  console.log('警告：新增数量与题目数不一致');
  analysis.items.filter((item) => item.action !== 'add').slice(0, 5).forEach((item) => console.log(' - ' + item.action + ' :: ' + item.message));
}

const applied = QuizImport.apply(document, empty, { analysis: analysis, fileName: 'quiz_bank.json', now: '2026-09-19T00:00:00.000Z' });
const bank = applied.data.quiz_banks[0];
const activeQuestions = applied.data.quiz_questions.filter((question) => question.status === 'active' && !question.is_deleted);
const categories = {};
activeQuestions.forEach((question) => { categories[question.category_l1] = (categories[question.category_l1] || 0) + 1; });
console.log('入库结果：题库 ' + applied.data.quiz_banks.length + ' 个，题目 ' + activeQuestions.length + ' 条，版本 ' + applied.data.quiz_question_versions.length + ' 条');
console.log('分类分布：' + Object.keys(categories).map((key) => key + ':' + categories[key]).join(' | '));
const l2 = {};
activeQuestions.forEach((question) => { l2[question.category_l2 || '未分层'] = (l2[question.category_l2 || '未分层'] || 0) + 1; });
console.log('二级分布：' + Object.keys(l2).sort((a, b) => l2[b] - l2[a]).map((key) => key + ':' + l2[key]).join(' | '));
const types = {};
activeQuestions.forEach((question) => { types[question.question_type] = (types[question.question_type] || 0) + 1; });
console.log('题型分布：' + JSON.stringify(types));

fs.writeFileSync(OUT, JSON.stringify(document, null, 2), 'utf8');
console.log('已写出：' + OUT + '（' + fs.statSync(OUT).size + ' 字节）');

const oldBankPath = 'published-quiz-banks\\思想素质综合正式库.json';
if (fs.existsSync(oldBankPath)) {
  const oldData = QuizImport.apply(JSON.parse(fs.readFileSync(oldBankPath, 'utf8')), QuizData.ensure({}), { fileName: 'old.json', now: '2026-09-19T00:00:00.000Z' }).data;
  const overlap = QuizImport.analyze(document, oldData);
  console.log('与旧正式库（218 题）合并预览：' + JSON.stringify(overlap.summary));
}
