const QuizData = require('./quiz-data.js');
const QuizExam = require('./quiz-exam.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed += 1; console.log('  [PASS] ' + message); }
  else { failed += 1; console.log('  [FAIL] ' + message); }
}

function demoData() {
  const data = QuizData.ensure({});
  const document = {
    schema_version: 1,
    bank: { bank_id: 'demo', name: '演示题库', version: '1.0' },
    questions: [
      { question_id: 'q1', version: '1.0', question_type: 'single_choice', stem: '第一题', options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }], correct_keys: ['A'], category_l1: '常识', status: 'active' },
      { question_id: 'q2', version: '1.0', question_type: 'single_choice', stem: '第二题', options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }], correct_keys: ['B'], category_l1: '政治', status: 'active' },
      { question_id: 'q3', version: '1.0', question_type: 'multiple_choice', stem: '第三题', options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }, { key: 'C', text: '丙' }], correct_keys: ['A', 'C'], category_l1: '常识', status: 'active' }
    ]
  };
  const QuizImport = require('./quiz-import.js');
  const analysis = QuizImport.analyze(document, data);
  return QuizImport.apply(document, data, { analysis: analysis, now: '2026-09-19T10:00:00.000Z' }).data;
}

console.log('\n=== Test: exam flow ===');
let data = demoData();
const session = QuizExam.createExamSession(data, {
  count: 2, durationSeconds: 60, startedAt: '2026-09-19T10:00:00.000Z',
  randomValue: function () { return 0.5; }
});
assert(session.title === '综合练习 · ' + new Date().toISOString().slice(0, 10), '缺省名称自动生成');
assert(session.source === '个人题库' && session.year === 2026, '缺省来源和年份自动生成');
assert(session.question_ids.length === 2, '考试题目数量正确');
assert(Object.keys(session.question_versions).length === 2, '考试固定题目版本');

QuizExam.saveExamAnswer(data, session.exam_id, session.question_ids[0], ['A'], { now: '2026-09-19T10:00:05.000Z' });
QuizExam.toggleExamMark(data, session.exam_id, session.question_ids[0], true, { now: '2026-09-19T10:00:06.000Z' });
const progress = QuizExam.getExamProgress(data, session.exam_id, '2026-09-19T10:00:07.000Z');
assert(progress.answeredCount === 1 && progress.unansweredCount === 1, '答题进度正确');
assert(progress.markedCount === 1, '标记题统计正确');
assert(QuizExam.resumeLatestExam(data).exam_id === session.exam_id, '未交卷考试可恢复');

const result = QuizExam.submitExam(data, session.exam_id, { now: '2026-09-19T10:00:20.000Z' });
assert(result.correct_count === 1 && result.unanswered_count === 1, '交卷结果正确');
assert(result.total_score === 50, '按总题数计算分数');
assert(QuizExam.submitExam(data, session.exam_id, { now: '2026-09-19T10:00:30.000Z' }).client_id === result.client_id, '重复交卷幂等');
const examAttempts = data.quiz_attempts.filter(function (attempt) { return attempt.session_id === session.exam_id; });
assert(examAttempts.length === 2, '交卷后每道题生成 attempt（含未答）');
assert(examAttempts.every(function (attempt) { return attempt.mode === 'exam'; }), '考试 attempt 标记 mode=exam');
assert(examAttempts.filter(function (attempt) { return attempt.is_correct; }).length === 1, 'attempt 判分与考试结果一致');
assert(data.quiz_question_states.filter(function (state) { return state.wrong_active; }).length === 1, '答错或未答题进入错题状态');
assert(data.quiz_attempts.filter(function (attempt) { return attempt.session_id === session.exam_id; }).length === 2, '重复交卷不重复生成 attempt');
assert(QuizExam.resumeLatestExam(data) === null, '交卷后不再恢复');

const timed = QuizExam.createExamSession(data, { count: 1, durationSeconds: 10, startedAt: '2026-09-19T11:00:00.000Z' });
assert(QuizExam.shouldAutoSubmit(timed, '2026-09-19T11:00:10.000Z'), '考试时间到可自动交卷');
assert(!QuizExam.shouldAutoSubmit(timed, '2026-09-19T11:00:09.000Z'), '考试未到时限不自动交卷');

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
