(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./gist-api.js'), require('./quiz-data.js'), require('./quiz-import.js'));
  } else {
    root.QuizRemote = factory({ GistClient: GistClient }, root.QuizData, root.QuizImport);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (GistApi, QuizData, QuizImport) {
  'use strict';

  var FILENAME = 'quiz_bank.json';
  var DEFAULT_SOURCES = [
    {
      provider: 'github_gist', gist_id: '9baacee6a3ec7c24447b16cc65cdb773', filename: FILENAME,
      owner: 'delancy827', raw_url: 'https://gist.githubusercontent.com/delancy827/9baacee6a3ec7c24447b16cc65cdb773/raw/quiz_bank.json',
      bank_id: 'sixiang-suzhi-formal', name: '思想素质综合正式库'
    },
    {
      provider: 'github_gist', gist_id: '0f4c82a85bc8444506dea19584319e2e', filename: FILENAME,
      owner: 'delancy827', raw_url: 'https://gist.githubusercontent.com/delancy827/0f4c82a85bc8444506dea19584319e2e/raw/quiz_bank.json',
      bank_id: 'sinopec-sixiang-suzhi-web', name: '中国石化思想素质网络增补库'
    }
  ];

  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function sourceKey(source) { return text(source.bank_id) || text(source.gist_id); }
  function validSource(source) {
    return source && source.provider === 'github_gist' && /^[A-Za-z0-9]+$/.test(text(source.gist_id));
  }

  function getSources(settings) {
    var saved = settings && Array.isArray(settings.quiz_remote_sources) ? settings.quiz_remote_sources : [];
    var sources = saved.length ? saved : DEFAULT_SOURCES;
    return sources.filter(validSource).map(function (source) {
      return Object.assign({ filename: FILENAME }, clone(source), { key: sourceKey(source) });
    });
  }

  function sourceWithForm(source, gistId, name) {
    return Object.assign({}, source, {
      gist_id: text(gistId) || text(source && source.gist_id),
      name: text(name) || text(source && source.name),
      filename: FILENAME
    });
  }

  function clientFor(token, source) {
    if (!validSource(source)) throw new Error('题库源的 Gist ID 无效');
    return new GistApi.GistClient(token || '', source.gist_id, source.filename || FILENAME);
  }

  function rawUrlFor(source) {
    if (text(source.raw_url)) return source.raw_url;
    if (!text(source.owner)) return '';
    return 'https://gist.githubusercontent.com/' + source.owner + '/' + source.gist_id + '/raw/' + (source.filename || FILENAME);
  }

  async function fetchSource(token, source, data) {
    var client = clientFor(token, source);
    var remote;
    try {
      remote = token ? await client.download() : await client.downloadRaw(rawUrlFor(source));
    } catch (apiError) {
      var rawUrl = rawUrlFor(source);
      if (!rawUrl) throw apiError;
      remote = await client.downloadRaw(rawUrl);
    }
    var checked = QuizImport.validateDocument(remote.data);
    if (!checked.valid) throw new Error('远程题库格式错误：' + checked.errors.slice(0, 4).join('；'));
    if (!remote.data.questions.length) throw new Error('远程题库没有可导入题目');
    if (source.bank_id && remote.data.bank.bank_id !== source.bank_id) {
      throw new Error('远程题库 ID 不匹配：期望 ' + source.bank_id + '，实际 ' + remote.data.bank.bank_id);
    }
    var analysis = QuizImport.analyze(remote.data, data);
    return {
      source: clone(source), document: remote.data, analysis: analysis,
      gist_updated_at: remote.gist_updated_at, gist_history_count: remote.gist_history_count
    };
  }

  function applyFetched(fetched, data, options) {
    if (!fetched || !fetched.document) throw new Error('没有待确认的远程题库');
    options = options || {};
    var analysis = QuizImport.analyze(fetched.document, data);
    if (!analysis.valid) throw new Error(analysis.errors.join('；') || '远程题库没有可合并内容');
    var applied = QuizImport.apply(fetched.document, data, {
      analysis: analysis, fileName: fetched.source && fetched.source.filename || FILENAME,
      now: options.now
    });
    var settings = applied.data.settings && typeof applied.data.settings === 'object' ? applied.data.settings : {};
    var sources = getSources(settings);
    var source = fetched.source || {};
    var key = sourceKey(source);
    var saved = sources.find(function (item) { return sourceKey(item) === key; });
    var next = Object.assign({}, saved || source, {
      provider: 'github_gist', gist_id: source.gist_id, filename: source.filename || FILENAME,
      bank_id: fetched.document.bank.bank_id, name: fetched.document.bank.name,
      last_remote_version: fetched.document.bank.version,
      last_fetched_at: options.now || QuizData.nowIso(),
      last_gist_updated_at: fetched.gist_updated_at || null
    });
    if (saved) sources[sources.indexOf(saved)] = next;
    else sources.push(next);
    applied.data.settings = Object.assign({}, settings, {
      quiz_remote_sources: sources.map(function (item) {
        var result = clone(item); delete result.key; return result;
      }), updated_at: options.now || QuizData.nowIso()
    });
    return Object.assign(applied, { fetched: fetched, analysis: analysis });
  }

  function exportBank(data, bankId, now) {
    data = QuizData.ensure(data);
    now = now || QuizData.nowIso();
    var bank = data.quiz_banks.find(function (item) { return !item.is_deleted && item.bank_id === bankId; });
    if (!bank) throw new Error('本地没有找到题库：' + bankId);
    var questions = data.quiz_questions.filter(function (question) {
      return !question.is_deleted && question.bank_id === bankId && question.status === 'active';
    }).map(function (question) {
      var version = QuizData.currentVersion(data, question);
      if (!version) throw new Error('题目缺少当前版本：' + question.question_id);
      return {
        question_id: question.question_id, version: question.current_version,
        question_type: question.question_type, stem: version.stem, options: clone(version.options),
        correct_keys: clone(version.correct_keys), explanation: version.explanation,
        category_l1: question.category_l1, category_l2: question.category_l2, tags: clone(question.tags || []),
        difficulty: question.difficulty, importance: question.importance, source: question.source,
        source_year: question.source_year, source_question_no: question.source_question_no,
        status: 'active', created_at: question.created_at || now, updated_at: question.updated_at || now
      };
    });
    var document = {
      schema_version: 1, exported_at: now,
      bank: { bank_id: bank.bank_id, name: bank.name, version: bank.version || '1.0',
        description: bank.description, source: bank.source, language: 'zh-CN' }, questions: questions
    };
    var checked = QuizImport.validateDocument(document);
    if (!checked.valid) throw new Error('本地题库无法发布：' + checked.errors.slice(0, 4).join('；'));
    return document;
  }

  async function publishSource(token, source, data) {
    if (!token) throw new Error('发布题库需要 GitHub Token');
    var document = exportBank(data, source.bank_id);
    var client;
    var result;
    if (text(source.gist_id)) {
      client = clientFor(token, source);
      result = await client.upload(document);
    } else {
      client = new GistApi.GistClient(token, null, source.filename || FILENAME);
      var gistId = await client.createGist({
        description: '个人工作台题库｜' + (source.name || document.bank.name) + '｜Secret Gist',
        content: JSON.stringify(document, null, 2)
      });
      result = { success: true, gist_id: gistId, html_url: null, gist_updated_at: null };
    }
    return { document: document, result: result, source: Object.assign({}, clone(source), { gist_id: client.gistId }) };
  }

  return {
    FILENAME: FILENAME, DEFAULT_SOURCES: clone(DEFAULT_SOURCES), sourceKey: sourceKey,
    getSources: getSources, sourceWithForm: sourceWithForm, fetchSource: fetchSource,
    applyFetched: applyFetched, exportBank: exportBank, publishSource: publishSource
  };
});
