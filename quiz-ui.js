(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./quiz-data.js'), require('./quiz-engine.js'), require('./quiz-import.js'), require('./quiz-remote.js'), require('./quiz-exam.js'), require('./quiz-stats.js'));
  else root.QuizUI = factory(root.QuizData, root.QuizEngine, root.QuizImport, root.QuizRemote, root.QuizExam, root.QuizStats);
})(typeof window !== 'undefined' ? window : globalThis, function (QuizData, QuizEngine, QuizImport, QuizRemote, QuizExam, QuizStats) {
  'use strict';

  var options = null;
  var state = { mode: 'sequential', session: null, index: 0, responses: {}, timer: null, timerIndex: null, configured: false, remoteSourceKey: null, remotePreview: null, screen: 'home', examId: null, examIndex: 0, examTimer: null, examLastSavedAt: 0, practiceQuestionIds: null, examResult: null };

  function $(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function fmtSeconds(seconds) {
    seconds = Math.max(0, Math.round(Number(seconds) || 0));
    var minutes = Math.floor(seconds / 60);
    return minutes ? minutes + '分' + (seconds % 60 ? ' ' + (seconds % 60) + '秒' : '') : seconds + '秒';
  }
  function currentData() {
    var data = QuizData.ensure(options.loadData());
    if (QuizData.repairLegacyContent && QuizData.repairLegacyContent(data)) options.saveData(data);
    return data;
  }
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
  function syncOptionSelection(event, selector) {
    var container = document.querySelector(selector);
    if (!container) return;
    if (event.target.type === 'radio') {
      Array.prototype.forEach.call(container.querySelectorAll('.quiz-option'), function (label) { label.classList.remove('selected'); });
    }
    var label = event.target.closest('.quiz-option');
    if (label) label.classList.toggle('selected', event.target.checked);
  }
  function examSelectedKeys() {
    return Array.from(document.querySelectorAll('#quizExamOptions input:checked')).map(function (input) { return input.value; });
  }
  function fmtClock(seconds) {
    seconds = Math.max(0, Math.round(Number(seconds) || 0));
    var minutes = Math.floor(seconds / 60);
    return String(minutes).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }
  function showScreen(name) {
    state.screen = name;
    ['home', 'exam-setup', 'exam', 'exam-result'].forEach(function (screen) {
      var el = $('quizScreen' + screen.split('-').map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); }).join(''));
      if (el) el.classList.toggle('active', screen === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#view-quiz .quiz-home-block'), function (block) { block.style.display = name === 'home' ? '' : 'none'; });
    $('quizEmptyState').style.display = name === 'home' && !QuizData.activeQuestions(currentData()).length && !state.session ? '' : 'none';
    $('quizPractice').style.display = name === 'home' && state.session ? '' : 'none';
  }
  function renderExamSetup(data) {
    var banks = data.quiz_banks.filter(function (bank) { return !bank.is_deleted; });
    var bankSelect = $('quizExamBank');
    var bankValue = bankSelect.value;
    bankSelect.innerHTML = banks.length
      ? '<option value="">全部题库</option>' + banks.map(function (bank) { return '<option value="' + esc(bank.bank_id) + '">' + esc(bank.name) + '</option>'; }).join('')
      : '<option value="">没有题库</option>';
    if (bankValue && banks.some(function (bank) { return bank.bank_id === bankValue; })) bankSelect.value = bankValue;
    var categorySelect = $('quizExamCategory');
    var categoryValue = categorySelect.value;
    var categories = {};
    QuizData.activeQuestions(data).forEach(function (question) { categories[question.category_l1 || '未分类'] = true; });
    var categoryKeys = Object.keys(categories).sort();
    categorySelect.innerHTML = '<option value="">全部板块</option>' + categoryKeys.map(function (category) { return '<option value="' + esc(category) + '">' + esc(category) + '</option>'; }).join('');
    if (categoryKeys.indexOf(categoryValue) !== -1) categorySelect.value = categoryValue;
    if (!$('quizExamYear').value) $('quizExamYear').value = new Date().getFullYear();
  }
  function currentExam(data) { return state.examId ? QuizExam.findSession(data, state.examId) : null; }
  function examQuestion(data) {
    var session = currentExam(data);
    if (!session) return null;
    var questionId = session.question_ids[state.examIndex];
    var question = QuizData.findQuestion(data, questionId);
    var version = question && QuizData.findVersion(data, questionId, session.question_versions[questionId]);
    return question && version ? { question: question, version: version } : null;
  }
  function renderExam(data) {
    var session = currentExam(data);
    var current = examQuestion(data);
    if (!session || !current) { stopExamTimer(); showScreen('home'); return; }
    var answer = QuizExam.findAnswer(data, session.exam_id, current.question.question_id);
    var selected = answer ? answer.selected_keys : [];
    $('quizExamLiveTitle').textContent = session.title;
    $('quizExamLiveMeta').textContent = (state.examIndex + 1) + ' / ' + session.total_count + ' 题 · ' + (session.source || '个人题库');
    $('quizExamQuestionMeta').textContent = (current.question.question_type === 'multiple_choice' ? '多选题' : '单选题') + ' · ' + (current.question.category_l1 || '未分类');
    $('quizExamStem').textContent = current.version.stem;
    $('quizExamOptions').innerHTML = current.version.options.map(function (option) {
      var checked = selected.indexOf(option.key) !== -1;
      var type = current.question.question_type === 'multiple_choice' ? 'checkbox' : 'radio';
      return '<label class="quiz-option' + (checked ? ' selected' : '') + '"><input type="' + type + '" name="quiz-exam-answer" value="' + esc(option.key) + '"' + (checked ? ' checked' : '') + '><span class="quiz-option-key">' + esc(option.key) + '</span><span class="quiz-option-text">' + esc(option.text) + '</span></label>';
    }).join('');
    var progress = QuizExam.getExamProgress(data, session.exam_id);
    var elapsed = progress.elapsedSeconds;
    var remaining = progress.remainingSeconds;
    $('quizExamTime').textContent = remaining == null ? fmtClock(elapsed) : fmtClock(remaining);
    $('quizExamTime').className = 'quiz-exam-time' + (remaining != null && remaining <= 60 ? ' danger' : '');
    $('quizExamProgress').style.width = Math.round((state.examIndex + 1) / session.total_count * 100) + '%';
    refreshExamProgress(data, session);
    var markBtn = $('quizExamMarkBtn');
    if (markBtn) markBtn.textContent = answer && answer.is_marked ? '★ 取消标记' : '☆ 标记本题';
  }
  function refreshExamProgress(data, session) {
    var progress = QuizExam.getExamProgress(data, session.exam_id);
    var text = $('quizExamProgressText');
    if (text) text.textContent = '已答 ' + progress.answeredCount + ' · 标记 ' + progress.markedCount;
    var grid = $('quizExamQuestionGrid');
    if (grid) grid.innerHTML = progress.answers.map(function (item) {
      var classes = [];
      if (item.answered) classes.push('answered');
      if (item.marked) classes.push('marked');
      if (item.index === state.examIndex) classes.push('current');
      return '<button class="' + classes.join(' ') + '" data-quiz-action="exam-jump" data-index="' + item.index + '">' + (item.index + 1) + '</button>';
    }).join('');
    return progress;
  }
  function stopExamTimer() { if (state.examTimer) { clearInterval(state.examTimer); state.examTimer = null; } }
  function startExamTimer() {
    stopExamTimer();
    state.examTimer = setInterval(function () {
      var data = currentData();
      var session = currentExam(data);
      if (!session) return stopExamTimer();
      var progress = QuizExam.getExamProgress(data, session.exam_id);
      if (Date.now() - state.examLastSavedAt > 10000) { options.saveData(data); state.examLastSavedAt = Date.now(); }
      if (QuizExam.shouldAutoSubmit(session)) {
        var result = QuizExam.submitExam(data, session.exam_id);
        options.saveData(data); state.examResult = result; stopExamTimer(); renderExamResult(data, result); options.toast('考试时间到，已自动交卷', 'info');
      } else {
        var remaining = progress.remainingSeconds;
        $('quizExamTime').textContent = remaining == null ? fmtClock(progress.elapsedSeconds) : fmtClock(remaining);
        $('quizExamTime').className = 'quiz-exam-time' + (remaining != null && remaining <= 60 ? ' danger' : '');
      }
    }, 1000);
  }
  function renderExamResult(data, result) {
    var session = QuizExam.findSession(data, result.exam_id);
    $('quizExamResultTitle').textContent = session ? session.title : '考试结果';
    $('quizExamResultMeta').textContent = session ? (session.source || '个人题库') + ' · 用时 ' + fmtClock(result.elapsed_seconds) : '';
    $('quizExamScore').textContent = result.total_score;
    $('quizExamCorrect').textContent = result.correct_count;
    $('quizExamWrong').textContent = result.wrong_count;
    $('quizExamUnanswered').textContent = result.unanswered_count;
    $('quizExamCategoryResult').innerHTML = (result.category_stats || []).map(function (item) { return '<div class="quiz-result-category"><span>' + esc(item.category_l1) + '</span><span>' + item.correct + '/' + item.total + ' · ' + Math.round(item.accuracy * 100) + '%</span></div>'; }).join('') || '<div class="empty">本次没有可统计的板块</div>';
    state.examResult = result;
    showScreen('exam-result');
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
    $('quizPractice').style.display = state.screen === 'exam' || state.screen === 'exam-result' ? 'none' : '';
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
    renderExamSetup(data);
    renderResumeExam(data);
    if (state.examResult) renderExamResult(data, state.examResult);
    else if (state.examId) {
      var session = currentExam(data);
      if (session && session.status === 'in_progress') { showScreen('exam'); renderExam(data); }
      else { state.examId = null; state.screen = 'home'; showScreen('home'); }
    } else {
      showScreen(state.screen);
    }
    if (state.session) renderQuestion(data);
  }
  function renderResumeExam(data) {
    var box = $('quizResumeExam');
    if (!box) return;
    var session = state.examId || state.examResult ? null : QuizExam.resumeLatestExam(data);
    if (!session) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';
    box.innerHTML = '<div class="quiz-category-row"><div class="quiz-category-main"><b>未完成的考试：' + esc(session.title) + '</b><small>已答 ' + (session.answered_count || 0) + ' / ' + session.total_count + ' 题 · 答案已保存</small></div><button class="btn blue" data-quiz-action="exam-resume">继续考试</button></div>';
  }
  function startSession(mode, category) {
    var data = currentData();
    var selection = QuizEngine.selectQuestions(data, {
      mode: mode === 'random' ? 'random' : 'sequential',
      categoryL1: category || null,
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
    state.examId = null;
    state.examResult = null;
    state.screen = 'home';
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
  function startQuestionIds(questionIds, mode) {
    var data = currentData();
    var questions = (questionIds || []).map(function (id) { return QuizData.findQuestion(data, id); }).filter(function (question) {
      return question && QuizData.currentVersion(data, question);
    });
    if (!questions.length) { options.toast('没有可练习的题目', 'info'); return; }
    state.mode = mode || 'wrong';
    state.session = QuizEngine.sessionForQuestions(data, questions, {
      mode: mode || 'wrong',
      learningDate: options.learningDateStr ? options.learningDateStr(new Date()) : new Date().toISOString().slice(0, 10)
    });
    state.index = 0;
    state.responses = {};
    state.examId = null;
    state.examResult = null;
    state.screen = 'home';
    setMessage('');
    options.saveData(data);
    render(data);
    options.toast('开始练习 ' + questions.length + ' 题');
  }

  function startExam() {
    var data = currentData();
    var session;
    try {
      session = QuizExam.createExamSession(data, {
        bankId: $('quizExamBank').value || null,
        categoryL1: $('quizExamCategory').value || null,
        count: Number($('quizExamCount').value) || 20,
        durationSeconds: Number($('quizExamDuration').value) || 0,
        title: $('quizExamTitle').value,
        source: $('quizExamSource').value,
        year: $('quizExamYear').value,
        note: $('quizExamNote').value,
        learningDate: options.learningDateStr ? options.learningDateStr(new Date()) : new Date().toISOString().slice(0, 10),
        random: true
      });
    } catch (error) { options.toast(error.message, 'error'); return; }
    options.saveData(data);
    state.examId = session.exam_id;
    state.examIndex = 0;
    state.examResult = null;
    state.screen = 'exam';
    render(data);
    startExamTimer();
    options.toast('开始考试：' + session.total_count + ' 题' + (session.duration_seconds ? ' · ' + Math.round(session.duration_seconds / 60) + ' 分钟' : ' · 不限时'));
  }

  function resumeExam() {
    var data = currentData();
    var session = QuizExam.resumeLatestExam(data);
    if (!session) { options.toast('没有未完成的考试', 'info'); render(data); return; }
    state.examId = session.exam_id;
    state.examIndex = Math.max(0, Math.min(Number(session.current_index) || 0, session.total_count - 1));
    state.examResult = null;
    state.screen = 'exam';
    render(data);
    startExamTimer();
  }

  function saveExamSelection() {
    var data = currentData();
    var session = currentExam(data);
    var current = examQuestion(data);
    if (!session || session.status !== 'in_progress' || !current) return;
    try { QuizExam.saveExamAnswer(data, session.exam_id, current.question.question_id, examSelectedKeys()); }
    catch (error) { return; }
    session.current_index = state.examIndex;
    options.saveData(data);
    refreshExamProgress(data, session);
  }

  function navigateExam(delta) {
    var data = currentData();
    var session = currentExam(data);
    if (!session) return;
    var next = state.examIndex + delta;
    if (next < 0 || next >= session.question_ids.length) return;
    state.examIndex = next;
    session.current_index = next;
    options.saveData(data);
    renderExam(data);
  }

  function jumpExam(index) {
    var data = currentData();
    var session = currentExam(data);
    var target = Number(index);
    if (!session || !isFinite(target) || target < 0 || target >= session.question_ids.length) return;
    state.examIndex = Math.floor(target);
    session.current_index = state.examIndex;
    options.saveData(data);
    renderExam(data);
  }

  function toggleExamMark() {
    var data = currentData();
    var session = currentExam(data);
    var current = examQuestion(data);
    if (!session || session.status !== 'in_progress' || !current) return;
    var answer = QuizExam.toggleExamMark(data, session.exam_id, current.question.question_id);
    options.saveData(data);
    renderExam(data);
    options.toast(answer.is_marked ? '已标记本题' : '已取消标记', 'info');
  }

  function submitExamNow(automatic) {
    var data = currentData();
    var session = currentExam(data);
    if (!session || session.status !== 'in_progress') return;
    var progress = QuizExam.getExamProgress(data, session.exam_id);
    var doSubmit = function () {
      var current = currentData();
      var result;
      try { result = QuizExam.submitExam(current, session.exam_id); }
      catch (error) { options.toast('交卷失败：' + error.message, 'error'); return; }
      options.saveData(current);
      stopExamTimer();
      state.examId = session.exam_id;
      state.examResult = result;
      state.screen = 'exam-result';
      renderExamResult(current, result);
      renderStats(current);
      options.toast(automatic ? '考试时间到，已自动交卷' : '已交卷，本次成绩已保存');
    };
    if (automatic) { doSubmit(); return; }
    var message = '交卷后不能修改答案。';
    if (progress.unansweredCount > 0) message = '还有 ' + progress.unansweredCount + ' 题未作答。' + message;
    if (options.confirmModal) options.confirmModal('确认交卷？', session.title, message, '交卷', false, doSubmit);
    else if (window.confirm(message)) doSubmit();
  }

  function exitExam() {
    var data = currentData();
    var session = currentExam(data);
    var leave = function () {
      stopExamTimer();
      state.examId = null;
      state.examResult = null;
      state.screen = 'home';
      render(currentData());
      options.toast('考试已保留，可随时继续', 'info');
    };
    if (!session) { leave(); return; }
    var progress = QuizExam.getExamProgress(data, session.exam_id);
    var message = '已答 ' + progress.answeredCount + ' / ' + session.total_count + ' 题。退出后答案保留，可随时继续。';
    if (options.confirmModal) options.confirmModal('退出考试？', session.title, message, '退出', false, leave);
    else if (window.confirm(message)) leave();
  }

  function retryExam() {
    var data = currentData();
    var previous = state.examResult ? QuizExam.findSession(data, state.examResult.exam_id) : null;
    if (!previous) { showScreen('home'); return; }
    var session;
    try {
      session = QuizExam.createExamSession(data, {
        bankId: previous.bank_id, categoryL1: previous.category_l1, categoryL2: previous.category_l2,
        count: previous.total_count, durationSeconds: previous.duration_seconds,
        title: previous.title, source: previous.source, year: previous.year, note: previous.note,
        learningDate: options.learningDateStr ? options.learningDateStr(new Date()) : new Date().toISOString().slice(0, 10),
        random: true
      });
    } catch (error) { options.toast(error.message, 'error'); return; }
    options.saveData(data);
    state.examId = session.exam_id;
    state.examIndex = 0;
    state.examResult = null;
    state.screen = 'exam';
    render(data);
    startExamTimer();
    options.toast('已重新开始：' + session.total_count + ' 题');
  }

  function bind() {
    var root = options.root;
    root.addEventListener('click', function (event) {
      var button = event.target.closest('[data-quiz-action]');
      if (!button) return;
      var action = button.dataset.quizAction;
      if (action === 'home') {
        stopExamTimer();
        state.examId = null;
        state.examResult = null;
        state.screen = 'home';
        render(currentData());
        return;
      }
      if (action === 'exam-open') { showScreen('exam-setup'); return; }
      if (action === 'exam-start') { startExam(); return; }
      if (action === 'exam-resume') { resumeExam(); return; }
      if (action === 'exam-exit') { exitExam(); return; }
      if (action === 'exam-submit') { submitExamNow(false); return; }
      if (action === 'exam-prev') { navigateExam(-1); return; }
      if (action === 'exam-next') { navigateExam(1); return; }
      if (action === 'exam-jump') { jumpExam(button.dataset.index); return; }
      if (action === 'exam-mark') { toggleExamMark(); return; }
      if (action === 'exam-wrong-practice') {
        var examResult = state.examResult;
        startQuestionIds(examResult ? examResult.wrong_question_ids : [], 'wrong');
        return;
      }
      if (action === 'exam-retry') { retryExam(); return; }
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
      if (event.target.closest('#quizExamOptions')) {
        syncOptionSelection(event, '#quizExamOptions');
        saveExamSelection();
        return;
      }
      if (event.target.closest('#quizOptions') && !isSubmitted()) {
        syncOptionSelection(event, '#quizOptions');
        if (state.session) {
          state.responses[state.index] = state.responses[state.index] || {};
          state.responses[state.index].selected = selectedKeys();
        }
      }
    });
    root.addEventListener('pointerdown', function () { if (state.timer) state.timer.activity(); });
    $('quizImportFile').addEventListener('change', function () { if (this.files && this.files[0]) handleImport(this.files[0]); this.value = ''; });
    document.addEventListener('visibilitychange', function () {
      if (state.timer) { if (document.hidden) state.timer.pause(); else state.timer.resume(); }
      if (!document.hidden && state.screen === 'exam' && state.examId) {
        var data = currentData();
        var live = QuizExam.findSession(data, state.examId);
        if (live && live.status === 'in_progress') renderExam(data);
      }
    });
  }
  function configure(nextOptions) {
    options = nextOptions;
    if (!state.configured) { bind(); state.configured = true; }
    render(currentData());
  }
  function onViewHidden() {
    if (state.timer) state.timer.pause();
    stopExamTimer();
  }
  function onViewShown() {
    if (state.timer && state.session && !isSubmitted()) state.timer.resume();
    if (!options || !state.examId) return;
    var data = currentData();
    var session = QuizExam.findSession(data, state.examId);
    if (session && session.status === 'in_progress') { renderExam(data); startExamTimer(); }
  }
  return {
    configure: configure,
    render: function () { if (options) render(currentData()); },
    startSession: startSession,
    onViewHidden: onViewHidden,
    onViewShown: onViewShown
  };
});
