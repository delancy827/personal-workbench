(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./xingce-data.js'));
  else root.XingceImport = factory(root.XingceData);
})(typeof window !== 'undefined' ? window : globalThis, function (XingceData) {
  'use strict';

  var L1 = ['言语理解', '判断推理', '数量关系', '资料分析', '常识'];

  function text(v) { return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim(); }

  function normalizeQuestion(raw, bankId) {
    var type = raw.question_type === 'multiple_choice' || raw.type === 'multiple' ? 'multiple_choice' : 'single_choice';
    var options = [];
    if (Array.isArray(raw.options)) {
      options = raw.options.map(function (o) {
        return { key: text(o.key || o.id || '').toUpperCase(), text: text(o.text != null ? o.text : o) };
      }).filter(function (o) { return o.key && o.text; });
    } else if (raw.options && typeof raw.options === 'object') {
      options = Object.keys(raw.options).sort().map(function (k) {
        return { key: k.toUpperCase(), text: text(raw.options[k]) };
      });
    }
    var answer = raw.answer_keys || raw.correct_keys || raw.answer;
    var answerKeys = [];
    if (Array.isArray(answer)) answerKeys = answer.map(function (s) { return text(s).toUpperCase(); }).filter(Boolean);
    else if (typeof answer === 'string') {
      answerKeys = answer.split(/[,，\s、;；/|]+/).map(function (s) { return text(s).toUpperCase(); }).filter(Boolean);
    }
    var cat1 = text(raw.category_l1) || text(raw.section) || text(raw.category) || '常识';
    if (L1.indexOf(cat1) === -1) {
      // 常见别名
      if (/言语|选词|阅读/.test(cat1)) cat1 = '言语理解';
      else if (/判断|逻辑|图形|定义|类比/.test(cat1)) cat1 = '判断推理';
      else if (/数量|数学|运算/.test(cat1)) cat1 = '数量关系';
      else if (/资料|图表/.test(cat1)) cat1 = '资料分析';
      else cat1 = '常识';
    }
    var cat2 = text(raw.category_l2) || text(raw.skill) || text(raw.subcategory) || null;
    return {
      question_id: text(raw.question_id) || text(raw.sid) || text(raw.id) || XingceData.newId('xq'),
      bank_id: bankId,
      question_type: type,
      stem: text(raw.stem) || text(raw.question),
      options: options,
      answer_keys: answerKeys,
      explanation: text(raw.explanation) || text(raw.analysis) || null,
      category_l1: cat1,
      category_l2: cat2,
      tags: Array.isArray(raw.tags) ? raw.tags.map(text).filter(Boolean) : [],
      difficulty: text(raw.difficulty) || 'unknown',
      source: text(raw.source) || null,
      paper_id: text(raw.paper_id) || text(raw.paper) || null,
      status: 'active',
      created_at: XingceData.nowIso(),
      updated_at: XingceData.nowIso()
    };
  }

  function validateDocument(doc) {
    var errors = [];
    if (!doc || typeof doc !== 'object') return { valid: false, errors: ['不是有效 JSON 对象'] };
    if (doc.schema_version != null && Number(doc.schema_version) !== 1 && !Array.isArray(doc.questions) && !Array.isArray(doc)) {
      errors.push('schema_version 不支持');
    }
    var list = Array.isArray(doc) ? doc : doc.questions;
    if (!Array.isArray(list)) errors.push('缺少 questions 数组');
    else if (!list.length) errors.push('questions 为空');
    return { valid: !errors.length, errors: errors, list: list || [], bank: Array.isArray(doc) ? null : (doc.bank || null) };
  }

  function analyze(doc, data) {
    data = XingceData.ensure(data);
    var checked = validateDocument(doc);
    if (!checked.valid) return { valid: false, errors: checked.errors, items: [], summary: { total: 0, add: 0, update: 0, skip: 0, invalid: 0 } };
    var bankMeta = checked.bank || {};
    var bankId = text(bankMeta.bank_id) || 'xingce-imported';
    var existing = {};
    data.questions.forEach(function (q) { existing[q.question_id] = q; });
    var items = [];
    var summary = { total: 0, add: 0, update: 0, skip: 0, invalid: 0 };
    checked.list.forEach(function (raw) {
      summary.total += 1;
      var q = normalizeQuestion(raw, bankId);
      var bad = [];
      if (!q.stem) bad.push('缺题干');
      if (q.options.length < 2) bad.push('选项不足');
      if (!q.answer_keys.length) bad.push('缺答案');
      q.answer_keys.forEach(function (k) {
        if (!q.options.some(function (o) { return o.key === k; })) bad.push('答案不在选项中:' + k);
      });
      if (q.question_type === 'single_choice' && q.answer_keys.length !== 1) bad.push('单选答案数量错误');
      if (q.question_type === 'multiple_choice' && q.answer_keys.length < 2) bad.push('多选答案不足');
      if (bad.length) {
        summary.invalid += 1;
        items.push({ action: 'invalid', question: q, message: bad.join('；') });
        return;
      }
      var old = existing[q.question_id];
      if (!old) {
        summary.add += 1;
        items.push({ action: 'add', question: q, message: '新增' });
      } else if (JSON.stringify([old.stem, old.options, old.answer_keys]) !== JSON.stringify([q.stem, q.options, q.answer_keys])) {
        summary.update += 1;
        items.push({ action: 'update', question: q, message: '内容有变，将更新版本' });
      } else {
        summary.skip += 1;
        items.push({ action: 'skip', question: q, message: '已存在且相同' });
      }
    });
    return {
      valid: summary.add + summary.update > 0 || summary.skip === summary.total,
      errors: [],
      items: items,
      summary: summary,
      bank: {
        bank_id: bankId,
        name: text(bankMeta.name) || '行测题库',
        version: text(bankMeta.version) || '1.0',
        description: text(bankMeta.description) || null
      }
    };
  }

  function apply(doc, data, analysis) {
    data = XingceData.ensure(data);
    analysis = analysis || analyze(doc, data);
    if (!analysis.valid) throw new Error((analysis.errors || []).join('；') || '导入分析未通过');
    var now = XingceData.nowIso();
    var bankId = analysis.bank.bank_id;
    var bank = data.banks.find(function (b) { return b.bank_id === bankId && !b.is_deleted; });
    if (!bank) {
      bank = {
        bank_id: bankId,
        name: analysis.bank.name,
        version: analysis.bank.version,
        description: analysis.bank.description,
        question_count: 0,
        created_at: now,
        updated_at: now,
        is_deleted: false
      };
      data.banks.push(bank);
    } else {
      bank.name = analysis.bank.name;
      bank.version = analysis.bank.version;
      bank.updated_at = now;
    }
    analysis.items.forEach(function (item) {
      if (item.action !== 'add' && item.action !== 'update') return;
      var q = item.question;
      var idx = data.questions.findIndex(function (x) { return x.question_id === q.question_id; });
      if (idx >= 0) data.questions[idx] = q;
      else data.questions.push(q);
    });
    bank.question_count = data.questions.filter(function (q) {
      return !q.is_deleted && q.bank_id === bankId && q.status === 'active';
    }).length;
    bank.updated_at = now;
    return { data: data, analysis: analysis, summary: analysis.summary };
  }

  return {
    L1: L1,
    normalizeQuestion: normalizeQuestion,
    validateDocument: validateDocument,
    analyze: analyze,
    apply: apply
  };
});
