const assert = require('node:assert/strict');
const QuizData = require('./quiz-data.js');
const QuizEngine = require('./quiz-engine.js');

const now = '2026-09-24T12:00:00.000Z';
const data = QuizData.ensure({
  quiz_questions: [
    { question_id: 'new', status: 'active', is_deleted: false },
    { question_id: 'old', status: 'active', is_deleted: false },
    { question_id: 'recent', status: 'active', is_deleted: false },
    { question_id: 'twice', status: 'active', is_deleted: false }
  ],
  quiz_question_states: [
    { question_id: 'old', attempt_count: 1, last_attempt_at: '2026-09-01T00:00:00.000Z' },
    { question_id: 'recent', attempt_count: 1, last_attempt_at: '2026-09-23T00:00:00.000Z' },
    { question_id: 'twice', attempt_count: 2, last_attempt_at: '2026-09-10T00:00:00.000Z' }
  ]
});

const selected = QuizEngine.selectQuestions(data, { mode: 'random', limit: 4, now: Date.parse(now), random: () => 0.5 });
assert.deepEqual(selected.map((question) => question.question_id), ['new', 'old', 'recent', 'twice']);

const limited = QuizEngine.selectQuestions(data, { mode: 'random', limit: 2, now: Date.parse(now), random: () => 0.5 });
assert.deepEqual(limited.map((question) => question.question_id), ['new', 'old']);

console.log('Quiz selection tests passed');
