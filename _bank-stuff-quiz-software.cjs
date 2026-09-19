const fs = require('fs');
const path = require('path');

const SRC = 'E:\\workbuddyworkspace\\mmsh\\题库清洗\\output\\新清洗_20260919\\';
const SOFT_DIR = 'E:\\workbuddyworkspace\\mmsh\\刷题软件\\';
const OUT_JSON = path.join(SOFT_DIR, '题库_merged.json');
const INDEX = path.join(SOFT_DIR, 'index.html');
const BANK_NAME = '中石化新清洗题库';

const imp = JSON.parse(fs.readFileSync(path.join(SRC, '题库_新清洗_导入版_20260919.json'), 'utf8'));
if (!Array.isArray(imp) || !imp.length) throw new Error('导入版为空');

function text(v) { return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim()); }
function lettersOf(opts) { return Object.keys(opts || {}).filter((k) => k.length === 1).sort(); }

const valid = [];
const problems = [];
imp.forEach((item, idx) => {
  const tag = '新清洗 #' + (idx + 1) + ' ' + text(item.sid);
  const opts = item.options;
  if (!text(item.question)) return problems.push(tag + '：缺题干');
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) return problems.push(tag + '：options 非对象');
  const letters = lettersOf(opts);
  if (letters.length < 2) return problems.push(tag + '：有效选项不足2个');

  let type = item.type;
  if (!['single', 'multiple', 'judge'].includes(type)) {
    type = Array.isArray(item.answer) ? 'multiple' : 'single';
  }
  let answer;
  if (type === 'multiple') {
    const arr = (Array.isArray(item.answer) ? item.answer : String(item.answer || '').split(/[,，\s、;；/|]+/))
      .map((x) => String(x).trim().toUpperCase()).filter((x) => x && letters.includes(x));
    if (arr.length < 2) return problems.push(tag + '：多选答案不足2个有效字母');
    answer = [...new Set(arr)].sort();
  } else {
    const a = String(item.answer || '').trim().toUpperCase();
    if (!a || !letters.includes(a)) return problems.push(tag + '：单选答案不在选项中: ' + (a || '空'));
    answer = a;
  }

  const idNum = Number(item.id);
  valid.push({
    id: Number.isInteger(idNum) && idNum > 0 ? idNum : idx + 1,
    sid: text(item.sid),
    type,
    category: text(item.category),
    section: text(item.section),
    paper: text(item.paper),
    question: text(item.question),
    image: text(item.image),
    options: letters.reduce((o, k) => { o[k] = text(opts[k]); return o; }, {}),
    answer,
    analysis: text(item.analysis)
  });
});

// ensure unique numeric ids
const seen = new Set();
valid.forEach((q, i) => {
  if (!q.id || seen.has(q.id)) {
    let n = 1;
    while (seen.has(n) || valid.some((x, j) => j !== i && x.id === n)) n += 1;
    q.id = n;
  }
  seen.add(q.id);
});

const catCount = {}, secCount = {}, typeCount = {};
valid.forEach((q) => {
  catCount[q.category || '未分类'] = (catCount[q.category || '未分类'] || 0) + 1;
  secCount[q.section || '未分类'] = (secCount[q.section || '未分类'] || 0) + 1;
  typeCount[q.type] = (typeCount[q.type] || 0) + 1;
});

console.log('有效题目:', valid.length, '| 问题:', problems.length);
console.log('题型:', JSON.stringify(typeCount));
console.log('板块:', JSON.stringify(secCount));
console.log('小类:', Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ':' + n).join(' | '));
if (problems.length) {
  console.log('问题明细(前20):');
  problems.slice(0, 20).forEach((p) => console.log('  ' + p));
}

// spot-check key revised items
for (const kw of ['企业作风', '企业愿景', '五大核心价值理念']) {
  const hit = valid.find((q) => q.question.includes(kw) || JSON.stringify(q.options).includes(kw));
  console.log('核对[' + kw + ']:', hit ? (hit.question.slice(0, 40) + ' | ans=' + JSON.stringify(hit.answer) + ' | A=' + hit.options.A) : '未找到');
}

// backup existing merged bank once per day name
if (fs.existsSync(OUT_JSON)) {
  const backup = path.join(SOFT_DIR, '题库_merged.backup-pre-newclean-20260919.json');
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(OUT_JSON, backup);
    console.log('已备份原题库:', backup);
  }
}

fs.writeFileSync(OUT_JSON, JSON.stringify(valid, null, 1), 'utf8');
console.log('已写出:', OUT_JSON, fs.statSync(OUT_JSON).size, 'bytes');

// re-embed into index.html DEMO_BANK
let html = fs.readFileSync(INDEX, 'utf8');
const payload = JSON.stringify(valid).replace(/</g, '\\u003c');
if (!/var DEMO_BANK = \[/.test(html)) throw new Error('index.html 中找不到 DEMO_BANK');
if (payload.slice(1, -1).includes('];')) throw new Error('题库文本含 ]; 序列，中止');
const before = html.length;
html = html.replace(/var DEMO_BANK = \[[\s\S]*?\];/, 'var DEMO_BANK = ' + payload + ';');
html = html.replace(/var LS_KEY = "single_file_quiz_v\d+";/, 'var LS_KEY = "single_file_quiz_v2";');
html = html.replace(/bankName: "[^"]*"/, 'bankName: "' + BANK_NAME + valid.length + '题"');
html = html.replace(/state\.bankName = "[^"]*"/, 'state.bankName = "' + BANK_NAME + valid.length + '题"');
fs.writeFileSync(INDEX, html, 'utf8');
console.log('index.html 已内嵌:', before, '->', html.length);

const m = html.match(/<script>([\s\S]*?)<\/script>/);
try { new Function(m[1]); console.log('内嵌 JS 语法校验: OK'); }
catch (e) { console.error('内嵌语法错误:', e.message); process.exit(1); }
