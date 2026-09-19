const QuizRemote = require('./quiz-remote.js');
const QuizData = require('./quiz-data.js');

(async () => {
  const source = QuizRemote.getSources({})[0];
  console.log('source: ' + source.name + ' / ' + source.gist_id);
  const empty = QuizData.ensure({});
  const fetched = await QuizRemote.fetchSource('', source, empty);
  console.log('fetched bank: ' + fetched.document.bank.name + ' v' + fetched.document.bank.version);
  console.log('questions: ' + fetched.document.questions.length);
  console.log('analysis: ' + JSON.stringify(fetched.analysis.summary));
  console.log('gist updated_at: ' + fetched.gist_updated_at);
  const applied = QuizRemote.applyFetched(fetched, empty);
  console.log('applied banks=' + applied.data.quiz_banks.length + ' questions=' + applied.data.quiz_questions.length + ' versions=' + applied.data.quiz_question_versions.length);
  console.log('saved sources=' + applied.data.settings.quiz_remote_sources.length + ' last version=' + applied.data.settings.quiz_remote_sources[0].last_remote_version);
  const personal = ['quiz_attempts', 'quiz_sessions', 'quiz_exam_answers', 'quiz_exam_sessions', 'quiz_exam_results', 'quiz_question_states'].filter((key) => applied.data[key].length);
  console.log('personal collections leaked: ' + (personal.length ? personal.join(',') : 'none'));
})().catch((error) => { console.error('VERIFY ERROR: ' + error.message); process.exit(1); });
