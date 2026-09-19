/**
 * 远程题库 Gist 回归测试
 * 运行: node test-quiz-remote.js
 */

const { GistClient } = require('./gist-api.js');
const QuizData = require('./quiz-data.js');
const QuizEngine = require('./quiz-engine.js');
const QuizImport = require('./quiz-import.js');
const QuizRemote = require('./quiz-remote.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed += 1; console.log('  [PASS] ' + message); }
  else { failed += 1; console.log('  [FAIL] ' + message); }
}

const remoteSource = {
  provider: 'github_gist', gist_id: 'remotegist', filename: 'quiz_bank.json',
  bank_id: 'remote-bank', name: '远程演示题库'
};
const remoteDocument = {
  schema_version: 1,
  exported_at: '2026-09-19T00:00:00.000Z',
  bank: { bank_id: 'remote-bank', name: '远程演示题库', version: '1.0' },
  questions: [{
    question_id: 'remote-q1', version: '1.0', question_type: 'single_choice', stem: '远程题',
    options: [{ key: 'A', text: '正确' }, { key: 'B', text: '错误' }],
    correct_keys: ['A'], category_l1: '远程', status: 'active'
  }]
};
const remoteData = QuizData.ensure({
  legacy_remote_field: 'kept',
  quiz_attempts: [{ client_id: 'existing-attempt', updated_at: '2026-09-19T00:00:00Z' }],
  settings: { user_setting: true }
});

let mockedDocument = remoteDocument;
const originalFetch = global.fetch;

async function run() {
  console.log('\n=== Test: remote quiz bank ===');
  assert(QuizRemote.FILENAME === 'quiz_bank.json', '远程题库使用独立文件名');
  const defaultSources = QuizRemote.getSources({});
  assert(defaultSources.length === 3, '默认配置包含三个已发布题库源');
  assert(defaultSources[0].bank_id === 'sinopec-sixiang-suzhi-20260919', '新清洗库排在默认题库源首位');
  assert(defaultSources.every((source) => /^[A-Za-z0-9]+$/.test(source.gist_id)), '默认题库源 Gist ID 合法');
  const partialSaved = QuizRemote.getSources({
    quiz_remote_sources: [{
      provider: 'github_gist', gist_id: '9baacee6a3ec7c24447b16cc65cdb773',
      bank_id: 'sixiang-suzhi-formal', name: '思想素质综合正式库'
    }]
  });
  assert(partialSaved.some((s) => s.bank_id === 'sinopec-sixiang-suzhi-20260919'), '旧 settings 不会丢掉新清洗库远程源');
  assert(partialSaved[0].bank_id === 'sinopec-sixiang-suzhi-20260919', '合并后新清洗库仍排在首位');
  assert(new GistClient('token', 'gist', 'quiz_bank.json').filename === 'quiz_bank.json', 'Gist 客户端支持自定义文件名');

  global.fetch = async function (url) {
    assert(url === 'https://api.github.com/gists/remotegist', '抓取请求访问指定题库 Gist');
    return {
      status: 200, ok: true,
      json: async function () {
        return { updated_at: '2026-09-19T01:00:00Z', history: [], files: {
          'quiz_bank.json': { content: JSON.stringify(mockedDocument), truncated: false }
        } };
      }
    };
  };

  const beforeFetch = JSON.stringify(QuizData.clone(remoteData));
  const fetched = await QuizRemote.fetchSource('token', remoteSource, remoteData);
  assert(fetched.analysis.summary.add === 1, '远程题库抓取后识别新增题目');
  assert(JSON.stringify(remoteData) === beforeFetch, '仅抓取预览不会修改本地数据');

  mockedDocument = Object.assign({}, remoteDocument, { schema_version: 99 });
  let invalidFailed = false;
  try { await QuizRemote.fetchSource('token', remoteSource, remoteData); }
  catch (error) { invalidFailed = true; }
  assert(invalidFailed, '远程格式错误会阻止抓取');
  assert(JSON.stringify(remoteData) === beforeFetch, '远程格式错误不会修改本地数据');

  mockedDocument = Object.assign({}, remoteDocument, { bank: { bank_id: 'wrong-bank', name: '错误题库', version: '1.0' } });
  let mismatchFailed = false;
  try { await QuizRemote.fetchSource('token', remoteSource, remoteData); }
  catch (error) { mismatchFailed = true; }
  assert(mismatchFailed, '题库 ID 不匹配会阻止抓取');
  mockedDocument = remoteDocument;

  const applied = QuizRemote.applyFetched(fetched, remoteData, { now: '2026-09-19T02:00:00Z' });
  assert(applied.data.quiz_questions.length === 1, '确认后才写入远程题目');
  assert(applied.data.quiz_attempts.length === 1 && applied.data.quiz_attempts[0].client_id === 'existing-attempt', '合并题库不覆盖答题历史');
  assert(applied.data.settings.user_setting === true && Array.isArray(applied.data.settings.quiz_remote_sources), '合并题库保留设置并记录远程源');
  const repeatAnalysis = QuizImport.analyze(remoteDocument, applied.data);
  assert(repeatAnalysis.summary.skip === 1 && repeatAnalysis.summary.add === 0, '重复抓取会识别为跳过');

  const demoData = QuizData.ensure({});
  const demoDocument = {
    schema_version: 1, exported_at: '2026-09-19T00:00:00.000Z',
    bank: { bank_id: 'demo', name: '演示题库', version: '1.0' },
    questions: [{
      question_id: 'demo-q1', version: '1.0', question_type: 'single_choice', stem: '演示题',
      options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }], correct_keys: ['A'],
      category_l1: '测试', status: 'active'
    }]
  };
  const demoAnalysis = QuizImport.analyze(demoDocument, demoData);
  const imported = QuizImport.apply(demoDocument, demoData, { analysis: demoAnalysis }).data;
  QuizEngine.recordAttempt(imported, { questionId: 'demo-q1', selectedKeys: ['A'], activeSeconds: 3, learningDate: '2026-09-19' });
  const exported = QuizRemote.exportBank(imported, 'demo');
  assert(QuizImport.validateDocument(exported).valid, '本地题库发布前通过标准格式校验');
  assert(!Object.prototype.hasOwnProperty.call(exported, 'quiz_attempts'), '发布题库不包含个人答题集合');

  let uploadBody = null;
  global.fetch = async function (url, request) {
    uploadBody = JSON.parse(request.body);
    return { status: 200, ok: true, json: async function () {
      return { updated_at: '2026-09-19T03:00:00Z', html_url: 'https://gist.github.com/demo' };
    } };
  };
  await QuizRemote.publishSource('token', {
    provider: 'github_gist', gist_id: 'publishgist', filename: 'quiz_bank.json',
    bank_id: 'demo', name: '演示题库'
  }, imported);
  assert(Boolean(uploadBody && uploadBody.files && uploadBody.files['quiz_bank.json']), '发布只写入 quiz_bank.json');
  assert(!Object.prototype.hasOwnProperty.call(uploadBody.files, 'workbench_data.json'), '发布不会写入个人数据文件');
  assert(!uploadBody.files['quiz_bank.json'].content.includes('quiz_attempts'), '题库内容不包含答题历史');
}

run().then(function () {
  global.fetch = originalFetch;
  console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
  if (failed === 0) console.log('[OK] Remote quiz tests passed!');
  else process.exit(1);
}).catch(function (error) {
  global.fetch = originalFetch;
  console.error('[ERROR] Remote quiz tests failed:', error);
  process.exit(1);
});
