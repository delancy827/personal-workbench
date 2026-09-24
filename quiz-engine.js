(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./quiz-data.js'));
  else root.QuizEngine = factory(root.QuizData);
})(typeof window !== 'undefined' ? window : globalThis, function (QuizData) {
  'use strict';

  function sortedKeys(keys) {
    if (!Array.isArray(keys)) return [];
    return Array.from(new Set(keys.map(function (key) { return String(key).trim().toUpperCase(); }).filter(Boolean))).sort();
  }

  function sameKeys(a, b) {
    a = sortedKeys(a); b = sortedKeys(b);
    return a.length === b.length && a.every(function (key, index) { return key === b[index]; });
  }

  function judge(questionVersion, selectedKeys) {
    if (!questionVersion) return { isCorrect: false, selectedKeys: [], correctKeys: [] };
    var correctKeys = sortedKeys(questionVersion.correct_keys);
    var normalizedSelected = sortedKeys(selectedKeys);
    return {
      isCorrect: correctKeys.length > 0 && sameKeys(correctKeys, normalizedSelected),
      selectedKeys: normalizedSelected,
      correctKeys: correctKeys
    };
  }

  function shuffle(items, random) {
    var result = items.slice();
    random = random || Math.random;
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var temp = result[i]; result[i] = result[j]; result[j] = temp;
    }
    return result;
  }

  function prioritizeRandom(list, data, random, now) {
    random = random || Math.random;
    now = now || Date.now();
    return list.map(function (question) {
      var state = QuizData.findState(data, question.question_id);
      var attempts = state && Number(state.attempt_count) || 0;
      var parsedLastAttempt = state && state.last_attempt_at ? new Date(state.last_attempt_at).getTime() : 0;
      var lastAttempt = Number.isFinite(parsedLastAttempt) ? parsedLastAttempt : 0;
      return {
        question: question,
        attempts: attempts,
        lastAttempt: lastAttempt,
        tie: random()
      };
    }).sort(function (a, b) {
      if (a.attempts !== b.attempts) return a.attempts - b.attempts;
      if (a.lastAttempt !== b.lastAttempt) return a.lastAttempt - b.lastAttempt;
      return a.tie - b.tie;
    }).map(function (item) { return item.question; });
  }

  function selectQuestions(data, options) {
    data = QuizData.ensure(data);
    options = options || {};
    var list = QuizData.activeQuestions(data).filter(function (question) {
      if (options.bankId && question.bank_id !== options.bankId) return false;
      if (options.categoryL1 && question.category_l1 !== options.categoryL1) return false;
      if (options.categoryL2 && question.category_l2 !== options.categoryL2) return false;
      if (options.tag && (!Array.isArray(question.tags) || question.tags.indexOf(options.tag) === -1)) return false;
      if (options.questionType && question.question_type !== options.questionType) return false;
      var state = QuizData.findState(data, question.question_id);
      if (options.wrongOnly && (!state || !state.wrong_active)) return false;
      if (options.favoriteOnly && (!state || !state.favorite)) return false;
      return true;
    });
    if (options.mode === 'random') list = prioritizeRandom(list, data, options.random, options.now);
    else list.sort(function (a, b) { return String(a.question_id).localeCompare(String(b.question_id)); });
    if (options.limit && options.limit > 0) list = list.slice(0, options.limit);
    return list;
  }

  function masteryScore(state, now) {
    if (!state || !state.attempt_count) return 0;
    now = now || Date.now();
    var accuracy = state.correct_count / state.attempt_count;
    var last = state.last_attempt_at ? new Date(state.last_attempt_at).getTime() : 0;
    var days = last ? Math.max(0, (now - last) / 86400000) : 365;
    var recency = Math.exp(-days / 14);
    var streak = Math.min((state.consecutive_correct || 0) / 5, 1);
    var errorPenalty = Math.min((state.wrong_count || 0) / 5, 1);
    var speed = state.average_seconds > 0 ? Math.max(0, Math.min(1, 45 / state.average_seconds)) : 0.5;
    var score = 0.4 * accuracy + 0.2 * recency + 0.2 * streak + 0.1 * (1 - errorPenalty) + 0.1 * speed;
    if (state.last_result === 'wrong') score = Math.min(score, 0.49);
    return Math.round(score * 1000) / 1000;
  }

  function getOrCreateState(data, questionId, now) {
    var state = QuizData.findState(data, questionId);
    if (state) return state;
    state = QuizData.newQuestionState(questionId, now);
    data.quiz_question_states.push(state);
    return state;
  }

  function recordAttempt(data, input) {
    data = QuizData.ensure(data);
    input = input || {};
    var question = QuizData.findQuestion(data, input.questionId);
    var version = QuizData.findVersion(data, input.questionId, input.questionVersion || (question && question.current_version));
    if (!question || !version) throw new Error('题目版本不存在');
    var result = judge(version, input.selectedKeys);
    var answeredAt = input.answeredAt || QuizData.nowIso();
    var attemptId = QuizData.newId('attempt');
    var attempt = {
      client_id: attemptId,
      attempt_id: attemptId,
      session_id: input.sessionId || null,
      question_id: question.question_id,
      question_version: version.version,
      bank_id: question.bank_id,
      learning_date: input.learningDate || answeredAt.slice(0, 10),
      selected_keys: result.selectedKeys,
      correct_keys: result.correctKeys,
      is_correct: result.isCorrect,
      active_seconds: Math.max(0, Math.round(Number(input.activeSeconds) || 0)),
      answered_at: answeredAt,
      mode: input.mode || 'practice',
      is_deleted: false,
      updated_at: answeredAt
    };
    data.quiz_attempts.push(attempt);

    var state = getOrCreateState(data, question.question_id, answeredAt);
    state.attempt_count += 1;
    state.total_active_seconds += attempt.active_seconds;
    if (result.isCorrect) {
      state.correct_count += 1;
      state.consecutive_correct += 1;
      state.consecutive_wrong = 0;
      state.last_result = 'correct';
      state.wrong_active = false;
    } else {
      state.wrong_count += 1;
      state.consecutive_wrong += 1;
      state.consecutive_correct = 0;
      state.last_result = 'wrong';
      state.ever_wrong = true;
      state.wrong_active = true;
    }
    state.accuracy = state.correct_count / state.attempt_count;
    state.average_seconds = state.total_active_seconds / state.attempt_count;
    state.last_attempt_at = answeredAt;
    state.last_review_at = answeredAt;
    state.mastery_score = masteryScore(state);
    state.updated_at = answeredAt;
    return { attempt: attempt, state: state, result: result };
  }

  function toggleFavorite(data, questionId, value, now) {
    data = QuizData.ensure(data);
    now = now || QuizData.nowIso();
    var state = getOrCreateState(data, questionId, now);
    state.favorite = value == null ? !state.favorite : Boolean(value);
    state.updated_at = now;
    return state;
  }

  function sessionForQuestions(data, questions, options) {
    options = options || {};
    var now = options.startedAt || QuizData.nowIso();
    var sessionId = QuizData.newId('session');
    var session = {
      client_id: sessionId, session_id: sessionId,
      mode: options.mode || 'sequential',
      bank_ids: Array.from(new Set(questions.map(function (q) { return q.bank_id; }))),
      filters: options.filters || {},
      question_ids: questions.map(function (q) { return q.question_id; }),
      question_versions: questions.reduce(function (out, q) { out[q.question_id] = q.current_version; return out; }, {}),
      current_index: 0, status: 'active', started_at: now, ended_at: null,
      learning_date: options.learningDate || now.slice(0, 10), active_seconds: 0,
      paused_seconds: 0, answered_count: 0, correct_count: 0,
      total_count: questions.length, time_limit_seconds: null,
      created_at: now, updated_at: now, is_deleted: false
    };
    data.quiz_sessions.push(session);
    return session;
  }

  function completeSession(session, now) {
    now = now || QuizData.nowIso();
    session.status = 'completed';
    session.ended_at = now;
    session.updated_at = now;
    return session;
  }

  function stats(data, learningDate) {
    data = QuizData.ensure(data);
    var attempts = data.quiz_attempts.filter(function (attempt) {
      return !attempt.is_deleted && (!learningDate || attempt.learning_date === learningDate);
    });
    var correct = attempts.filter(function (attempt) { return attempt.is_correct; }).length;
    var states = data.quiz_question_states.filter(function (state) { return !state.is_deleted; });
    var seconds = attempts.reduce(function (sum, attempt) { return sum + (Number(attempt.active_seconds) || 0); }, 0);
    return {
      attempts: attempts.length,
      correct: correct,
      wrong: attempts.length - correct,
      accuracy: attempts.length ? correct / attempts.length : 0,
      activeSeconds: seconds,
      currentWrong: states.filter(function (state) { return state.wrong_active; }).length,
      favorites: states.filter(function (state) { return state.favorite; }).length,
      everWrong: states.filter(function (state) { return state.ever_wrong; }).length
    };
  }

  function createActiveTimer(options) {
    options = options || {};
    var now = options.now || function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };
    var idleMs = options.idleMs || 60000;
    var maxSegmentMs = options.maxSegmentMs || 300000;
    var lastFlush = now();
    var lastActivity = lastFlush;
    var seconds = 0;
    var active = true;
    var idle = false;

    function flush() {
      var current = now();
      if (active && !idle) {
        var elapsed = Math.max(0, current - lastFlush);
        seconds += Math.min(elapsed, maxSegmentMs, idleMs) / 1000;
        if (current - lastActivity >= idleMs) idle = true;
      }
      lastFlush = current;
      return seconds;
    }
    return {
      activity: function () { flush(); var current = now(); lastActivity = current; if (idle) { idle = false; lastFlush = current; } },
      pause: function () { flush(); active = false; },
      resume: function () { active = true; idle = false; lastFlush = now(); lastActivity = lastFlush; },
      flush: flush,
      seconds: function () { return Math.round(flush()); },
      isActive: function () { return active && !idle; }
    };
  }

  return {
    sortedKeys: sortedKeys,
    sameKeys: sameKeys,
    judge: judge,
    shuffle: shuffle,
    selectQuestions: selectQuestions,
    masteryScore: masteryScore,
    recordAttempt: recordAttempt,
    toggleFavorite: toggleFavorite,
    sessionForQuestions: sessionForQuestions,
    completeSession: completeSession,
    stats: stats,
    createActiveTimer: createActiveTimer
  };
});
