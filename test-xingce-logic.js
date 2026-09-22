/** 纯逻辑：行测数据隔离与判题 */
const XingceData = require('./xingce-data.js');
const XingceEngine = require('./xingce-engine.js');
const XingceImport = require('./xingce-import.js');

let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass += 1; console.log('  [PASS] ' + name); }
  else { fail += 1; console.log('  [FAIL] ' + name); }
}

// mock localStorage
const mem = new Map();
global.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};

check('存储键独立', XingceData.LS_KEY === 'xingce_quiz_data');

const doc = {
  schema_version: 1,
  bank: { bank_id: 't', name: 'T', version: '1' },
  questions: [{
    question_id: 'q1', question_type: 'single_choice', stem: 'S',
    options: [{ key: 'A', text: '1' }, { key: 'B', text: '2' }],
    answer_keys: ['A'], category_l1: '数量关系', category_l2: '工程问题'
  }, {
    question_id: 'q2', question_type: 'multiple_choice', stem: 'M',
    options: [{ key: 'A', text: '1' }, { key: 'B', text: '2' }, { key: 'C', text: '3' }],
    answer_keys: ['A', 'B'], category_l1: '判断推理', category_l2: '逻辑判断'
  }]
};
let d = XingceData.ensure({});
const an = XingceImport.analyze(doc, d);
check('导入分析', an.summary.add === 2);
d = XingceImport.apply(doc, d, an).data;
check('导入2题', XingceData.activeQuestions(d).length === 2);

const q1 = XingceData.findQuestion(d, 'q1');
check('单选判对', XingceEngine.judge(q1, ['A']).isCorrect === true);
check('单选判错', XingceEngine.judge(q1, ['B']).isCorrect === false);
const q2 = XingceData.findQuestion(d, 'q2');
check('多选全对', XingceEngine.judge(q2, ['A', 'B']).isCorrect === true);
check('多选严格少选错', XingceEngine.judge(q2, ['A']).isCorrect === false);
check('多选严格多选错', XingceEngine.judge(q2, ['A', 'B', 'C']).isCorrect === false);

XingceEngine.submit(d, null, q1, ['B'], 1000, 'practice');
XingceEngine.submit(d, null, q2, ['A', 'B'], 2000, 'practice');
const st = XingceData.stats(d);
check('统计2次', st.attempt_count === 2);
check('错题1', st.wrong_count === 1);
check('分类隔离', Object.keys(st.by_category).indexOf('数量关系') !== -1);

const mixed = XingceData.reserveMixedExam();
check('混合卷未启用', mixed.enabled === false);
let threw = false;
try { mixed.buildFullPaper(); } catch (e) { threw = true; }
check('混合卷调用会抛未实现', threw);

check('未写入 workbench_data', !mem.has('workbench_data') || mem.get('workbench_data') == null);

console.log('Results: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
