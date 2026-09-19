const fs = require('fs');
const path = require('path');

const GRANULAR_KEEP = true;
const TOP_SECTIONS = ['思想素质', '思维能力'];

function swapCategories(questions) {
  let n = 0;
  questions.forEach((q) => {
    if (TOP_SECTIONS.includes(q.category_l1) && q.category_l2) {
      const l1 = q.category_l2;
      const l2 = q.category_l1;
      q.category_l1 = l1;
      q.category_l2 = l2;
      n += 1;
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
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = swapCategories(doc.questions || []);
  fs.writeFileSync(file, JSON.stringify(doc, file.endsWith('quiz_bank.json') ? undefined : 2), 'utf8');
  console.log(path.basename(file), 'swapped', n);
}

// also update soft bank category field to granular (already is item.category)
const softJson = 'E:\\workbuddyworkspace\\mmsh\\刷题软件\\题库_merged.json';
const softHtml = 'E:\\workbuddyworkspace\\mmsh\\刷题软件\\index.html';
const bank = JSON.parse(fs.readFileSync(softJson, 'utf8'));
// soft already uses granular category; keep section as 板块
const dist = {};
bank.forEach((q) => { dist[q.category || '未分类'] = (dist[q.category || '未分类'] || 0) + 1; });
console.log('soft categories', Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 15));

const pub = JSON.parse(fs.readFileSync(files[0], 'utf8'));
const d2 = {};
pub.questions.forEach((q) => { d2[q.category_l1] = (d2[q.category_l1] || 0) + 1; });
console.log('pub l1', Object.entries(d2).sort((a, b) => b[1] - a[1]));
const vision = pub.questions.find((q) => q.question_id === 'hist_9e5e0e5fa8c1');
console.log('vision cat', vision.category_l1, '/', vision.category_l2, 'ans', vision.correct_keys);
