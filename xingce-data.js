(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.XingceData = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // 与价值观/思想素质模块完全隔离：只读写 xingce_quiz_data，不碰 workbench_data / quiz_*
  var LS_KEY = 'xingce_quiz_data';

  var CATEGORIES = [
    { id: 'verbal', name: '言语理解', skills: ['逻辑填空', '片段阅读', '语句表达', '篇章阅读'] },
    { id: 'judgment', name: '判断推理', skills: ['图形推理', '定义判断', '类比推理', '逻辑判断', '翻译推理', '逻辑真假题'] },
    { id: 'quant', name: '数量关系', skills: ['工程问题', '行程问题', '排列组合', '概率问题', '经济利润', '容斥问题', '最值问题'] },
    { id: 'data', name: '资料分析', skills: ['增长率', '比重', '倍数', '平均数', '综合分析'] },
    { id: 'common', name: '常识', skills: ['政治常识', '法律常识', '科技常识', '人文常识', '经济国情'] }
  ];

  function newId(prefix) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return (prefix ? prefix + '-' : '') + crypto.randomUUID();
    return (prefix ? prefix + '-' : '') + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function nowIso() { return new Date().toISOString(); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function emptyData() {
    return {
      schema_version: 1,
      module: 'xingce',
      banks: [],
      questions: [],
      attempts: [],
      sessions: [],
      question_states: [],
      settings: {
        timer_enabled: true,
        default_minutes: 20,
        mixed_exam_reserved: true,
        aptitude_score_weight: 60,
        values_score_weight: 40
      },
      meta: {}
    };
  }

  function ensure(data) {
    var d = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
    ['banks', 'questions', 'attempts', 'sessions', 'question_states'].forEach(function (k) {
      if (!Array.isArray(d[k])) d[k] = [];
    });
    if (!d.settings || typeof d.settings !== 'object') d.settings = emptyData().settings;
    else {
      // 补齐缺失设置项，不整段覆盖
      var defaults = emptyData().settings;
      Object.keys(defaults).forEach(function (k) {
        if (d.settings[k] == null) d.settings[k] = defaults[k];
      });
    }
    if (!d.meta || typeof d.meta !== 'object') d.meta = {};
    if (d.schema_version == null) d.schema_version = 1;
    d.module = 'xingce';
    return d;
  }

  function load() {
    try {
      if (typeof localStorage === 'undefined') return emptyData();
      var raw = localStorage.getItem(LS_KEY);
      return raw ? ensure(JSON.parse(raw)) : emptyData();
    } catch (e) {
      return emptyData();
    }
  }

  function save(data) {
    if (typeof localStorage === 'undefined') throw new Error('localStorage 不可用');
    localStorage.setItem(LS_KEY, JSON.stringify(ensure(data)));
    return ensure(data);
  }

  function activeQuestions(data) {
    return ensure(data).questions.filter(function (q) { return !q.is_deleted && q.status !== 'inactive'; });
  }

  function findQuestion(data, id) {
    return ensure(data).questions.find(function (q) { return q.question_id === id; }) || null;
  }

  function findState(data, questionId) {
    return ensure(data).question_states.find(function (s) { return s.question_id === questionId && !s.is_deleted; }) || null;
  }

  function ensureState(data, questionId) {
    data = ensure(data);
    var s = findState(data, questionId);
    if (!s) {
      s = {
        question_id: questionId,
        is_wrong: false,
        is_favorite: false,
        wrong_count: 0,
        correct_count: 0,
        attempt_count: 0,
        streak_correct: 0,
        last_correct: null,
        last_at: null,
        created_at: nowIso(),
        updated_at: nowIso()
      };
      data.question_states.push(s);
    }
    return s;
  }

  function recordAttempt(data, payload) {
    data = ensure(data);
    var attempt = {
      attempt_id: newId('xa'),
      question_id: payload.question_id,
      selected_keys: clone(payload.selected_keys || []),
      is_correct: !!payload.is_correct,
      duration_ms: Number(payload.duration_ms) || 0,
      mode: payload.mode || 'practice',
      skill: payload.skill || null,
      category: payload.category || null,
      learning_date: payload.learning_date || nowIso().slice(0, 10),
      created_at: payload.created_at || nowIso()
    };
    data.attempts.push(attempt);
    var st = ensureState(data, attempt.question_id);
    st.attempt_count += 1;
    if (attempt.is_correct) {
      st.correct_count += 1;
      st.streak_correct = (st.streak_correct || 0) + 1;
      st.last_correct = true;
      if (st.streak_correct >= 2) st.is_wrong = false;
    } else {
      st.wrong_count += 1;
      st.streak_correct = 0;
      st.last_correct = false;
      st.is_wrong = true;
    }
    st.last_at = attempt.created_at;
    st.updated_at = attempt.created_at;
    return attempt;
  }

  function setFavorite(data, questionId, on) {
    data = ensure(data);
    var st = ensureState(data, questionId);
    st.is_favorite = !!on;
    st.updated_at = nowIso();
    return st;
  }

  function wrongQuestions(data) {
    data = ensure(data);
    var map = {};
    data.question_states.forEach(function (s) { if (s.is_wrong && !s.is_deleted) map[s.question_id] = true; });
    return activeQuestions(data).filter(function (q) { return map[q.question_id]; });
  }

  function favoriteQuestions(data) {
    data = ensure(data);
    var map = {};
    data.question_states.forEach(function (s) { if (s.is_favorite && !s.is_deleted) map[s.question_id] = true; });
    return activeQuestions(data).filter(function (q) { return map[q.question_id]; });
  }

  function filterByCategory(data, categoryL1, skill) {
    return activeQuestions(data).filter(function (q) {
      if (categoryL1 && q.category_l1 !== categoryL1) return false;
      if (skill && q.category_l2 !== skill) return false;
      return true;
    });
  }

  function stats(data) {
    data = ensure(data);
    var attempts = data.attempts.filter(function (a) { return !a.is_deleted; });
    var correct = attempts.filter(function (a) { return a.is_correct; }).length;
    var wrongIds = {};
    data.question_states.forEach(function (s) { if (s.is_wrong) wrongIds[s.question_id] = true; });
    var favIds = {};
    data.question_states.forEach(function (s) { if (s.is_favorite) favIds[s.question_id] = true; });
    var byCat = {};
    CATEGORIES.forEach(function (c) { byCat[c.name] = { total: 0, answered: 0, correct: 0, attempts: 0, accuracy: 0 }; });
    activeQuestions(data).forEach(function (q) {
      var bag = byCat[q.category_l1] || (byCat[q.category_l1] = { total: 0, answered: 0, correct: 0, attempts: 0, accuracy: 0 });
      bag.total += 1;
    });
    var answeredSet = {};
    attempts.forEach(function (a) {
      var q = findQuestion(data, a.question_id);
      var name = (q && q.category_l1) || '未分类';
      var bag = byCat[name] || (byCat[name] = { total: 0, answered: 0, correct: 0, attempts: 0, accuracy: 0 });
      bag.attempts += 1;
      if (a.is_correct) bag.correct += 1;
      answeredSet[a.question_id] = true;
    });
    Object.keys(byCat).forEach(function (k) {
      var bag = byCat[k];
      bag.answered = activeQuestions(data).filter(function (q) { return q.category_l1 === k && answeredSet[q.question_id]; }).length;
      bag.accuracy = bag.attempts ? Math.round((bag.correct / bag.attempts) * 100) : 0;
    });
    return {
      question_count: activeQuestions(data).length,
      bank_count: data.banks.filter(function (b) { return !b.is_deleted; }).length,
      attempt_count: attempts.length,
      correct_count: correct,
      accuracy: attempts.length ? Math.round((correct / attempts.length) * 100) : 0,
      wrong_count: Object.keys(wrongIds).length,
      favorite_count: Object.keys(favIds).length,
      total_time_ms: attempts.reduce(function (sum, a) { return sum + (a.duration_ms || 0); }, 0),
      by_category: byCat
    };
  }

  /** 预留：三桶油完整卷（60 行测 + 40 价值观）。现阶段只暴露口子，不实现混合组卷。 */
  function reserveMixedExam() {
    return {
      enabled: false,
      aptitude_score_weight: 60,
      values_score_weight: 40,
      message: '混合组卷预留接口：未来可同时抽取行测题库 + 价值观题库。当前未实现。',
      buildFullPaper: function () {
        throw new Error('混合组卷尚未实现（仅预留扩展）');
      }
    };
  }

  return {
    LS_KEY: LS_KEY,
    CATEGORIES: CATEGORIES,
    newId: newId,
    nowIso: nowIso,
    clone: clone,
    emptyData: emptyData,
    ensure: ensure,
    load: load,
    save: save,
    activeQuestions: activeQuestions,
    findQuestion: findQuestion,
    findState: findState,
    ensureState: ensureState,
    recordAttempt: recordAttempt,
    setFavorite: setFavorite,
    wrongQuestions: wrongQuestions,
    favoriteQuestions: favoriteQuestions,
    filterByCategory: filterByCategory,
    stats: stats,
    reserveMixedExam: reserveMixedExam
  };
});
