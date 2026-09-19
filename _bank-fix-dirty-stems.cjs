const fs = require('fs');
const path = require('path');

const STEM_FIX = {
  'paper_33e4b9badbc5': '治理环境确为政府职责，环境出现问题，其监管________，执法不严难逃其责，但是，当大家不断________ 政府不作为时，是不是也应该________一下自己：我们有没有污染环境？依次填入划横线部分最恰当的一项是：',
  'paper_0a4d118b951d': '七名候选人中有女性三人：张丽、孙美和朱萍，男性四人：赵海、王波、李田和胡庆。现要从这七名候选人中选出三人组成某委员会，且符合以下规则：孙美和王波不能同时入选，胡庆不能与女性候选人同时入选。问如果赵海和李田不入选，那么该委员会的组成有几种可能？'
};

function applyToQuestions(questions, getKey, getStem, setStem, label) {
  let n = 0;
  questions.forEach((q) => {
    const key = getKey(q);
    const fix = STEM_FIX[key];
    if (!fix) return;
    const cur = getStem(q);
    if (cur !== fix) {
      setStem(q, fix);
      n += 1;
      console.log(label, key, '→', fix.slice(0, 50) + '…');
    }
  });
  return n;
}

const files = [
  path.join(__dirname, 'published-quiz-banks', '中国石化思想素质新清洗库_20260919.json'),
  path.join(__dirname, 'published-quiz-banks', '工作台导入_新清洗主库_20260919.json'),
  path.join(__dirname, 'quiz_bank.json')
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = applyToQuestions(
    doc.questions,
    (q) => q.question_id,
    (q) => q.stem,
    (q, v) => { q.stem = v; },
    path.basename(file)
  );
  if (n) {
    fs.writeFileSync(file, JSON.stringify(doc, file.endsWith('quiz_bank.json') ? undefined : 2), 'utf8');
    console.log('wrote', file);
  }
}

const softJson = 'E:\\workbuddyworkspace\\mmsh\\刷题软件\\题库_merged.json';
const softHtml = 'E:\\workbuddyworkspace\\mmsh\\刷题软件\\index.html';
const bank = JSON.parse(fs.readFileSync(softJson, 'utf8'));
const n = applyToQuestions(
  bank,
  (q) => q.sid,
  (q) => q.question,
  (q, v) => { q.question = v; },
  'soft'
);
if (n) {
  fs.writeFileSync(softJson, JSON.stringify(bank, null, 1), 'utf8');
  let html = fs.readFileSync(softHtml, 'utf8');
  const payload = JSON.stringify(bank).replace(/</g, '\\u003c');
  html = html.replace(/var DEMO_BANK = \[[\s\S]*?\];/, 'var DEMO_BANK = ' + payload + ';');
  fs.writeFileSync(softHtml, html, 'utf8');
  console.log('soft re-embedded, count=', bank.length);
}

// verify
const pub = JSON.parse(fs.readFileSync(files[0], 'utf8'));
for (const id of Object.keys(STEM_FIX)) {
  const q = pub.questions.find((x) => x.question_id === id);
  console.log('VERIFY', id, q.stem, '| ans', q.correct_keys, '| B', (q.options.find((o) => o.key === 'B') || {}).text);
}
const soft = JSON.parse(fs.readFileSync(softJson, 'utf8'));
for (const id of Object.keys(STEM_FIX)) {
  const q = soft.find((x) => x.sid === id);
  console.log('SOFT', id, q && q.question, '| ans', q && q.answer);
}
const softCount = (() => {
  const html = fs.readFileSync(softHtml, 'utf8');
  const m = html.match(/var DEMO_BANK = (\[[\s\S]*?\]);/);
  return m ? JSON.parse(m[1]).length : -1;
})();
console.log('soft HTML DEMO_BANK count', softCount);
