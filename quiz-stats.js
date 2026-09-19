(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./quiz-data.js'), require('./quiz-engine.js'));
  else root.QuizStats = factory(root.QuizData, root.QuizEngine);
})(typeof window !== 'undefined' ? window : globalThis, function (QuizData, QuizEngine) {
  'use strict';

  function activeAttempts(data, examId) {
    return QuizData.ensure(data).quiz_exam_answers.filter(function (answer) {
      return !answer.is_deleted && (!examId || answer.exam_id === examId);
    });
  }

  function getExamSummary(data, examId) {
    data = QuizData.ensure(data);
    var session = data.quiz_exam_sessions.find(function (item) { return item.exam_id === examId && !item.is_deleted; });
    var result = data.quiz_exam_results.find(function (item) { return item.exam_id === examId && !item.is_deleted; });
    var answers = activeAttempts(data, examId);
    var answered = answers.filter(function (answer) { return answer.is_answered; });
    var correct = answered.filter(function (answer) { return answer.is_correct; }).length;
    var total = session ? session.total_count : answers.length;
    return {
      examId: examId, session: session || null, result: result || null,
      total: total, answered: answered.length, unanswered: Math.max(0, total - answered.length),
      correct: result ? result.correct_count : correct,
      wrong: result ? result.wrong_count : Math.max(0, answered.length - correct),
      accuracy: result ? result.accuracy : (answered.length ? correct / answered.length : 0),
      marked: answers.filter(function (answer) { return answer.is_marked; }).length,
      elapsedSeconds: result ? result.elapsed_seconds : (session ? session.elapsed_seconds : 0)
    };
  }

  function getCategoryStats(data, examId) {
    data = QuizData.ensure(data);
    var answers = activeAttempts(data, examId).filter(function (answer) { return answer.is_answered; });
    var buckets = {};
    answers.forEach(function (answer) {
      var question = QuizData.findQuestion(data, answer.question_id);
      var key = question && question.category_l1 || '未分类';
      if (!buckets[key]) buckets[key] = { category_l1: key, total: 0, correct: 0, accuracy: 0 };
      buckets[key].total += 1;
      if (answer.is_correct) buckets[key].correct += 1;
    });
    return Object.keys(buckets).sort().map(function (key) {
      var item = buckets[key];
      item.accuracy = item.total ? item.correct / item.total : 0;
      return item;
    });
  }

  function getQuestionStats(data, questionId) {
    data = QuizData.ensure(data);
    var attempts = data.quiz_attempts.filter(function (attempt) { return !attempt.is_deleted && attempt.question_id === questionId; });
    var correct = attempts.filter(function (attempt) { return attempt.is_correct; }).length;
    var state = QuizData.findState(data, questionId);
    return {
      questionId: questionId, attempts: attempts.length, correct: correct,
      wrong: attempts.length - correct, accuracy: attempts.length ? correct / attempts.length : 0,
      wrongActive: Boolean(state && state.wrong_active), favorite: Boolean(state && state.favorite)
    };
  }

  function getTodayQuizStats(data, learningDate) {
    return QuizEngine.stats(data, learningDate);
  }

  function getWrongQuestions(data) {
    data = QuizData.ensure(data);
    return QuizData.activeQuestions(data).filter(function (question) {
      var state = QuizData.findState(data, question.question_id);
      return state && state.wrong_active;
    });
  }

  function getFavoriteQuestions(data) {
    data = QuizData.ensure(data);
    return QuizData.activeQuestions(data).filter(function (question) {
      var state = QuizData.findState(data, question.question_id);
      return state && state.favorite;
    });
  }

  return {
    getExamSummary: getExamSummary,
    getCategoryStats: getCategoryStats,
    getQuestionStats: getQuestionStats,
    getTodayQuizStats: getTodayQuizStats,
    getWrongQuestions: getWrongQuestions,
    getFavoriteQuestions: getFavoriteQuestions
  };
});
