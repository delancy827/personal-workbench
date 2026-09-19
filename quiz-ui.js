(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./quiz-data.js'), require('./quiz-engine.js'), require('./quiz-import.js'), require('./quiz-remote.js'));
  else root.QuizUI = factory(root.QuizData, root.QuizEngine, root.QuizImport, root.QuizRemote);
})(typeof window !== 'undefined' ? window : globalThis, function (QuizData, QuizEngine, QuizImport, QuizRemote) {
  'use strict';

  var options = null;
  var state = { mode: 'sequential', session: null, index: 0, responses: {}, timer: null, timerIndex: null, configured: false, remoteSourceKey: null, remotePreview: null };

  function $(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function fmtSeconds(seconds) {
    seconds = Math.max(0, Math.round(Number(seconds) || 0));
    var minutes = Math.floor(seconds / 60);
    return minutes ? minutes + '分' + (seconds % 60 ? ' ' + (seconds % 60) + '秒' : '') : seconds + '秒';
  }
  function currentData() { return QuizData.ensure(options.loadData()); }
  function remoteSources(data) { return QuizRemote.getSources(data.settings || {}); }
  function selectedRemoteSource(data) {
    var sources = remoteSources(data);
    return sources.find(function (source) { return sourceKey(source) === state.remoteSourceKey; }) || sources[0] || null;
  }
  function sourceKey(source) { return QuizRemote.sourceKey(source); }
  function currentQuestion(data) {
    if (!state.session) return null;
    var questionId = state.session.question_ids[state.index];
    var question = QuizData.findQuestion(data, questionId);
    if (!question) return null;
    var version = QuizData.findVersion(data, questionId, state.session.question_versions[questionId] || question.current_version);
    return { question: question, version: version };
  }
  function selectedKeys() {
    return Array.from(document.querySelectorAll('#quizOptions input:checked')).map(function (input) { return input.value; });
  }
  function stopTimer() { if (state.timer) { state.timer.pause(); state.timer = null; } state.timerIndex = null; }
  function startTimer() {
    stopTimer();
    state.timer = QuizEngine.createActiveTimer({ idleMs: 60000, maxSegmentMs: 300000 });
    state.timerIndex = state.index;
  }
  function isSubmitted() { return Boolean(state.responses[state.index] && state.responses[state.index].submitted); }
  function setMessage(message, type) {
    var el = $('quizMessage');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'quiz-message' + (type ? ' ' + type : '');
  }
  function renderStats(data) {
    var today = options.learningDateStr ? options.learningDateStr(new Date()) : new Date().toISOString().slice(0, 10);
    var todayStats = QuizEngine.stats(data, today);
    var allStats = QuizEngine.stats(data);
    $('quizTodayAttempts').textContent = todayStats.attempts;
    $('quizTodayAccuracy').textContent = Math.round(todayStats.accuracy * 100) + '%';
    $('quizTodayTime').textContent = fmtSeconds(todayStats.activeSeconds);
    $('quizWrongCount').textContent = allStats.currentWrong;
    $('quizAllAttempts').textContent = allStats.attempts;
    $('quizAllAccuracy').textContent = Math.round(allStats.accuracy * 100) + '%';
    $('quizBankCount').textContent = data.quiz_banks.filter(function (bank) { return !bank.is_deleted; }).length;
    $('quizQuestionCount').textContent = QuizData.activeQuestions(data).length;
  }
  function renderBanks(data) {
    var banks = data.quiz_banks.filter(function (bank) { return !bank.is_deleted; });
    $('quizBankList').innerHTML = banks.length ? banks.map(function (bank) {
      var count = data.quiz_questions.filter(function (question) { return !question.is_deleted && question.bank_id === bank.bank_id && question.status === 'active'; }).length;
      return '<div class="quiz-bank-row"><div><b>' + esc(bank.name) + '</b><small>' + esc(bank.version || '') + '</small></div><span>' + count + ' 题</span></div>';
    }).join('') : '<div class="empty"><span class="emoji">📚</span>还没有题库，先导入标准 JSON</div>';
  }
  function renderRemoteSources(data) {
    var select = $('quizRemoteSource');
    if (!select) return;
    var sources = remoteSources(data);
    if (!sources.length) {
      select.innerHTML = '<option value="">没有可用题库源</option>';
      $('quizRemoteSourceMeta').textContent = '请先配置题库 Gist ID';
      return;
    }
    if (!state.remoteSourceKey || !sources.some(function (source) { return sourceKey(source) === state.remoteSourceKey; })) {
      state.remoteSourceKey = sourceKey(sources[0]);
    }
    select.innerHTML = sources.map(function (source) {
      return '<option value="' + esc(sourceKey(source)) + '">' + esc(source.name || source.bank_id || source.gist_id) + '</option>';
    }).join('');
    select.value = state.remoteSourceKey;
    var source = selectedRemoteSource(data);
    $('quizRemoteSourceMeta').textContent = source
      ? 'Gist ' + source.gist_id + (source.last_remote_version ? ' · 上次版本 ' + source.last_remote_version : '')
      : '未配置题库源';
  }
  function renderRemoteReport() {
    var report = $('quizRemoteReport');
    var confirm = $('quizRemoteConfirm');
    var cancel = $('quizRemoteCancel');
    if (!report || !confirm || !cancel) return;
    var preview = state.remotePreview;
    if (!preview) {
      report.style.display = 'none';
      confirm.style.display = 'none';
      cancel.style.display = 'none';
      return;
    }
    var summary = preview.analysis.summary;
    report.style.display = '';
    report.innerHTML = '<b>' + esc(preview.document.bank.name) + '</b>' +
      '<span class="quiz-remote-version">版本 ' + esc(preview.document.bank.version) + ' · ' + preview.document.questions.length + ' 题</span>' +
      '<div class="quiz-report-grid"><span>新增 ' + summary.add + '</span><span>更新 ' + summary.update + '</span>' +
      '<span>跳过 ' + summary.skip + '</span><span>待确认 ' + summary.needs_review + '</span></div>' +
      (preview.analysis.errors.length ? '<p class="quiz-error">' + esc(preview.analysis.errors.join('；')) + '</p>' : '') +
      (summary.needs_review ? '<p class="quiz-error">存在重复或版本冲突，待确认题目不会自动合并。</p>' : '') +
      (preview.gist_updated_at ? '<small>远程更新时间：' + esc(preview.gist_updated_at) + '</small>' : '');
    confirm.style.display = preview.analysis.valid && summary.add + summary.update > 0 ? '' : 'none';
    cancel.style.display = '';
  }
  function setRemoteMessage(message, type) {
    var report = $('quizRemoteReport');
    if (!report) return;
    state.remotePreview = null;
    report.style.display = '';
    report.innerHTML = '<span class="quiz-remote-message ' + (type || '') + '">' + esc(message) + '</span>';
    $('quizRemoteConfirm').style.display = 'none';
    $('quizRemoteCancel').style.display = 'none';
  }
  async function fetchRemoteBank() {
    var data = currentData();
    var source = selectedRemoteSource(data);
    var token = options.getRemoteToken ? options.getRemoteToken() : '';
    if (!source) { options.toast('没有配置远程题库源', 'error'); return; }
    var button = $('quizRemoteFetch');
    button.disabled = true;
    button.classList.add('loading');
    try {
      state.remotePreview = await QuizRemote.fetchSource(token, source, data);
      renderRemoteReport();
    } catch (error) {
      setRemoteMessage('抓取失败：' + error.message, 'error');
    } finally {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
  function cancelRemotePreview() { state.remotePreview = null; renderRemoteReport(); }
  function applyRemoteBank() {
    if (!state.remotePreview) return;
    var data = currentData();
    try {
      var applied = QuizRemote.applyFetched(state.remotePreview, data);
      options.saveData(applied.data);
      state.remotePreview = null;
      render(applied.data);
      options.toast('题库合并完成：新增 ' + applied.batch.summary.add + '，更新 ' + applied.batch.summary.update);
    } catch (error) {
      setRemoteMessage('合并失败：' + error.message, 'error');
    }
  }
  async function publishRemoteBank() {
    var data = currentData();
    var source = selectedRemoteSource(data);
    var token = options.getRemoteToken ? options.getRemoteToken() : '';
    if (!source) { options.toast('没有配置远程题库源', 'error'); return; }
    if (!token) { options.toast('请先在云同步中配置 GitHub Token', 'error'); return; }
    var button = $('quizRemotePublish');
    button.disabled = true;
    button.classList.add('loading');
    try {
      var published = await QuizRemote.publishSource(token, source, data);
      options.toast('题库已发布：' + published.document.bank.name);
    } catch (error) {
      options.toast('发布失败：' + error.message, 'error');
    } finally {
      button.disabled = false;
      button.classList.remove('loading');
    }
  }
  function renderQuestion(data) {
    var current = currentQuestion(data);
    var session = state.session;
    if (!current || !current.version) { endSession(data, false); return; }
    var question = current.question;
    var version = current.version;
    var response = state.responses[state.index] || { selected: [], submitted: false };
    var stateRecord = QuizData.findState(data, question.question_id);
    $('quizPractice').style.display = '';
    $('quizPracticeTitle').textContent = '第 ' + (state.index + 1) + ' / ' + session.question_ids.length + ' 题';
    $('quizPracticeMeta').textContent = (question.question_type === 'multiple_choice' ? '多选题' : '单选题') + ' · ' + esc(question.category_l1 || '未分类');
    $('quizQuestionStem').textContent = version.stem;
    $('quizFavoriteBtn').textContent = stateRecord && stateRecord.favorite ? '★ 已收藏' : '☆ 收藏';
    $('quizFavoriteBtn').className = 'quiz-favorite-btn' + (stateRecord && stateRecord.favorite ? ' active' : '');
    $('quizProgress').style.width = Math.round((state.index + 1) / session.question_ids.length * 100) + '%';
    $('quizOptions').innerHTML = version.options.map(function (option) {
      var checked = response.selected.indexOf(option.key) !== -1;
      var disabled = response.submitted ? ' disabled' : '';
      var inputType = question.question_type === 'multiple_choice' ? 'checkbox' : 'radio';
      return '<label class="quiz-option' + (checked ? ' selected' : '') + '">' +
        '<input type="' + inputType + '" name="quiz-answer" value="' + esc(option.key) + '"' + (checked ? ' checked' : '') + disabled + '>' +
        '<span class="quiz-option-key">' + esc(option.key) + '</span><span class="quiz-option-text">' + esc(option.text) + '</span></label>';
    }).join('');
    $('quizSubmitBtn').style.display = response.submitted ? 'none' : '';
    $('quizNextBtn').style.display = response.submitted ? '' : 'none';
    $('quizNextBtn').textContent = state.index === session.question_ids.length - 1 ? '完成练习' : '下一题 ›';
    $('quizPrevBtn').disabled = state.index === 0;
    var result = $('quizResult');
      if (!response.submitted) {
      result.style.display = 'none';
      setMessage('');
      if (!state.timer || state.timerIndex !== state.index) startTimer();
    } else {
      result.style.display = '';
      result.className = 'quiz-result ' + (response.isCorrect ? 'correct' : 'wrong');
      result.innerHTML = '<b>' + (response.isCorrect ? '回答正确' : '回答错误') + '</b>' +
        '<span>正确答案：' + esc(response.correctKeys.join('、')) + ' · 用时 ' + fmtSeconds(response.seconds) + '</span>' +
        (version.explanation ? '<p>' + esc(version.explanation) + '</p>' : '');
      setMessage(response.isCorrect ? '继续保持，下一题。' : '这道题已加入错题状态。', response.isCorrect ? 'good' : 'bad');
    }
  }
  function render(data) {
    if (!options || !options.root) return;
    renderStats(data);
    renderBanks(data);
    renderRemoteSources(data);
    renderRemoteReport();
    var hasQuestions = QuizData.activeQuestions(data).length > 0;
    $('quizEmptyState').style.display = hasQuestions || state.session ? 'none' : '';
    $('quizPractice').style.display = state.session ? '' : 'none';
    if (state.session) renderQuestion(data);
  }
  function startSession(mode) {
    var data = currentData();
    var selection = QuizEngine.selectQuestions(data, {
      mode: mode === 'random' ? 'random' : 'sequential',
      wrongOnly: mode === 'wrong', favoriteOnly: mode === 'favorite', limit: 100
    });
    if (!selection.length) { options.toast(mode === 'wrong' ? '当前没有错题' : mode === 'favorite' ? '当前没有收藏题' : '请先导入题库', 'info'); return; }
    state.mode = mode;
    state.session = QuizEngine.sessionForQuestions(data, selection, {
      mode: mode === 'wrong' ? 'wrong' : mode === 'favorite' ? 'favorite' : mode,
      learningDate: options.learningDateStr ? options.learningDateStr(new Date()) : new Date().toISOString().slice(0, 10)
    });
    state.index = 0;
    state.responses = {};
    setMessage('');
    options.saveData(data);
    render(data);
  }
  function endSession(data, completed) {
    stopTimer();
    if (state.session) {
      var stored = data.quiz_sessions.find(function (session) { return session.session_id === state.session.session_id; });
      if (completed) QuizEngine.completeSession(stored || state.session);
      else if (stored) { stored.status = 'abandoned'; stored.updated_at = QuizData.nowIso(); }
    }
    if (state.session) options.saveData(data);
    state.session = null;
    state.index = 0;
    state.responses = {};
    render(data);
  }
  function submitAnswer() {
    if (!state.session || isSubmitted()) return;
    var keys = selectedKeys();
    if (!keys.length) { options.toast('请先选择答案', 'info'); return; }
    var data = currentData();
    var current = currentQuestion(data);
    var seconds = state.timer ? state.timer.seconds() : 0;
    var result = QuizEngine.recordAttempt(data, {
      questionId: current.question.question_id,
      questionVersion: current.version.version,
      selectedKeys: keys,
      activeSeconds: seconds,
      sessionId: state.session.session_id,
      mode: state.session.mode,
      learningDate: state.session.learning_date
    });
    state.responses[state.index] = {
      selected: result.result.selectedKeys, submitted: true, isCorrect: result.result.isCorrect,
      correctKeys: result.result.correctKeys, seconds: seconds
    };
    var storedSession = data.quiz_sessions.find(function (session) { return session.session_id === state.session.session_id; }) || state.session;
    storedSession.answered_count += 1;
    storedSession.active_seconds += seconds;
    storedSession.correct_count += result.result.isCorrect ? 1 : 0;
    storedSession.current_index = state.index;
    storedSession.updated_at = QuizData.nowIso();
    options.saveData(data);
    stopTimer();
    render(data);
  }
  function goNext() {
    if (!state.session) return;
    if (!isSubmitted()) { options.toast('请先提交答案', 'info'); return; }
    if (state.index >= state.session.question_ids.length - 1) {
      var data = currentData();
      endSession(data, true);
      options.toast('练习完成，已保存答题记录');
      return;
    }
    state.index += 1;
    render(currentData());
  }
  function goPrev() {
    if (!state.session || state.index === 0) return;
    state.index -= 1;
    render(currentData());
  }
  function toggleFavorite() {
    var data = currentData();
    var current = currentQuestion(data);
    if (!current) return;
    QuizEngine.toggleFavorite(data, current.question.question_id);
    options.saveData(data);
    render(data);
  }
  function showImportReport(fileName, documentData, analysis) {
    var report = $('quizImportReport');
    report.style.display = '';
    report.innerHTML = '<b>' + esc(fileName) + '</b><div class="quiz-report-grid">' +
      '<span>新增 ' + analysis.summary.add + '</span><span>更新 ' + analysis.summary.update + '</span>' +
      '<span>跳过 ' + analysis.summary.skip + '</span><span>待确认 ' + analysis.summary.needs_review + '</span></div>' +
      (analysis.errors && analysis.errors.length ? '<p class="quiz-error">' + esc(analysis.errors.join('；')) + '</p>' : '');
    if (!analysis.valid) return;
    if (analysis.summary.needs_review) {
      report.innerHTML += '<p class="quiz-error">存在疑似重复或版本冲突，暂不自动导入这些题目。</p>';
    }
    $('quizImportConfirm').style.display = analysis.summary.add + analysis.summary.update > 0 ? '' : 'none';
    $('quizImportConfirm').onclick = function () {
      var data = currentData();
      try {
        var applied = QuizImport.apply(documentData, data, { analysis: analysis, fileName: fileName });
        options.saveData(applied.data);
        report.style.display = 'none';
        $('quizImportConfirm').style.display = 'none';
        options.toast('导入完成：新增 ' + applied.batch.summary.add + '，更新 ' + applied.batch.summary.update);
        render(applied.data);
      } catch (error) { options.toast('导入失败：' + error.message, 'error'); }
    };
  }
  function handleImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var documentData;
      try { documentData = JSON.parse(reader.result); }
      catch (error) { options.toast('题库文件不是有效 JSON', 'error'); return; }
      var analysis = QuizImport.analyze(documentData, currentData());
      showImportReport(file.name, documentData, analysis);
    };
    reader.readAsText(file);
  }
  function bind() {
    var root = options.root;
    root.addEventListener('click', function (event) {
      var button = event.target.closest('[data-quiz-action]');
      if (!button) return;
      var action = button.dataset.quizAction;
      if (action === 'start') startSession(button.dataset.mode || 'sequential');
      else if (action === 'import') $('quizImportFile').click();
      else if (action === 'remote-fetch') fetchRemoteBank();
      else if (action === 'remote-publish') publishRemoteBank();
      else if (action === 'remote-confirm') applyRemoteBank();
      else if (action === 'remote-cancel') cancelRemotePreview();
      else if (action === 'submit') submitAnswer();
      else if (action === 'next') goNext();
      else if (action === 'prev') goPrev();
      else if (action === 'favorite') toggleFavorite();
      else if (action === 'stop') endSession(currentData(), false);
    });
    root.addEventListener('change', function (event) {
      if (event.target.id === 'quizRemoteSource') {
        state.remoteSourceKey = event.target.value;
        state.remotePreview = null;
        renderRemoteSources(currentData());
        renderRemoteReport();
        return;
      }
      if (event.target.closest('#quizOptions') && !isSubmitted()) {
        var label = event.target.closest('.quiz-option');
        if (label) label.classList.toggle('selected', event.target.checked);
        if (state.session) {
          state.responses[state.index] = state.responses[state.index] || {};
          state.responses[state.index].selected = selectedKeys();
        }
      }
    });
    root.addEventListener('pointerdown', function () { if (state.timer) state.timer.activity(); });
    $('quizImportFile').addEventListener('change', function () { if (this.files && this.files[0]) handleImport(this.files[0]); this.value = ''; });
    document.addEventListener('visibilitychange', function () {
      if (!state.timer) return;
      if (document.hidden) state.timer.pause(); else state.timer.resume();
    });
  }
  function configure(nextOptions) {
    options = nextOptions;
    if (!state.configured) { bind(); state.configured = true; }
    render(currentData());
  }
  function onViewHidden() { if (state.timer) state.timer.pause(); }
  function onViewShown() { if (state.timer && state.session && !isSubmitted()) state.timer.resume(); }
  return {
    configure: configure,
    render: function () { if (options) render(currentData()); },
    startSession: startSession,
    onViewHidden: onViewHidden,
    onViewShown: onViewShown
  };
});
