const fs = require('fs');
const dir = 'E:\\workbuddyworkspace\\mmsh\\题库清洗\\output\\新清洗_20260919\\';
const imp = JSON.parse(fs.readFileSync(dir + '题库_新清洗_导入版_20260919.json', 'utf8'));
const formal = JSON.parse(fs.readFileSync(dir + '题库_新清洗_正式库_20260919.json', 'utf8'));

function countBy(list, fn) {
  const map = new Map();
  list.forEach((item) => { const key = fn(item); map.set(key, (map.get(key) || 0) + 1); });
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

console.log('导入版 count=' + imp.length + ' 正式库 count=' + formal.length);
console.log('导入版 keys: ' + Object.keys(imp[0]).join(','));
console.log('正式库 keys: ' + Object.keys(formal[0]).join(','));
console.log('\n-- type 分布 --');
console.log(countBy(imp, (q) => q.type).map(([k, v]) => k + ':' + v).join(' | '));
console.log('\n-- 导入版 category 分布 --');
console.log(countBy(imp, (q) => q.category).map(([k, v]) => k + ':' + v).join(' | '));
console.log('\n-- 导入版 section 分布 --');
console.log(countBy(imp, (q) => q.section).map(([k, v]) => k + ':' + v).slice(0, 20).map(([k, v]) => k + ':' + v).join(' | '));
console.log('\n-- 正式库 category 分布 --');
console.log(countBy(formal, (q) => q.category).map(([k, v]) => k + ':' + v).join(' | '));
console.log('\n-- 正式库 subcategory 分布 --');
console.log(countBy(formal, (q) => q.subcategory).map(([k, v]) => k + ':' + v).slice(0, 20).map(([k, v]) => k + ':' + v).join(' | '));
console.log('\n-- 答案格式样本 --');
const weirdAnswers = countBy(imp, (q) => String(q.answer)).filter(([k]) => !/^[A-Z]+$/.test(k));
console.log('非纯大写字母答案: ' + (weirdAnswers.length ? weirdAnswers.map(([k, v]) => JSON.stringify(k) + ':' + v).join(' | ') : '无'));
console.log('答案长度分布: ' + countBy(imp, (q) => String(q.answer).length).map(([k, v]) => k + '字母:' + v).join(' | '));
console.log('\n-- 选项数分布 --');
console.log(countBy(imp, (q) => Object.keys(q.options || {}).length).map(([k, v]) => k + '项:' + v).join(' | '));
console.log('\n-- 异常数据 --');
const problems = [];
imp.forEach((q, index) => {
  const keys = Object.keys(q.options || {});
  const answers = String(q.answer || '').split('').filter(Boolean);
  if (keys.length < 2) problems.push(index + ' 选项不足');
  if (!answers.length) problems.push(index + ' 无答案');
  answers.forEach((a) => { if (keys.indexOf(a) === -1) problems.push(index + ' 答案越界:' + a); });
  if (q.type === 'single' && answers.length !== 1) problems.push(index + ' 单选多答案:' + q.answer);
  if (q.type === 'multiple' && answers.length < 2) problems.push(index + ' 多选单答案:' + q.answer);
  if (!q.question || !String(q.question).trim()) problems.push(index + ' 空题干');
  if (q.image) problems.push(index + ' 含图片');
});
console.log(problems.length ? problems.slice(0, 20).join('\n') + (problems.length > 20 ? '\n...共 ' + problems.length + ' 条' : '') : '无');

console.log('\n-- 两库对齐 --');
const formalById = new Map(formal.map((q) => [q.id, q]));
let aligned = 0;
let mismatched = 0;
imp.forEach((q) => {
  const f = formalById.get(q.sid);
  if (f && f.app_id === q.id) aligned += 1; else mismatched += 1;
});
console.log('sid 对齐: ' + aligned + '，未对齐: ' + mismatched);

console.log('\n-- 企业作风/核心价值观相关 --');
const keywordHits = imp.filter((q) => /企业作风|核心价值|企业愿景|企业使命|企业文化/.test(q.question + ' ' + q.category + ' ' + q.section + ' ' + (q.paper || '')));
console.log('命中题目数: ' + keywordHits.length);
console.log(countBy(keywordHits, (q) => q.category + ' / ' + q.section).map(([k, v]) => k + ':' + v).join(' | '));
