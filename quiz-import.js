(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./quiz-data.js'));
  else root.QuizImport = factory(root.QuizData);
})(typeof window !== 'undefined' ? window : globalThis, function (QuizData) {
  'use strict';

  var TYPES = ['single_choice', 'multiple_choice'];
  var DIFFICULTIES = ['easy', 'medium', 'hard', 'unknown'];
  var IMPORTANCE = ['low', 'normal', 'high', 'critical'];
  var STATUSES = ['active', 'inactive', 'needs_review'];

  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function iso(value) { return typeof value === 'string' && !isNaN(new Date(value).getTime()); }
  function normalizeText(value) {
    return text(value).replace(/[\u3000\s]+/g, ' ').replace(/[，。；：！？（）【】]/g, function (mark) {
      return { '，': ',', '。': '.', '；': ';', '：': ':', '！': '!', '？': '?', '（': '(', '）': ')', '【': '[', '】': ']' }[mark];
    }).toLowerCase();
  }
  function keys(options) { return options.map(function (option) { return option.key; }).sort(); }
  function fingerprint(question) {
    var optionText = (question.options || []).slice().sort(function (a, b) { return a.key.localeCompare(b.key); })
      .map(function (option) { return option.key + ':' + normalizeText(option.text); }).join('|');
    var answerText = Array.isArray(question.correct_keys) ? question.correct_keys.map(function (key) { return text(key).toUpperCase(); }).sort().join(',') : '';
    return String(question.question_type || '') + '||' + normalizeText(question.stem) + '||' + optionText + '||' + answerText;
  }
  function result(action, question, message, existing) {
    return { action: action, question_id: question && question.question_id, message: message || '', existing: existing || null, question: question || null };
  }

  function validateQuestion(question, index) {
    var errors = [];
    question = question && typeof question === 'object' ? question : {};
    if (!text(question.question_id)) errors.push('缺少 question_id');
    if (!text(question.version)) errors.push('缺少 version');
    if (!TYPES.includes(question.question_type)) errors.push('question_type 无效');
    if (!text(question.stem)) errors.push('题干不能为空');
    if (!Array.isArray(question.options) || question.options.length < 2) errors.push('至少需要 2 个选项');
    var seen = {};
    if (Array.isArray(question.options)) question.options.forEach(function (option) {
      if (!/^[A-Z]$/.test(text(option && option.key))) errors.push('选项 key 必须是 A-Z');
      if (seen[option.key]) errors.push('选项 key 重复: ' + option.key);
      seen[option.key] = true;
      if (!text(option && option.text)) errors.push('选项文本不能为空');
    });
    if (!Array.isArray(question.correct_keys) || !question.correct_keys.length) errors.push('correct_keys 不能为空');
    var optionKeys = Array.isArray(question.options) ? keys(question.options) : [];
    var answerKeys = Array.isArray(question.correct_keys) ? question.correct_keys.map(function (key) { return text(key).toUpperCase(); }) : [];
    if (new Set(answerKeys).size !== answerKeys.length) errors.push('correct_keys 不能重复');
    answerKeys.forEach(function (key) { if (optionKeys.indexOf(key) === -1) errors.push('答案不存在于选项: ' + key); });
    if (question.question_type === 'single_choice' && answerKeys.length !== 1) errors.push('单选题必须有且只有一个答案');
    if (question.question_type === 'multiple_choice' && answerKeys.length < 2) errors.push('多选题至少需要两个答案');
    if (!text(question.category_l1)) errors.push('缺少一级分类');
    if (question.difficulty != null && !DIFFICULTIES.includes(question.difficulty)) errors.push('difficulty 无效');
    if (question.importance != null && !IMPORTANCE.includes(question.importance)) errors.push('importance 无效');
    if (question.status != null && !STATUSES.includes(question.status)) errors.push('status 无效');
    if (question.created_at != null && !iso(question.created_at)) errors.push('created_at 无效');
    if (question.updated_at != null && !iso(question.updated_at)) errors.push('updated_at 无效');
    if (question.source_year != null && (!Number.isInteger(question.source_year) || question.source_year < 1900 || question.source_year > 2200)) errors.push('source_year 无效');
    return { valid: errors.length === 0, errors: errors, index: index, question: question };
  }

  function validateDocument(document) {
    var errors = [];
    if (!document || typeof document !== 'object' || Array.isArray(document)) return { valid: false, errors: ['顶层必须是对象'], questions: [] };
    if (document.schema_version !== 1) errors.push('schema_version 必须为 1');
    if (!document.bank || typeof document.bank !== 'object') errors.push('缺少 bank');
    else {
      if (!text(document.bank.bank_id)) errors.push('缺少 bank.bank_id');
      if (!text(document.bank.name)) errors.push('缺少 bank.name');
      if (!text(document.bank.version)) errors.push('缺少 bank.version');
    }
    if (!Array.isArray(document.questions)) errors.push('questions 必须是数组');
    var questions = Array.isArray(document.questions) ? document.questions : [];
    var ids = {};
    var details = questions.map(function (question, index) {
      var checked = validateQuestion(question, index);
      var id = text(question && question.question_id);
      if (id && ids[id]) checked.errors.push('本批次 question_id 重复');
      if (id) ids[id] = true;
      return checked;
    });
    details.forEach(function (item) { if (!item.valid) errors.push('第 ' + (item.index + 1) + ' 题：' + item.errors.join('、')); });
    return { valid: errors.length === 0, errors: errors, questions: details, bank: document.bank || null };
  }

  function makeVersion(question, bankId, now) {
    var version = {
      client_id: QuizData.newId('qversion'), question_id: question.question_id,
      version: text(question.version), stem: text(question.stem),
      options: question.options.map(function (option) { return { key: text(option.key).toUpperCase(), text: text(option.text) }; }),
      correct_keys: Array.from(new Set(question.correct_keys.map(function (key) { return text(key).toUpperCase(); }))).sort(),
      explanation: question.explanation == null ? null : text(question.explanation),
      source_snapshot: { bank_id: bankId, source: question.source || null, source_year: question.source_year || null, source_question_no: question.source_question_no || null },
      content_fingerprint: fingerprint(question), created_at: now, created_by: 'import', is_current: true, is_deleted: false,
      updated_at: now
    };
    return version;
  }

  function makeQuestion(question, bankId, now, version) {
    return {
      client_id: QuizData.newId('question'), question_id: question.question_id, bank_id: bankId,
      current_version: version.version, question_type: question.question_type,
      status: question.status || 'active', category_l1: text(question.category_l1), category_l2: text(question.category_l2) || null,
      tags: Array.isArray(question.tags) ? Array.from(new Set(question.tags.map(text).filter(Boolean))) : [],
      difficulty: DIFFICULTIES.includes(question.difficulty) ? question.difficulty : 'unknown',
      importance: IMPORTANCE.includes(question.importance) ? question.importance : 'normal',
      source: text(question.source) || null, source_year: question.source_year || null,
      source_question_no: text(question.source_question_no) || null, content_fingerprint: fingerprint(question),
      created_at: question.created_at || now, updated_at: now, is_deleted: false
    };
  }

  function analyze(document, data) {
    data = QuizData.ensure(data);
    var checked = validateDocument(document);
    var items = [];
    if (!document || typeof document !== 'object' || Array.isArray(document) ||
        document.schema_version !== 1 || !document.bank || typeof document.bank !== 'object' ||
        !text(document.bank.bank_id) || !text(document.bank.name) || !text(document.bank.version) ||
        !Array.isArray(document.questions)) {
      return { valid: false, errors: checked.errors, items: items, summary: summarize(items) };
    }
    checked.questions.forEach(function (item) {
      if (!item.valid) {
        items.push(result('invalid', item.question, item.errors.join('、')));
        return;
      }
      var question = item.question;
      var existing = QuizData.findQuestion(data, question.question_id);
      var exact = data.quiz_questions.find(function (candidate) { return !candidate.is_deleted && candidate.content_fingerprint === fingerprint(question); });
      if (!existing && exact) items.push(result('needs_review', question, '内容指纹与现有题目相同但 question_id 不同', exact));
      else if (!existing) items.push(result('add', question, '新增题目'));
      else {
        var oldVersion = QuizData.findVersion(data, existing.question_id, question.version);
        if (oldVersion && oldVersion.content_fingerprint === fingerprint(question)) items.push(result('skip', question, '相同版本内容已存在', existing));
        else if (oldVersion) items.push(result('needs_review', question, '相同版本号但内容不同', existing));
        else if (existing.content_fingerprint === fingerprint(question)) items.push(result('skip', question, '内容未变化', existing));
        else items.push(result('update', question, '将创建新题目版本', existing));
      }
    });
    var summary = summarize(items);
    return { valid: summary.add + summary.update + summary.skip + summary.needs_review > 0, errors: checked.errors, items: items, summary: summary, bank: document.bank };
  }

  function summarize(items) {
    return items.reduce(function (summary, item) {
      summary.total += 1;
      if (summary[item.action] != null) summary[item.action] += 1;
      return summary;
    }, { total: 0, add: 0, skip: 0, update: 0, needs_review: 0, invalid: 0 });
  }

  function apply(document, data, options) {
    data = QuizData.ensure(data);
    options = options || {};
    var analysis = options.analysis || analyze(document, data);
    if (!analysis.valid) throw new Error(analysis.errors.join('；'));
    var before = QuizData.clone(data);
    var now = options.now || QuizData.nowIso();
    var bank = data.quiz_banks.find(function (item) { return !item.is_deleted && item.bank_id === document.bank.bank_id; });
    if (!bank) {
      bank = { client_id: QuizData.newId('bank'), bank_id: document.bank.bank_id, name: text(document.bank.name), description: text(document.bank.description) || null, source: text(document.bank.source) || null, version: text(document.bank.version), status: 'active', question_count: 0, created_at: now, updated_at: now, is_deleted: false };
      data.quiz_banks.push(bank);
    } else {
      bank.name = text(document.bank.name) || bank.name;
      bank.description = text(document.bank.description) || bank.description;
      bank.source = text(document.bank.source) || bank.source;
      bank.version = text(document.bank.version) || bank.version;
      bank.updated_at = now;
    }
    var applied = 0;
    analysis.items.forEach(function (item) {
      if (item.action === 'skip' || item.action === 'needs_review' || item.action === 'invalid') return;
      var question = item.question;
      var existing = QuizData.findQuestion(data, question.question_id);
      var version = makeVersion(question, bank.bank_id, now);
      if (!existing) {
        existing = makeQuestion(question, bank.bank_id, now, version);
        data.quiz_questions.push(existing);
      } else {
        existing.bank_id = bank.bank_id;
        existing.current_version = version.version;
        existing.question_type = question.question_type;
        existing.status = question.status || 'active';
        existing.category_l1 = text(question.category_l1);
        existing.category_l2 = text(question.category_l2) || null;
        existing.tags = Array.isArray(question.tags) ? Array.from(new Set(question.tags.map(text).filter(Boolean))) : [];
        existing.difficulty = DIFFICULTIES.includes(question.difficulty) ? question.difficulty : 'unknown';
        existing.importance = IMPORTANCE.includes(question.importance) ? question.importance : 'normal';
        existing.source = text(question.source) || null;
        existing.source_year = question.source_year || null;
        existing.source_question_no = text(question.source_question_no) || null;
        existing.content_fingerprint = fingerprint(question);
        existing.updated_at = now;
      }
      data.quiz_question_versions.forEach(function (old) {
        if (old.question_id === existing.question_id) old.is_current = false;
      });
      data.quiz_question_versions.push(version);
      applied += 1;
    });
    bank.question_count = data.quiz_questions.filter(function (question) { return !question.is_deleted && question.bank_id === bank.bank_id; }).length;
    var batch = {
      client_id: QuizData.newId('import'), batch_id: QuizData.newId('import'), file_name: options.fileName || null,
      schema_version: document.schema_version, bank_id: bank.bank_id, bank_version: bank.version,
      status: 'applied', created_at: now, confirmed_at: now, completed_at: now,
      summary: Object.assign({}, analysis.summary, { applied: applied }), is_deleted: false, updated_at: now
    };
    data.quiz_import_batches.push(batch);
    return { data: data, before: before, batch: batch, analysis: analysis };
  }

  return {
    fingerprint: fingerprint,
    validateQuestion: validateQuestion,
    validateDocument: validateDocument,
    analyze: analyze,
    summarize: summarize,
    apply: apply
  };
});
