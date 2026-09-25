(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.QuizData = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var LS_KEY = 'workbench_data';
  var COLLECTIONS = [
    'quiz_banks', 'quiz_questions', 'quiz_question_versions',
    'quiz_sessions', 'quiz_attempts', 'quiz_question_states',
    'quiz_import_batches', 'quiz_exam_sessions', 'quiz_exam_answers',
    'quiz_exam_results'
  ];

  function newId(prefix) {
    var cryptoObject = typeof crypto !== 'undefined' ? crypto : null;
    if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
      return (prefix ? prefix + '-' : '') + cryptoObject.randomUUID();
    }
    return (prefix ? prefix + '-' : '') + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  }

  function nowIso() { return new Date().toISOString(); }

  function emptyData() {
    return {
      version: 2,
      quiz_schema_version: 1,
      quiz_banks: [],
      quiz_questions: [],
      quiz_question_versions: [],
      quiz_sessions: [],
      quiz_attempts: [],
      quiz_question_states: [],
      quiz_import_batches: [],
      quiz_exam_sessions: [],
      quiz_exam_answers: [],
      quiz_exam_results: []
    };
  }

  function ensure(data) {
    var result = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    var defaults = emptyData();
    Object.keys(defaults).forEach(function (key) {
      if (Array.isArray(defaults[key])) {
        if (!Array.isArray(result[key])) result[key] = [];
      } else if (result[key] == null) {
        result[key] = defaults[key];
      }
    });
    if (!result.meta || typeof result.meta !== 'object') result.meta = {};
    if (!result.settings || typeof result.settings !== 'object') result.settings = {};
    return result;
  }

  function text(value) {
    return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  }

  function normalizeOptions(value) {
    if (Array.isArray(value)) {
      return value.map(function (option, index) {
        option = option && typeof option === 'object' ? option : {};
        return {
          key: text(option.key || option.label || String.fromCharCode(65 + index)).toUpperCase(),
          text: text(option.text || option.value || option.label)
        };
      }).filter(function (option) { return option.key && option.text; });
    }
    if (!value || typeof value !== 'object') return [];
    return Object.keys(value).sort().map(function (key) {
      var option = value[key];
      return { key: text(key).toUpperCase(), text: text(option && typeof option === 'object' ? option.text || option.value : option) };
    }).filter(function (option) { return option.key && option.text; });
  }

  function normalizeAnswer(value) {
    if (Array.isArray(value)) return value.map(function (key) { return text(key).toUpperCase(); }).filter(Boolean);
    return text(value).split(/[,，\s、;；/|]+/).map(function (key) { return key.toUpperCase(); }).filter(Boolean);
  }

  function firstNonEmptyAnswer(values) {
    for (var i = 0; i < values.length; i += 1) {
      var result = normalizeAnswer(values[i]);
      if (result.length) return result;
    }
    return [];
  }

  function repairLegacyContent(data) {
    data = ensure(data);
    var changed = false;
    data.quiz_questions.forEach(function (question) {
      if (!question || question.is_deleted) return;
      var version = findVersion(data, question.question_id, question.current_version);
      var source = version || question;
      var stem = text(source.stem || source.question || question.stem || question.question);
      var options = normalizeOptions(source.options && normalizeOptions(source.options).length ? source.options : question.options);
      var correctKeys = firstNonEmptyAnswer([
        source.correct_keys, source.answer_keys, source.answer,
        question.correct_keys, question.answer
      ]);
      if (!version && stem && options.length >= 2) {
        version = {
          client_id: newId('qversion'),
          question_id: question.question_id,
          version: text(question.current_version) || '1.0',
          stem: stem,
          options: options,
          correct_keys: correctKeys,
          explanation: text(source.explanation || source.analysis || question.explanation || question.analysis) || null,
          source_snapshot: {},
          content_fingerprint: '',
          created_at: nowIso(),
          created_by: 'legacy-repair',
          is_current: true,
          is_deleted: false,
          updated_at: nowIso()
        };
        question.current_version = version.version;
        data.quiz_question_versions.push(version);
        changed = true;
        return;
      }
      if (!version) return;
      if (!text(version.stem) && stem) { version.stem = stem; changed = true; }
      if ((!Array.isArray(version.options) || !version.options.length) && options.length) { version.options = options; changed = true; }
      if ((!Array.isArray(version.correct_keys) || !version.correct_keys.length) && correctKeys.length) { version.correct_keys = correctKeys; changed = true; }
      if (!version.explanation && (source.explanation || source.analysis || question.explanation || question.analysis)) {
        version.explanation = text(source.explanation || source.analysis || question.explanation || question.analysis) || null;
        changed = true;
      }
    });
    return changed;
  }

  function load(storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!storage) return ensure({});
    var raw = storage.getItem(LS_KEY);
    if (!raw) return ensure({});
    try { return ensure(JSON.parse(raw)); }
    catch (error) { return ensure({}); }
  }

  function save(data, storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!storage) throw new Error('localStorage 不可用');
    storage.setItem(LS_KEY, JSON.stringify(ensure(data)));
  }

  function clone(data) { return JSON.parse(JSON.stringify(data)); }

  function activeQuestions(data) {
    data = ensure(data);
    return data.quiz_questions.filter(function (question) {
      return !question.is_deleted && question.status === 'active';
    });
  }

  function findQuestion(data, questionId) {
    data = ensure(data);
    return data.quiz_questions.find(function (question) {
      return !question.is_deleted && question.question_id === questionId;
    }) || null;
  }

  function findVersion(data, questionId, version) {
    data = ensure(data);
    return data.quiz_question_versions.find(function (item) {
      return !item.is_deleted && item.question_id === questionId && item.version === version;
    }) || null;
  }

  function currentVersion(data, question) {
    if (!question) return null;
    return findVersion(data, question.question_id, question.current_version);
  }

  function findState(data, questionId) {
    data = ensure(data);
    return data.quiz_question_states.find(function (state) {
      return !state.is_deleted && state.question_id === questionId;
    }) || null;
  }

  function upsertByClientId(list, record) {
    var index = list.findIndex(function (item) { return item.client_id === record.client_id; });
    if (index === -1) list.push(record);
    else list[index] = record;
    return record;
  }

  function newQuestionState(questionId, now) {
    now = now || nowIso();
    return {
      client_id: newId('qstate'), question_id: questionId,
      attempt_count: 0, correct_count: 0, wrong_count: 0, accuracy: 0,
      total_active_seconds: 0, average_seconds: 0, last_attempt_at: null,
      last_result: null, consecutive_correct: 0, consecutive_wrong: 0,
      ever_wrong: false, wrong_active: false, favorite: false,
      mastery_score: 0, last_review_at: null, updated_at: now, is_deleted: false
    };
  }

  return {
    LS_KEY: LS_KEY,
    COLLECTIONS: COLLECTIONS,
    newId: newId,
    nowIso: nowIso,
    emptyData: emptyData,
    ensure: ensure,
    repairLegacyContent: repairLegacyContent,
    load: load,
    save: save,
    clone: clone,
    activeQuestions: activeQuestions,
    findQuestion: findQuestion,
    findVersion: findVersion,
    currentVersion: currentVersion,
    findState: findState,
    upsertByClientId: upsertByClientId,
    newQuestionState: newQuestionState
  };
});
