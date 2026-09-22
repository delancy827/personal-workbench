(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./xingce-data.js'));
  else root.XingceEngine = factory(root.XingceData);
})(typeof window !== 'undefined' ? window : globalThis, function (XingceData) {
  'use strict';

  // 判题规则与价值观模块一致：单选全对，多选严格集合匹配（无部分分）
  function judge(question, selectedKeys) {
    var correct = (question.answer_keys || []).slice().map(String).sort();
    var selected = (selectedKeys || []).slice().map(String).sort();
    if (!correct.length) return { isCorrect: false, correctKeys: correct, selectedKeys: selected };
    var isCorrect = correct.length === selected.length && correct.every(function (k, i) { return k === selected[i]; });
    return { isCorrect: isCorrect, correctKeys: correct, selectedKeys: selected };
  }

  function shuffle(list) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function createSession(questions, mode) {
    var ids = (questions || []).map(function (q) { return q.question_id; });
    return {
      session_id: XingceData.newId('xs'),
      mode: mode || 'practice',
      question_ids: ids,
      index: 0,
      started_at: XingceData.nowIso(),
      answered: 0,
      correct: 0
    };
  }

  function startPractice(questions, mode) {
    var pool = (questions || []).slice();
    if (mode === 'random') pool = shuffle(pool);
    if (!pool.length) return null;
    return createSession(pool, mode || 'sequential');
  }

  function submit(data, session, question, selectedKeys, durationMs, mode) {
    data = XingceData.ensure(data);
    var result = judge(question, selectedKeys);
    var attempt = XingceData.recordAttempt(data, {
      question_id: question.question_id,
      selected_keys: result.selectedKeys,
      is_correct: result.isCorrect,
      duration_ms: durationMs,
      mode: mode || (session && session.mode) || 'practice',
      skill: question.category_l2,
      category: question.category_l1
    });
    if (session) {
      session.answered = (session.answered || 0) + 1;
      if (result.isCorrect) session.correct = (session.correct || 0) + 1;
    }
    return { attempt: attempt, isCorrect: result.isCorrect, correctKeys: result.correctKeys, selectedKeys: result.selectedKeys };
  }

  /** 预留混合组卷：不读取价值观 workbench_data，避免污染。 */
  function buildMixedPaperStub() {
    return XingceData.reserveMixedExam();
  }

  return {
    judge: judge,
    shuffle: shuffle,
    startPractice: startPractice,
    createSession: createSession,
    submit: submit,
    buildMixedPaperStub: buildMixedPaperStub
  };
});
