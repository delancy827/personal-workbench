(function (root) {
  'use strict';

  var FRACTION_PAIRS = [
    ['1/2', '50%'], ['1/3', '33.3%'], ['2/3', '66.7%'], ['1/4', '25%'], ['3/4', '75%'],
    ['1/5', '20%'], ['2/5', '40%'], ['3/5', '60%'], ['4/5', '80%'], ['1/6', '16.7%'],
    ['5/6', '83.3%'], ['1/7', '14.3%'], ['2/7', '28.6%'], ['3/7', '42.9%'], ['4/7', '57.1%'],
    ['5/7', '71.4%'], ['6/7', '85.7%'], ['1/8', '12.5%'], ['3/8', '37.5%'], ['5/8', '62.5%'],
    ['7/8', '87.5%'], ['1/9', '11.1%'], ['2/9', '22.2%'], ['4/9', '44.4%'], ['5/9', '55.6%'],
    ['7/9', '77.8%'], ['8/9', '88.9%'], ['1/10', '10%'], ['1/11', '9.1%'], ['2/11', '18.2%'],
    ['3/11', '27.3%'], ['5/11', '45.5%'], ['7/11', '63.6%'], ['1/12', '8.3%'], ['1/13', '7.7%'],
    ['1/14', '7.1%'], ['1/15', '6.7%'], ['1/16', '6.25%']
  ];
  var EXTRA_PAIRS = [
    ['三成', '30%'], ['七成', '70%'], ['七成五', '75%'], ['打八折', '80%'], ['打七折', '70%'],
    ['打六五折', '65%'], ['翻1番', '×2'], ['翻2番', '×4'], ['翻3番', '×8']
  ];
  var PAIRS = FRACTION_PAIRS.concat(EXTRA_PAIRS).map(function (texts, index) {
    return { id: 'pair-' + index, texts: texts };
  });

  var state = {
    mounted: false,
    active: false,
    round: 0,
    roundPairs: 0,
    matchedPairs: 0,
    flips: 0,
    streak: 0,
    selected: [],
    locked: false,
    cards: [],
    elapsedMs: 0,
    startedAt: 0,
    timerId: null,
    feedbackTimer: null,
    errorCounts: {}
  };
  var ERROR_STORAGE_KEY = 'speed_match_error_counts_v1';

  function get(id) { return document.getElementById(id); }
  function loadErrors() {
    try { state.errorCounts = JSON.parse(window.localStorage.getItem(ERROR_STORAGE_KEY) || '{}') || {}; }
    catch (e) { state.errorCounts = {}; }
  }
  function saveErrors() {
    try { window.localStorage.setItem(ERROR_STORAGE_KEY, JSON.stringify(state.errorCounts)); } catch (e) { /* storage may be unavailable */ }
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function renderErrorBoard() {
    var list = get('speedMatchErrors');
    var empty = get('speedMatchErrorsEmpty');
    if (!list) return;
    var ranked = Object.keys(state.errorCounts).map(function (id) {
      var pair = PAIRS.find(function (item) { return item.id === id; });
      return pair ? { pair: pair, count: state.errorCounts[id] } : null;
    }).filter(Boolean).sort(function (a, b) { return b.count - a.count; }).slice(0, 5);
    list.innerHTML = ranked.map(function (item, index) {
      return '<div class="speed-match-error-row"><span class="rank">' + (index + 1) + '</span><span class="error-pair"><b>' + escapeHtml(item.pair.texts[0]) + '</b><span>↔</span><b>' + escapeHtml(item.pair.texts[1]) + '</b></span><span class="error-count">错 ' + item.count + ' 次</span></div>';
    }).join('');
    if (empty) empty.style.display = ranked.length ? 'none' : '';
  }
  function shuffle(items) {
    var result = items.slice();
    for (var i = result.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = result[i]; result[i] = result[j]; result[j] = tmp;
    }
    return result;
  }
  function formatTime(ms) {
    var total = Math.floor(ms / 1000);
    var minutes = Math.floor(total / 60);
    var seconds = total % 60;
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }
  function currentElapsed() {
    return state.elapsedMs + (state.startedAt ? Date.now() - state.startedAt : 0);
  }
  function updateStats() {
    var elapsed = currentElapsed();
    var pairs = get('speedMatchPairs');
    var time = get('speedMatchTime');
    var streak = get('speedMatchStreak');
    var flips = get('speedMatchFlips');
    if (pairs) pairs.textContent = state.matchedPairs + '/' + state.roundPairs;
    if (time) time.textContent = formatTime(elapsed);
    if (streak) streak.textContent = String(state.streak);
    if (flips) flips.textContent = String(state.flips);
  }
  function stopTimer() {
    if (state.startedAt) state.elapsedMs += Date.now() - state.startedAt;
    state.startedAt = 0;
    if (state.timerId) window.clearInterval(state.timerId);
    state.timerId = null;
    updateStats();
  }
  function startTimer() {
    if (state.startedAt || !state.active) return;
    state.startedAt = Date.now();
    state.timerId = window.setInterval(updateStats, 250);
  }
  function setFeedback(message, type) {
    var node = get('speedMatchFeedback');
    if (!node) return;
    node.textContent = message;
    node.className = 'speed-match-feedback ' + (type || '');
  }
  function buildRound() {
    var count = 6 + Math.floor(Math.random() * 3);
    var chosen = shuffle(PAIRS).slice(0, count);
    state.round += 1;
    state.roundPairs = count;
    state.matchedPairs = 0;
    state.flips = 0;
    state.selected = [];
    state.locked = false;
    state.cards = shuffle(chosen.reduce(function (all, pair) {
      return all.concat(pair.texts.map(function (text, side) {
        return { id: pair.id + '-' + side, pairId: pair.id, text: text, matched: false };
      }));
    }, []));
    renderRound();
  }
  function cardLabelSize(text) { return text.length > 5 ? ' long' : ''; }
  function renderRound() {
    var grid = get('speedMatchGrid');
    var round = get('speedMatchRound');
    if (!grid) return;
    grid.innerHTML = state.cards.map(function (card, index) {
      return '<button class="speed-match-card' + cardLabelSize(card.text) + '" type="button" data-card-index="' + index + '" aria-label="翻开卡片">' +
        '<span class="speed-match-card-inner"><span class="speed-match-card-back">?</span><span class="speed-match-card-front">' + card.text + '</span></span></button>';
    }).join('');
    if (round) round.textContent = '第 ' + state.round + ' 轮';
    updateStats();
  }
  function reveal(cardNode) {
    cardNode.classList.add('flipped');
  }
  function hide(cardNode) {
    cardNode.classList.remove('flipped');
  }
  function finishRound() {
    stopTimer();
    setFeedback('本轮完成，马上开始下一轮', 'success');
    state.feedbackTimer = window.setTimeout(function () {
      if (state.active) {
        buildRound();
        setFeedback('找到数值相等的两张卡片', '');
      }
    }, 850);
  }
  function resolveSelection() {
    var firstIndex = state.selected[0];
    var secondIndex = state.selected[1];
    var first = state.cards[firstIndex];
    var second = state.cards[secondIndex];
    var nodes = document.querySelectorAll('#speedMatchGrid .speed-match-card');
    state.locked = true;
    if (first.pairId === second.pairId) {
      first.matched = true; second.matched = true;
      state.matchedPairs += 1;
      state.streak += 1;
      nodes[firstIndex].classList.add('matched');
      nodes[secondIndex].classList.add('matched');
      setFeedback('配对成功 +' + state.streak + ' 连胜', 'success');
      state.selected = [];
      state.locked = false;
      updateStats();
      if (state.matchedPairs === state.roundPairs) finishRound();
      return;
    }
    state.streak = 0;
    state.errorCounts[first.pairId] = (state.errorCounts[first.pairId] || 0) + 1;
    state.errorCounts[second.pairId] = (state.errorCounts[second.pairId] || 0) + 1;
    saveErrors();
    renderErrorBoard();
    nodes[firstIndex].classList.add('mismatch');
    nodes[secondIndex].classList.add('mismatch');
    setFeedback('不匹配，再试一次', 'error');
    window.setTimeout(function () {
      hide(nodes[firstIndex]); hide(nodes[secondIndex]);
      nodes[firstIndex].classList.remove('mismatch');
      nodes[secondIndex].classList.remove('mismatch');
      state.selected = [];
      state.locked = false;
      updateStats();
    }, 520);
    updateStats();
  }
  function onGridClick(event) {
    var cardNode = event.target.closest('.speed-match-card');
    if (!cardNode || state.locked || cardNode.classList.contains('flipped') || cardNode.classList.contains('matched')) return;
    var index = Number(cardNode.dataset.cardIndex);
    if (!state.cards[index]) return;
    startTimer();
    state.flips += 1;
    state.selected.push(index);
    reveal(cardNode);
    cardNode.classList.add('just-flipped');
    window.setTimeout(function () { cardNode.classList.remove('just-flipped'); }, 260);
    updateStats();
    if (state.selected.length === 2) resolveSelection();
  }
  function resetGame() {
    if (state.feedbackTimer) window.clearTimeout(state.feedbackTimer);
    stopTimer();
    state.round = 0;
    state.streak = 0;
    state.elapsedMs = 0;
    setFeedback('找到数值相等的两张卡片', '');
    buildRound();
  }
  function mount() {
    if (!get('speedMatchGrid')) return;
    if (!state.mounted) {
      get('speedMatchGrid').addEventListener('click', onGridClick);
      var reset = get('speedMatchReset');
      if (reset) reset.addEventListener('click', resetGame);
      state.mounted = true;
      loadErrors();
      renderErrorBoard();
      resetGame();
    }
    state.active = true;
    updateStats();
  }
  function deactivate() {
    state.active = false;
    stopTimer();
  }
  function getTestSnapshot() {
    return { pairCount: state.roundPairs, cards: state.cards.slice(), elapsedMs: currentElapsed() };
  }

  root.SpeedMatchGame = {
    mount: mount,
    deactivate: deactivate,
    reset: resetGame,
    getTestSnapshot: getTestSnapshot,
    pairs: PAIRS
  };
}(typeof window !== 'undefined' ? window : this));
