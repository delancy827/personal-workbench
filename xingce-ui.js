(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./xingce-data.js'), require('./xingce-engine.js'), require('./xingce-import.js'));
  } else {
    root.XingceUI = factory(root.XingceData, root.XingceEngine, root.XingceImport);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (XingceData, XingceEngine, XingceImport) {
  'use strict';

  var options = null;
  var state = {
    screen: 'home', // home | practice | exam-setup | exam | exam-result | stats
    mode: 'sequential',
    category: '',
    skill: '',
    session: null,
    index: 0,
    selected: [],
    submitted: false,
    startedAt: 0,
    questionStartedAt: 0,
    durationMs: 0,
    answers: {},
    timer: null,
    timerLeft: 0,
    exam: null,
    configured: false,
    mixedNotice: ''
  };

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60);
    return String(m).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }
  function data() { return XingceData.load(); }
  function persist(d) { XingceData.save(d); }
  function toast(msg, type) {
    if (options && options.toast) options.toast(msg, type || 'info');
    else if (typeof console !== 'undefined') console.log('[xingce]', msg);
  }

  function currentQ() {
    if (!state.session) return null;
    var id = state.session.question_ids[state.index];
    return XingceData.findQuestion(data(), id);
  }

  function show(name) {
    state.screen = name;
    ['home', 'practice', 'exam-setup', 'exam', 'exam-result', 'stats'].forEach(function (s) {
      var el = $('xScreen_' + s);
      if (el) el.classList.toggle('active', s === name);
    });
    var shell = $('xHomeShell');
    if (shell) shell.style.display = name === 'home' || name === 'stats' || name === 'exam-setup' ? '' : (name === 'home' ? '' : 'none');
  }

  function categoryChips(selected) {
    return ['<button type="button" class="x-chip' + (!selected ? ' on' : '') + '" data-x-action="cat" data-v="">全部</button>']
      .concat(XingceData.CATEGORIES.map(function (c) {
        return '<button type="button" class="x-chip' + (selected === c.name ? ' on' : '') + '" data-x-action="cat" data-v="' + esc(c.name) + '">' + esc(c.name) + '</button>';
      })).join('');
  }

  function skillSelect(selectedCat, selectedSkill) {
    var cats = XingceData.CATEGORIES;
    var skills = [];
    cats.forEach(function (c) {
      if (!selectedCat || c.name === selectedCat) skills = skills.concat(c.skills);
    });
    return '<option value="">全部考点</option>' + skills.map(function (s) {
      return '<option value="' + esc(s) + '"' + (selectedSkill === s ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('');
  }

  function poolForMode(d, mode) {
    if (mode === 'wrong') return XingceData.wrongQuestions(d);
    if (mode === 'favorite') return XingceData.favoriteQuestions(d);
    var list = XingceData.filterByCategory(d, state.category || null, state.skill || null);
    return list;
  }

  function renderHome() {
    var d = data();
    var st = XingceData.stats(d);
    var banks = d.banks.filter(function (b) { return !b.is_deleted; });
    $('xStatsLine').innerHTML =
      '<div class="x-stat-grid">' +
      '<div class="x-stat"><b>' + st.question_count + '</b><small>行测题目</small></div>' +
      '<div class="x-stat"><b>' + st.wrong_count + '</b><small>错题</small></div>' +
      '<div class="x-stat"><b>' + st.favorite_count + '</b><small>收藏</small></div>' +
      '<div class="x-stat"><b>' + st.attempt_count + '</b><small>答题次数</small></div>' +
      '<div class="x-stat"><b>' + st.accuracy + '%</b><small>累计正确率</small></div>' +
      '<div class="x-stat"><b>' + Math.round(st.total_time_ms / 60000) + '</b><small>累计分钟</small></div>' +
      '</div>';

    $('xBankList').innerHTML = banks.length
      ? banks.map(function (b) {
          return '<div class="x-stat" style="text-align:left;margin-bottom:8px"><b style="font-size:1rem">' + esc(b.name) + '</b><small>' + esc(b.version || '') + ' · ' + (b.question_count || 0) + ' 题</small></div>';
        }).join('')
      : '<div class="x-sub">还没有行测题库，请导入标准 JSON。与价值观题库完全隔离。</div>';

    $('xCatChips').innerHTML = categoryChips(state.category);
    $('xSkillSelect').innerHTML = skillSelect(state.category, state.skill);
    $('xSkillSelect').value = state.skill || '';

    var mixed = XingceData.reserveMixedExam();
    $('xMixedNote').textContent = mixed.message + '（卷面权重：行测 ' + mixed.aptitude_score_weight + ' + 价值观 ' + mixed.values_score_weight + '，仅预留）';
  }

  function renderStats() {
    var st = XingceStatsView(data());
    $('xStatsDetail').innerHTML = st;
  }

  function XingceStatsView(d) {
    var st = XingceData.stats(d);
    var rows = Object.keys(st.by_category).map(function (k) {
      var b = st.by_category[k];
      return '<div class="x-stat" style="text-align:left;margin-bottom:8px"><b style="font-size:0.98rem">' + esc(k) + '</b><small>题 ' + b.total + ' · 已答 ' + b.answered + ' · 正确率 ' + b.accuracy + '%</small></div>';
    }).join('');
    return '<div class="x-sub">以下统计仅来自行测专属存储 <code>xingce_quiz_data</code>，不影响价值观数据。</div>' + rows;
  }

  function startMode(mode) {
    var d = data();
    var pool = poolForMode(d, mode);
    if (!pool.length) {
      toast(mode === 'wrong' ? '没有错题' : mode === 'favorite' ? '没有收藏' : '该范围没有题目，请先导入题库', 'info');
      return;
    }
    if (mode !== 'wrong' && mode !== 'favorite' && state.mode === 'random') pool = XingceEngine.shuffle(pool);
    state.mode = mode;
    state.session = XingceEngine.startPractice(pool, mode === 'random' ? 'random' : mode);
    state.index = 0;
    state.selected = [];
    state.submitted = false;
    state.answers = {};
    state.startedAt = Date.now();
    state.questionStartedAt = Date.now();
    state.exam = null;
    stopTimer();
    show('practice');
    renderPractice();
  }

  function renderPractice() {
    var d = data();
    var q = currentQ();
    if (!q) {
      show('home');
      renderHome();
      return;
    }
    var st = XingceData.findState(d, q.question_id);
    var total = state.session.question_ids.length;
    $('xPTitle').textContent = (state.mode === 'wrong' ? '错题练习' : state.mode === 'favorite' ? '收藏练习' : state.mode === 'random' ? '随机练习' : state.mode === 'exam' ? '模拟考试' : '专项练习') + ' · 第 ' + (state.index + 1) + '/' + total + ' 题';
    $('xPMeta').textContent = q.category_l1 + (q.category_l2 ? ' · ' + q.category_l2 : '') + ' · ' + (q.question_type === 'multiple_choice' ? '多选' : '单选');
    $('xPStem').textContent = q.stem;
    var type = q.question_type === 'multiple_choice' ? 'checkbox' : 'radio';
    $('xPOptions').innerHTML = q.options.map(function (o) {
      var on = state.selected.indexOf(o.key) !== -1;
      var cls = 'x-option' + (on ? ' selected' : '');
      if (state.submitted) {
        if (q.answer_keys.indexOf(o.key) !== -1) cls += ' correct';
        else if (on) cls += ' wrong';
      }
      return '<button type="button" class="' + cls + '" data-x-action="opt" data-k="' + esc(o.key) + '"><span class="k">' + esc(o.key) + '</span><span>' + esc(o.text) + '</span></button>';
    }).join('');

    var result = $('xPResult');
    if (state.submitted) {
      var last = state.answers[q.question_id];
      result.style.display = '';
      result.className = 'x-result ' + (last && last.isCorrect ? 'ok' : 'bad');
      result.innerHTML = '<b>' + (last && last.isCorrect ? '回答正确' : '回答错误') + '</b>' +
        '<span>正确答案：' + esc(q.answer_keys.join('')) + ' · 你的答案：' + esc((last && last.selectedKeys.join('')) || '未答') + '</span>' +
        (q.explanation ? '<p>' + esc(q.explanation) + '</p>' : '') +
        '<div class="x-tags">' + [q.category_l1, q.category_l2].filter(Boolean).map(function (t) {
          return '<span class="x-tag">' + esc(t) + '</span>';
        }).join('') + '</div>';
    } else {
      result.style.display = 'none';
    }

    $('xFavBtn').className = 'x-fav' + (st && st.is_favorite ? ' on' : '');
    $('xFavBtn').textContent = st && st.is_favorite ? '★ 已收藏' : '☆ 收藏';
    $('xPSubmit').disabled = state.submitted;
    $('xPSubmit').style.display = state.submitted ? 'none' : '';
    $('xPNext').style.display = state.submitted ? '' : 'none';
    $('xPProgress').style.width = Math.round(((state.index) / Math.max(1, total)) * 100) + '%';
  }

  function toggleSelect(key) {
    var q = currentQ();
    if (!q || state.submitted) return;
    if (q.question_type === 'multiple_choice') {
      var i = state.selected.indexOf(key);
      if (i >= 0) state.selected.splice(i, 1);
      else state.selected.push(key);
    } else {
      state.selected = [key];
    }
    // 只更新选中样式，避免整块重绘导致焦点/触控中断
    var box = $('xPOptions');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.x-option'), function (el) {
      el.classList.toggle('selected', state.selected.indexOf(el.dataset.k) !== -1);
    });
  }

  function submitPractice() {
    if (state.submitted) return;
    if (!state.selected.length) { toast('请先选择答案', 'info'); return; }
    var q = currentQ();
    var duration = Date.now() - state.questionStartedAt;
    var d = data();
    var out = XingceEngine.submit(d, state.session, q, state.selected, duration, state.mode);
    persist(d);
    state.answers[q.question_id] = out;
    state.submitted = true;
    renderPractice();
  }

  function nextPractice() {
    if (!state.session) return;
    if (state.index >= state.session.question_ids.length - 1) {
      stopTimer();
      toast('本轮练习完成', 'success');
      state.session = null;
      show('home');
      renderHome();
      return;
    }
    state.index += 1;
    state.selected = [];
    state.submitted = false;
    state.questionStartedAt = Date.now();
    renderPractice();
  }

  function prevPractice() {
    if (!state.session || state.index === 0) return;
    state.index -= 1;
    var q = currentQ();
    var last = q && state.answers[q.question_id];
    state.selected = last ? last.selectedKeys.slice() : [];
    state.submitted = !!last;
    renderPractice();
  }

  function toggleFavorite() {
    var q = currentQ();
    if (!q) return;
    var d = data();
    var st = XingceData.ensureState(d, q.question_id);
    XingceData.setFavorite(d, q.question_id, !st.is_favorite);
    persist(d);
    renderPractice();
  }

  function startTimer(seconds) {
    stopTimer();
    if (options && typeof options.timerEnabled === 'function' && options.timerEnabled() === false) {
      var elOff = $('xExamTimer');
      if (elOff) {
        elOff.textContent = '不限时';
        elOff.classList.remove('danger');
      }
      state.timerLeft = 0;
      state.timerTotal = 0;
      return;
    }
    state.timerTotal = seconds;
    state.timerLeft = seconds;
    state.timerDeadline = Date.now() + seconds * 1000;
    var el = $('xExamTimer');
    if (!el) return;
    el.textContent = fmtClock(state.timerLeft);
    el.classList.remove('danger');
    state.timer = setInterval(function () {
      if (!state.timerDeadline) return;
      state.timerLeft = Math.max(0, Math.round((state.timerDeadline - Date.now()) / 1000));
      var node = $('xExamTimer');
      if (node) {
        node.textContent = fmtClock(state.timerLeft);
        node.classList.toggle('danger', state.timerLeft <= 60);
      }
      if (state.timerLeft <= 0) {
        stopTimer();
        submitExam(true);
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  /** 切后台/切页暂停 interval，回到考试页按 deadline 续跑，避免绕过限时交卷 */
  function resumeTimerIfExam() {
    if (state.screen !== 'exam' || !state.timerDeadline || !state.exam) return;
    if (state.timer) return;
    var left = Math.max(0, Math.round((state.timerDeadline - Date.now()) / 1000));
    if (left <= 0) {
      submitExam(true);
      return;
    }
    state.timerLeft = left;
    var el = $('xExamTimer');
    if (el) {
      el.textContent = fmtClock(left);
      el.classList.toggle('danger', left <= 60);
    }
    state.timer = setInterval(function () {
      state.timerLeft = Math.max(0, Math.round((state.timerDeadline - Date.now()) / 1000));
      var node = $('xExamTimer');
      if (node) {
        node.textContent = fmtClock(state.timerLeft);
        node.classList.toggle('danger', state.timerLeft <= 60);
      }
      if (state.timerLeft <= 0) {
        stopTimer();
        submitExam(true);
      }
    }, 1000);
  }

  /* —— 整卷模拟：科一/科四式，考试中不显答案，交卷统一结算 —— */
  function openExamSetup() {
    var d = data();
    $('xExamCat').innerHTML = '<option value="">全部板块</option>' + XingceData.CATEGORIES.map(function (c) {
      return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
    }).join('');
    var pool = XingceData.activeQuestions(d);
    var counts = [5, 6, 8, 10, 20, 30, 50, 80, 100].filter(function (n) { return n < pool.length; });
    counts.push(pool.length);
    $('xExamCount').innerHTML = counts.map(function (n) {
      return '<option value="' + n + '"' + (n === Math.min(10, pool.length) ? ' selected' : '') + '>' + n + ' 题</option>';
    }).join('');
    $('xExamDur').innerHTML = [
      ['0', '不限时'], ['15', '15 分钟'], ['20', '20 分钟'], ['30', '30 分钟'], ['45', '45 分钟']
    ].map(function (pair) {
      return '<option value="' + pair[0] + '"' + (pair[0] === '20' ? ' selected' : '') + '>' + pair[1] + '</option>';
    }).join('');
    show('exam-setup');
  }

  function startExam() {
    var d = data();
    var cat = $('xExamCat').value;
    var pool = XingceData.filterByCategory(d, cat || null, null);
    if (!pool.length) { toast('没有可考题目', 'info'); return; }
    pool = XingceEngine.shuffle(pool);
    var count = Math.min(Number($('xExamCount').value) || 20, pool.length);
    var picked = pool.slice(0, count);
    var minutes = Number($('xExamDur').value) || 0;
    state.exam = {
      title: '行测模拟 ' + new Date().toLocaleDateString(),
      question_ids: picked.map(function (q) { return q.question_id; }),
      answers: {},
      marked: {},
      index: 0,
      started_at: XingceData.nowIso(),
      duration_minutes: minutes
    };
    state.session = XingceEngine.createSession(picked, 'exam');
    state.index = 0;
    state.selected = [];
    state.submitted = true; // 考试中锁定即时判题
    show('exam');
    renderExam();
    if (minutes > 0) {
      startTimer(minutes * 60);
    } else {
      stopTimer();
      state.timerDeadline = 0;
      state.timerLeft = 0;
      var el = $('xExamTimer');
      if (el) {
        el.textContent = '不限时';
        el.classList.remove('danger');
      }
    }
  }

  function renderExam() {
    if (!state.exam) return;
    var d = data();
    var id = state.exam.question_ids[state.exam.index];
    var q = XingceData.findQuestion(d, id);
    if (!q) return;
    var selected = state.exam.answers[id] || [];
    $('xExamProgressText').textContent = (state.exam.index + 1) + ' / ' + state.exam.question_ids.length;
    $('xExamStem').textContent = q.stem;
    $('xExamMeta').textContent = (q.question_type === 'multiple_choice' ? '多选题' : '单选题') + ' · ' + (q.category_l1 || '');
    $('xExamOptions').innerHTML = q.options.map(function (o) {
      var on = selected.indexOf(o.key) !== -1;
      return '<button type="button" class="x-option' + (on ? ' selected' : '') + '" data-x-action="exam-opt" data-k="' + esc(o.key) + '"><span class="k">' + esc(o.key) + '</span><span>' + esc(o.text) + '</span></button>';
    }).join('');
    $('xExamMark').textContent = state.exam.marked[id] ? '★ 已标记' : '☆ 标记本题';
    $('xExamGrid').innerHTML = state.exam.question_ids.map(function (qid, i) {
      var ans = state.exam.answers[qid] || [];
      var cls = [];
      if (ans.length) cls.push('answered');
      if (state.exam.marked[qid]) cls.push('marked');
      if (i === state.exam.index) cls.push('current');
      return '<button type="button" class="' + cls.join(' ') + '" data-x-action="exam-jump" data-i="' + i + '">' + (i + 1) + '</button>';
    }).join('');
  }

  function examToggle(key) {
    if (!state.exam) return;
    var id = state.exam.question_ids[state.exam.index];
    var d = data();
    var q = XingceData.findQuestion(d, id);
    var cur = (state.exam.answers[id] || []).slice();
    if (q.question_type === 'multiple_choice') {
      var i = cur.indexOf(key);
      if (i >= 0) cur.splice(i, 1); else cur.push(key);
    } else {
      cur = [key];
    }
    state.exam.answers[id] = cur;
    var box = $('xExamOptions');
    if (box) {
      Array.prototype.forEach.call(box.querySelectorAll('.x-option'), function (el) {
        el.classList.toggle('selected', cur.indexOf(el.dataset.k) !== -1);
      });
    }
    // 题号导航“已答”状态
    var grid = $('xExamGrid');
    if (grid) {
      var btn = grid.querySelector('button[data-i="' + state.exam.index + '"]');
      if (btn) btn.classList.toggle('answered', cur.length > 0);
    }
  }

  function examJump(i) {
    if (!state.exam) return;
    state.exam.index = Math.max(0, Math.min(state.exam.question_ids.length - 1, i));
    renderExam();
  }

  function submitExam(auto) {
    if (!state.exam) return;
    stopTimer();
    state.timerDeadline = 0;
    state.timerLeft = 0;
    state.timerTotal = 0;
    var doneTimer = $('xExamTimer');
    if (doneTimer) {
      doneTimer.textContent = '不限时';
      doneTimer.classList.remove('danger');
    }
    var d = data();
    var correct = 0, wrong = 0, blank = 0;
    var detail = state.exam.question_ids.map(function (qid) {
      var q = XingceData.findQuestion(d, qid);
      var sel = state.exam.answers[qid] || [];
      var out = XingceEngine.submit(d, state.session, q, sel, 0, 'exam');
      if (!sel.length) blank += 1;
      else if (out.isCorrect) correct += 1;
      else wrong += 1;
      return { question_id: qid, is_correct: out.isCorrect, selected_keys: out.selectedKeys };
    });
    persist(d);
    var total = state.exam.question_ids.length;
    var score = total ? Math.round((correct / total) * 100) : 0;
    $('xResultScore').textContent = String(score);
    $('xResultMeta').textContent = (auto ? '时间到自动交卷 · ' : '') + state.exam.title;
    $('xResultGrid').innerHTML =
      '<div class="x-stat-grid">' +
      '<div class="x-stat"><b>' + correct + '</b><small>答对</small></div>' +
      '<div class="x-stat"><b>' + wrong + '</b><small>答错</small></div>' +
      '<div class="x-stat"><b>' + blank + '</b><small>未答</small></div>' +
      '</div>';
    state.exam = null;
    state.session = null;
    show('exam-result');
  }

  function configure(opts) {
    options = opts || {};
    state.configured = true;
    if (!document.getElementById('xScreen_home')) return;
    bind();
    renderHome();
    show('home');
  }

  function bind() {
    var root = options.root || document.getElementById('view-xingce');
    if (!root || root.__xingceBound) return;
    root.__xingceBound = true;
    root.addEventListener('click', function (event) {
      var button = event.target.closest('[data-x-action]');
      if (!button) return;
      var action = button.dataset.xAction;
      if (action === 'mode') {
        state.mode = button.dataset.mode;
        Array.prototype.forEach.call(root.querySelectorAll('.x-mode'), function (el) {
          el.classList.toggle('selected', el === button);
        });
        if (state.mode === 'exam') openExamSetup();
        else startMode(state.mode);
        return;
      }
      if (action === 'cat') {
        state.category = button.dataset.v || '';
        state.skill = '';
        renderHome();
        return;
      }
      if (action === 'opt') { toggleSelect(button.dataset.k); return; }
      if (action === 'submit') { submitPractice(); return; }
      if (action === 'next') { nextPractice(); return; }
      if (action === 'prev') { prevPractice(); return; }
      if (action === 'stop') {
        stopTimer();
        state.timerDeadline = 0;
        state.timerLeft = 0;
        state.session = null;
        state.exam = null;
        show('home');
        renderHome();
        return;
      }
      if (action === 'fav') { toggleFavorite(); return; }
      if (action === 'stats') { show('stats'); renderStats(); return; }
      if (action === 'home') {
        stopTimer();
        state.timerDeadline = 0;
        state.timerLeft = 0;
        state.exam = null;
        show('home');
        renderHome();
        return;
      }
      if (action === 'import') { $('xImportFile').click(); return; }
      if (action === 'exam-start') { startExam(); return; }
      if (action === 'exam-opt') { examToggle(button.dataset.k); return; }
      if (action === 'exam-jump') { examJump(Number(button.dataset.i)); return; }
      if (action === 'exam-prev') { examJump((state.exam ? state.exam.index : 0) - 1); return; }
      if (action === 'exam-next') { examJump((state.exam ? state.exam.index : 0) + 1); return; }
      if (action === 'exam-mark') {
        if (state.exam) {
          var id = state.exam.question_ids[state.exam.index];
          state.exam.marked[id] = !state.exam.marked[id];
          renderExam();
        }
        return;
      }
      if (action === 'exam-submit') {
        if (options.confirmModal) {
          options.confirmModal('确认交卷？', '行测模拟考试', '交卷后统一判分，未答按错误计。', '交卷', false, function () { submitExam(false); });
        } else if (typeof confirm === 'function') {
          if (confirm('确认交卷？')) submitExam(false);
        } else {
          submitExam(false);
        }
        return;
      }
    });
    root.addEventListener('change', function (event) {
      if (event.target.id === 'xSkillSelect') {
        state.skill = event.target.value || '';
      }
    });
    var file = $('xImportFile');
    if (file) {
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var doc = JSON.parse(reader.result);
            var d = data();
            var analysis = XingceImport.analyze(doc, d);
            if (!analysis.valid && !(analysis.summary && (analysis.summary.add + analysis.summary.update))) {
              toast(analysis.errors.join('；') || '没有可导入题目', 'error');
              return;
            }
            if (analysis.summary.invalid) {
              toast('将跳过 ' + analysis.summary.invalid + ' 道无效题', 'info');
            }
            var applied = XingceImport.apply(doc, d, analysis);
            persist(applied.data);
            toast('导入完成：新增 ' + analysis.summary.add + '，更新 ' + analysis.summary.update, 'success');
            renderHome();
          } catch (e) {
            toast('导入失败：' + e.message, 'error');
          }
          file.value = '';
        };
        reader.readAsText(f);
      });
    }
  }

  function onViewShown() {
    if (!state.configured) return;
    if (state.screen === 'home') renderHome();
    else if (state.screen === 'practice') renderPractice();
    else if (state.screen === 'exam') { renderExam(); resumeTimerIfExam(); }
    else if (state.screen === 'stats') renderStats();
  }

  function onViewHidden() {
    // 离开页面暂停计时（deadline 保留），不写价值观数据
    stopTimer();
  }

  function render() {
    if (!state.configured) return;
    if (state.screen === 'home') renderHome();
    else if (state.screen === 'practice') renderPractice();
    else if (state.screen === 'exam') renderExam();
    else if (state.screen === 'stats') renderStats();
  }

  return {
    configure: configure,
    render: render,
    onViewShown: onViewShown,
    onViewHidden: onViewHidden,
    getStorageKey: function () { return XingceData.LS_KEY; }
  };
});
