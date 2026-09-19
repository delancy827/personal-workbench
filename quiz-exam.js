(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./quiz-data.js'), require('./quiz-engine.js'), require('./quiz-stats.js'));
  else root.QuizExam = factory(root.QuizData, root.QuizEngine, root.QuizStats);
})(typeof window !== 'undefined' ? window : globalThis, function (QuizData, QuizEngine, QuizStats) {
  'use strict';

  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function nowIso(value) { return value || QuizData.nowIso(); }
  function clone(value) { return QuizData.clone(value); }
  function currentWorkspace(data) { return data.active_workspace_id || null; }

  function normalizeOptions(options) {
    options = options || {};
    var now = new Date();
    var title = text(options.title) || '综合练习 · ' + (options.learningDate || now.toISOString().slice(0, 10));
    var year = Number(options.year) || now.getFullYear();
    var count = Number(options.count);
    return {
      bankId: text(options.bankId) || null,
      categoryL1: text(options.categoryL1) || null,
      categoryL2: text(options.categoryL2) || null,
      count: count > 0 ? Math.floor(count) : 20,
      durationSeconds: Number(options.durationSeconds) > 0 ? Math.floor(Number(options.durationSeconds)) : 0,
      title: title,
      source: text(options.source) || '个人题库',
      year: year,
      note: text(options.note) || '',
      random: options.random !== false,
      learningDate: text(options.learningDate) || now.toISOString().slice(0, 10),
      startedAt: options.startedAt || null,
      randomValue: options.randomValue
    };
  }

  function selectPaperQuestions(data, options) {
    data = QuizData.ensure(data);
    options = normalizeOptions(options);
    var questions = QuizData.activeQuestions(data).filter(function (question) {
      if (options.bankId && question.bank_id !== options.bankId) return false;
      if (options.categoryL1 && question.category_l1 !== options.categoryL1) return false;
      if (options.categoryL2 && question.category_l2 !== options.categoryL2) return false;
      return Boolean(QuizData.currentVersion(data, question));
    });
    if (options.random) questions = QuizEngine.shuffle(questions, options.randomValue);
    else questions.sort(function (a, b) { return String(a.question_id).localeCompare(String(b.question_id)); });
    return questions.slice(0, Math.min(options.count, questions.length));
  }

  function createExamSession(data, options) {
    data = QuizData.ensure(data);
    options = normalizeOptions(options);
    var questions = options.questionIds ? options.questionIds.map(function (id) { return QuizData.findQuestion(data, id); }).filter(Boolean) : selectPaperQuestions(data, options);
    if (!questions.length) throw new Error('当前范围没有可用题目');
    var startedAt = nowIso(options.startedAt);
    var examId = QuizData.newId('exam');
    var session = {
      client_id: examId, exam_id: examId, workspace_id: currentWorkspace(data),
      title: options.title, source: options.source, year: options.year, note: options.note,
      bank_id: options.bankId || questions[0].bank_id, category_l1: options.categoryL1, category_l2: options.categoryL2,
      question_ids: questions.map(function (question) { return question.question_id; }),
      question_versions: questions.reduce(function (result, question) {
        result[question.question_id] = question.current_version; return result;
      }, {}),
      total_count: questions.length, duration_seconds: options.durationSeconds,
      started_at: startedAt, submitted_at: null, elapsed_seconds: 0,
      current_index: 0, status: 'in_progress', answered_count: 0, marked_count: 0,
      learning_date: options.learningDate, attempts_recorded_at: null,
      created_at: startedAt, updated_at: startedAt, is_deleted: false
    };
    data.quiz_exam_sessions.push(session);
    return session;
  }

  function findSession(data, examId) {
    return QuizData.ensure(data).quiz_exam_sessions.find(function (session) {
      return session.exam_id === examId && !session.is_deleted;
    }) || null;
  }

  function findAnswer(data, examId, questionId) {
    return QuizData.ensure(data).quiz_exam_answers.find(function (answer) {
      return answer.exam_id === examId && answer.question_id === questionId && !answer.is_deleted;
    }) || null;
  }

  function answerKeys(keys) { return QuizEngine.sortedKeys(keys); }
  function elapsedSeconds(session, now) {
    if (!session) return 0;
    if (session.status !== 'in_progress') return Math.max(0, Number(session.elapsed_seconds) || 0);
    var start = new Date(session.started_at).getTime();
    var current = new Date(now || QuizData.nowIso()).getTime();
    var elapsed = start && current >= start ? Math.floor((current - start) / 1000) : 0;
    return Math.max(Number(session.elapsed_seconds) || 0, elapsed);
  }

  function saveExamAnswer(data, examId, questionId, selectedKeys, options) {
    data = QuizData.ensure(data);
    options = options || {};
    var session = findSession(data, examId);
    if (!session || session.status !== 'in_progress') throw new Error('考试不存在或已交卷');
    if (session.question_ids.indexOf(questionId) === -1) throw new Error('题目不属于当前考试');
    var question = QuizData.findQuestion(data, questionId);
    var version = QuizData.findVersion(data, questionId, session.question_versions[questionId]);
    if (!question || !version) throw new Error('题目版本不存在');
    var answer = findAnswer(data, examId, questionId);
    var now = nowIso(options.now);
    var selected = answerKeys(selectedKeys);
    if (!answer) {
      answer = { client_id: QuizData.newId('exam-answer'), exam_id: examId, workspace_id: currentWorkspace(data), question_id: questionId, question_version: version.version, selected_keys: [], is_answered: false, is_correct: false, is_marked: false, answered_at: null, updated_at: now, is_deleted: false };
      data.quiz_exam_answers.push(answer);
    }
    answer.selected_keys = selected;
    answer.is_answered = selected.length > 0;
    answer.is_correct = answer.is_answered && QuizEngine.judge(version, selected).isCorrect;
    answer.answered_at = answer.is_answered ? now : null;
    answer.updated_at = now;
    refreshSessionProgress(data, session, now);
    return answer;
  }

  function toggleExamMark(data, examId, questionId, value, options) {
    data = QuizData.ensure(data);
    options = options || {};
    var session = findSession(data, examId);
    if (!session || session.status !== 'in_progress') throw new Error('考试不存在或已交卷');
    var answer = findAnswer(data, examId, questionId);
    var now = nowIso(options.now);
    if (!answer) {
      answer = { client_id: QuizData.newId('exam-answer'), exam_id: examId, workspace_id: currentWorkspace(data), question_id: questionId, question_version: session.question_versions[questionId], selected_keys: [], is_answered: false, is_correct: false, is_marked: false, answered_at: null, updated_at: now, is_deleted: false };
      data.quiz_exam_answers.push(answer);
    }
    answer.is_marked = value == null ? !answer.is_marked : Boolean(value);
    answer.updated_at = now;
    refreshSessionProgress(data, session, now);
    return answer;
  }

  function refreshSessionProgress(data, session, now) {
    var answers = data.quiz_exam_answers.filter(function (answer) { return answer.exam_id === session.exam_id && !answer.is_deleted; });
    session.answered_count = answers.filter(function (answer) { return answer.is_answered; }).length;
    session.marked_count = answers.filter(function (answer) { return answer.is_marked; }).length;
    session.elapsed_seconds = elapsedSeconds(session, now);
    session.updated_at = now;
    return session;
  }

  function getExamProgress(data, examId, now) {
    var session = findSession(data, examId);
    if (!session) return null;
    refreshSessionProgress(data, session, now || QuizData.nowIso());
    var answers = session.question_ids.map(function (questionId, index) {
      var answer = findAnswer(data, examId, questionId);
      return { index: index, questionId: questionId, answered: Boolean(answer && answer.is_answered), marked: Boolean(answer && answer.is_marked), selectedKeys: answer ? answer.selected_keys : [] };
    });
    return { session: session, answers: answers, answeredCount: session.answered_count, markedCount: session.marked_count, unansweredCount: session.total_count - session.answered_count, elapsedSeconds: session.elapsed_seconds, remainingSeconds: session.duration_seconds ? Math.max(0, session.duration_seconds - session.elapsed_seconds) : null };
  }

  function buildResult(data, session, now) {
    var answers = session.question_ids.map(function (questionId) { return findAnswer(data, session.exam_id, questionId); });
    var answered = answers.filter(function (answer) { return answer && answer.is_answered; });
    var correct = answered.filter(function (answer) { return answer.is_correct; }).length;
    var wrong = answered.length - correct;
    var result = {
      client_id: QuizData.newId('exam-result'), exam_id: session.exam_id, workspace_id: currentWorkspace(data),
      total_score: session.total_count ? Math.round(correct / session.total_count * 100) : 0,
      total_count: session.total_count, correct_count: correct, wrong_count: wrong,
      unanswered_count: session.total_count - answered.length, accuracy: session.total_count ? correct / session.total_count : 0,
      elapsed_seconds: session.elapsed_seconds, marked_count: session.marked_count,
      category_stats: QuizStats.getCategoryStats(data, session.exam_id),
      wrong_question_ids: answers.filter(function (answer) { return answer && answer.is_answered && !answer.is_correct; }).map(function (answer) { return answer.question_id; }),
      submitted_at: now, updated_at: now, is_deleted: false
    };
    return result;
  }

  function submitExam(data, examId, options) {
    data = QuizData.ensure(data);
    options = options || {};
    var session = findSession(data, examId);
    if (!session) throw new Error('考试不存在');
    if (session.status === 'submitted') return data.quiz_exam_results.find(function (result) { return result.exam_id === examId && !result.is_deleted; }) || null;
    if (session.status !== 'in_progress') throw new Error('考试已结束');
    var now = nowIso(options.now);
    refreshSessionProgress(data, session, now);
    session.status = 'submitted';
    session.submitted_at = now;
    session.elapsed_seconds = Math.min(session.duration_seconds || session.elapsed_seconds, session.elapsed_seconds);
    session.updated_at = now;
    var result = buildResult(data, session, now);
    data.quiz_exam_results.push(result);
    recordExamAttempts(data, session, now);
    return result;
  }

  function recordExamAttempts(data, session, now) {
    var existing = {};
    data.quiz_attempts.forEach(function (attempt) {
      if (!attempt.is_deleted && attempt.session_id === session.exam_id) existing[attempt.question_id] = true;
    });
    var created = 0;
    session.question_ids.forEach(function (questionId) {
      if (existing[questionId]) return;
      var version = QuizData.findVersion(data, questionId, session.question_versions[questionId]);
      if (!version) return;
      var answer = findAnswer(data, session.exam_id, questionId);
      QuizEngine.recordAttempt(data, {
        questionId: questionId,
        questionVersion: version.version,
        selectedKeys: answer ? answer.selected_keys : [],
        activeSeconds: 0,
        sessionId: session.exam_id,
        mode: 'exam',
        learningDate: session.learning_date || String(session.started_at || now).slice(0, 10),
        answeredAt: now
      });
      created += 1;
    });
    session.attempts_recorded_at = now;
    return created;
  }

  function resumeLatestExam(data) {
    data = QuizData.ensure(data);
    var inProgress = data.quiz_exam_sessions.filter(function (session) { return session.status === 'in_progress' && !session.is_deleted; }).sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
    return inProgress[0] || null;
  }

  function shouldAutoSubmit(session, now) {
    return Boolean(session && session.status === 'in_progress' && session.duration_seconds > 0 && elapsedSeconds(session, now) >= session.duration_seconds);
  }

  return {
    normalizeOptions: normalizeOptions, selectPaperQuestions: selectPaperQuestions,
    createExamSession: createExamSession, findSession: findSession, findAnswer: findAnswer,
    elapsedSeconds: elapsedSeconds, saveExamAnswer: saveExamAnswer, toggleExamMark: toggleExamMark,
    getExamProgress: getExamProgress, submitExam: submitExam, resumeLatestExam: resumeLatestExam,
    shouldAutoSubmit: shouldAutoSubmit
  };
});
