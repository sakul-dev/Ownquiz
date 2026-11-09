'use strict';

const STORAGE_KEY = 'methods-trainer-known-v1';

const state = {
  cards: [],
  deck: [],
  index: 0,
  flipped: false,
  known: new Set(),
  mode: 'flashcards',
  shuffled: false,
  section: 'all',
  severity: 'all'
};

let quiz = { order: [], pos: 0, correct: 0, answered: 0, current: null, selected: null };

function closeMenu() {
  const toolbar = document.getElementById('toolbar');
  const toggle = document.getElementById('menuToggle');
  if (toolbar) toolbar.classList.remove('open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function plain(md) {
  return String(md)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function inlineHtml(md) {
  let s = esc(md);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

function blockHtml(md) {
  const lines = String(md).split('\n');
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) {
      out.push('<p>' + para.map(inlineHtml).join(' ') + '</p>');
      para = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push('</' + list + '>');
      list = null;
    }
  };
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) { flushPara(); closeList(); continue; }
    let m;
    if ((m = t.match(/^-\s+(.*)$/))) {
      flushPara();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push('<li>' + inlineHtml(m[1]) + '</li>');
    } else if ((m = t.match(/^\d+\.\s+(.*)$/))) {
      flushPara();
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push('<li>' + inlineHtml(m[1]) + '</li>');
    } else {
      closeList();
      para.push(t);
    }
  }
  flushPara();
  closeList();
  return out.join('');
}

function fieldsHtml(card) {
  return card.fields.map(f =>
    '<div class="field">' +
      '<div class="field-label">' + esc(f.label) + '</div>' +
      '<div class="field-value">' + blockHtml(f.value) + '</div>' +
    '</div>'
  ).join('');
}

function sevBadge(card) {
  return '<span class="sev sev-' + card.importance + '">' + card.importance + '</span>';
}

function parseMethods(md) {
  const lines = md.split(/\r?\n/);
  const cards = [];
  let part = '';
  let section = '';
  let current = null;
  let currentField = null;

  const flush = () => {
    if (!current) return;
    current.fieldMap = {};
    current.plainMap = {};
    for (const f of current.fields) {
      current.fieldMap[f.label] = f.value;
      current.plainMap[f.label] = plain(f.value);
    }
    current.searchText = [current.name, current.location, current.section, current.part]
      .concat(current.fields.map(f => f.label + ' ' + f.value))
      .join(' ')
      .toLowerCase();
    const imp = (current.fieldMap['Importance'] || '').toLowerCase();
    current.importance = /\bmajor\b/.test(imp) ? 'major' : /\bminor\b/.test(imp) ? 'minor' : 'mid';
    current.id = current.name;
    cards.push(current);
    current = null;
    currentField = null;
  };

  for (const line of lines) {
    if (/^####\s+/.test(line)) {
      flush();
      const rest = line.replace(/^####\s+/, '').trim();
      const codeMatch = rest.match(/`([^`]+)`/);
      const name = codeMatch ? codeMatch[1] : rest;
      const dashMatch = rest.match(/—\s*(.+)$/);
      current = {
        name: name,
        title: plain(rest),
        location: dashMatch ? plain(dashMatch[1]) : '',
        part: plain(part),
        section: plain(section),
        fields: [],
        fieldMap: {},
        id: name
      };
      currentField = null;
      continue;
    }
    if (/^###\s+/.test(line)) { flush(); section = line.replace(/^###\s+/, '').trim(); continue; }
    if (/^##\s+/.test(line)) { flush(); part = line.replace(/^##\s+/, '').trim(); section = ''; continue; }
    if (/^---\s*$/.test(line)) { flush(); continue; }
    if (!current) continue;
    const fieldMatch = line.match(/^\s*-\s+\*\*(.+?):\*\*\s*(.*)$/);
    if (fieldMatch) {
      const field = { label: fieldMatch[1].trim(), value: fieldMatch[2].trim() };
      current.fields.push(field);
      currentField = field;
      continue;
    }
    if (currentField) {
      const t = line.trim();
      if (!t) continue;
      currentField.value += (currentField.value ? '\n' : '') + t;
    }
  }
  flush();
  return cards;
}
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function saveProgress() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(state.known))); } catch (e) {}
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.known = new Set(JSON.parse(raw));
  } catch (e) {
    state.known = new Set();
  }
}

function rebuildDeck() {
  let base = state.section === 'all'
    ? state.cards.slice()
    : state.cards.filter(c => c.section === state.section);
  if (state.severity !== 'all') base = base.filter(c => c.importance === state.severity);
  state.deck = base.slice();
  if (state.shuffled) {
    shuffleArray(state.deck);
  } else {
    const rank = { major: 0, mid: 1, minor: 2 };
    state.deck.sort((a, b) => rank[a.importance] - rank[b.importance]);
  }
  state.index = 0;
  state.flipped = false;
}

function frontHtml(card) {
  return '<div class="chips"><span class="chip">' + esc(card.section || card.part) + '</span>' + sevBadge(card) + '</div>' +
    '<h2 class="method-name">' + esc(card.name) + '</h2>' +
    '<div class="method-loc">' + esc(card.location) + '</div>' +
    '<p class="flip-hint">Click the card or press Space to reveal the answer</p>';
}

function backHtml(card) {
  return '<div class="back-head">' +
      '<span class="back-title">' + esc(card.name) + ' ' + sevBadge(card) + '</span>' +
      '<button class="btn ghost flip-back" type="button">↺ Flip back</button>' +
    '</div>' + fieldsHtml(card);
}

function renderFlashcard() {
  const front = document.getElementById('fcFront');
  const back = document.getElementById('fcBack');
  const cardEl = document.getElementById('flashcard');
  if (!state.deck.length) {
    cardEl.classList.remove('flipped');
    front.innerHTML = '<p class="muted">No methods in this section.</p>';
    back.innerHTML = '';
    document.getElementById('fcCounter').textContent = '0 / 0';
    document.getElementById('fcKnown').textContent = '0 / 0 known';
    document.getElementById('fcBar').style.width = '0%';
    return;
  }
  if (state.index >= state.deck.length) state.index = 0;
  if (state.index < 0) state.index = state.deck.length - 1;
  const card = state.deck[state.index];
  state.flipped = false;
  cardEl.classList.remove('flipped');
  front.innerHTML = frontHtml(card);
  back.innerHTML = backHtml(card);
  const knownInDeck = state.deck.filter(c => state.known.has(c.id)).length;
  document.getElementById('fcCounter').textContent = 'Card ' + (state.index + 1) + ' / ' + state.deck.length;
  document.getElementById('fcKnown').textContent = knownInDeck + ' / ' + state.deck.length + ' known';
  document.getElementById('fcBar').style.width = (((state.index + 1) / state.deck.length) * 100) + '%';
}

function flipCard() {
  if (!state.deck.length) return;
  state.flipped = !state.flipped;
  document.getElementById('flashcard').classList.toggle('flipped', state.flipped);
}

function moveCard(delta) {
  if (!state.deck.length) return;
  state.index = (state.index + delta + state.deck.length) % state.deck.length;
  renderFlashcard();
}

function markCard(isKnown) {
  if (!state.deck.length) return;
  const card = state.deck[state.index];
  if (isKnown) state.known.add(card.id);
  else state.known.delete(card.id);
  saveProgress();
  updateFooter();
  moveCard(1);
}
const QUESTION_TYPES = [
  {
    field: 'Plain-language use',
    label: 'Plain-language use',
    prompt: c => 'What is <code>' + esc(c.name) + '</code> used for, in plain language?'
  },
  {
    field: 'What it does',
    label: 'What it does',
    prompt: c => 'What does <code>' + esc(c.name) + '</code> do, technically?'
  },
  {
    field: 'Parameters',
    label: 'Parameters',
    prompt: c => 'What parameters does <code>' + esc(c.name) + '</code> take?'
  },
  {
    field: 'Called from',
    label: 'Called from',
    prompt: c => 'Where is <code>' + esc(c.name) + '</code> called from?'
  },
  {
    field: 'Returns',
    label: 'Returns',
    prompt: c => 'What does <code>' + esc(c.name) + '</code> return?'
  }
];

function buildQuestionPools() {
  const pools = {};
  for (const type of QUESTION_TYPES) {
    const seen = new Set();
    const arr = [];
    for (const c of shuffleArray(state.cards.slice())) {
      const t = c.plainMap[type.field];
      if (!t || seen.has(t)) continue;
      seen.add(t);
      arr.push(t);
    }
    pools[type.field] = arr;
  }
  const names = [];
  const seenNames = new Set();
  for (const c of shuffleArray(state.cards.slice())) {
    if (seenNames.has(c.name)) continue;
    seenNames.add(c.name);
    names.push(c.name);
  }
  pools.names = names;
  return pools;
}

function pickDistractors(pool, correct, count) {
  const out = [];
  if (!pool || pool.length <= 1) return out;
  const start = Math.floor(Math.random() * pool.length);
  for (let i = 0; i < pool.length && out.length < count; i++) {
    const t = pool[(start + i) % pool.length];
    if (t === correct) continue;
    out.push(t);
  }
  return out;
}

function makeQuestion(card, pools) {
  const candidates = [];
  for (const type of QUESTION_TYPES) {
    const correctText = card.plainMap[type.field];
    if (!correctText) continue;
    const distractors = pickDistractors(pools[type.field], correctText, 3);
    if (distractors.length >= 2) {
      candidates.push({ label: type.label, promptHtml: type.prompt(card), correctText: correctText, distractors: distractors });
    }
  }

  const clueRaw = card.plainMap['Plain-language use'] || card.plainMap['What it does'];
  if (clueRaw) {
    let clue = clueRaw;
    if (clue.length > 240) clue = clue.slice(0, 240) + '…';
    const distractors = pickDistractors(pools.names, card.name, 3);
    if (clue && distractors.length >= 2) {
      candidates.push({
        label: 'Reverse lookup',
        promptHtml: 'Which method matches this description?<span class="clue">“' + esc(clue) + '”</span>',
        correctText: card.name,
        distractors: distractors
      });
    }
  }

  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const options = shuffleArray(
    [{ text: pick.correctText, correct: true }].concat(
      pick.distractors.map(t => ({ text: t, correct: false }))
    )
  );
  return {
    card: card,
    label: pick.label,
    promptHtml: pick.promptHtml,
    options: options,
    correctText: pick.correctText
  };
}

function startQuiz() {
  quiz = { order: [], pos: 0, correct: 0, answered: 0, current: null, selected: null };
  const pools = buildQuestionPools();
  const source = shuffleArray(state.deck.slice());
  quiz.order = source.map(c => makeQuestion(c, pools)).filter(Boolean);
  renderQuiz();
}

function renderQuiz() {
  const body = document.getElementById('quizBody');
  if (!state.deck.length) {
    body.innerHTML = '<div class="panel center muted">No methods in this section.</div>';
    return;
  }
  if (!quiz.order.length) {
    body.innerHTML = '<div class="panel center muted">Not enough content to build questions for this section.</div>';
    return;
  }
  if (quiz.pos >= quiz.order.length) {
    renderQuizSummary();
    return;
  }
  const q = quiz.order[quiz.pos];
  quiz.current = q;
  quiz.selected = null;
  const opts = q.options.map((o, i) =>
    '<button class="option" type="button" data-index="' + i + '">' + esc(o.text) + '</button>'
  ).join('');
  body.innerHTML =
    '<div class="study-head">' +
      '<div>Question ' + (quiz.pos + 1) + ' / ' + quiz.order.length + '</div>' +
      '<div>Score: ' + quiz.correct + ' / ' + quiz.answered + '</div>' +
    '</div>' +
    '<div class="progress"><div class="bar" style="width:' + ((quiz.pos / quiz.order.length) * 100) + '%"></div></div>' +
    '<div class="quiz-card">' +
      '<div class="chips left"><span class="chip">' + esc(q.label) + '</span>' + sevBadge(q.card) + '</div>' +
      '<h2 class="quiz-prompt">' + q.promptHtml + '</h2>' +
      '<div class="options" id="options">' + opts + '</div>' +
      '<div class="feedback hidden" id="feedback"></div>' +
      '<button class="btn primary hidden" type="button" id="nextQuestion">Next question →</button>' +
    '</div>';
  body.querySelectorAll('.option').forEach(btn => {
    btn.addEventListener('click', () => answerQuiz(Number(btn.dataset.index)));
  });
  document.getElementById('nextQuestion').addEventListener('click', nextQuestion);
}

function answerQuiz(index) {
  const q = quiz.current;
  if (!q || quiz.selected !== null) return;
  quiz.selected = index;
  const chosen = q.options[index];
  quiz.answered++;
  if (chosen.correct) quiz.correct++;
  document.querySelectorAll('.option').forEach((btn, idx) => {
    btn.disabled = true;
    if (q.options[idx].correct) btn.classList.add('correct');
    else if (idx === index) btn.classList.add('wrong');
  });
  const fb = document.getElementById('feedback');
  fb.classList.remove('hidden');
  const correctText = q.options.find(o => o.correct).text;
  let html = chosen.correct
    ? '<strong>Correct!</strong>'
    : '<strong>Not quite.</strong> Correct answer: <span class="correct-text">' + esc(correctText) + '</span>';
  html += '<details class="fb-details"><summary>Show method details</summary>' + fieldsHtml(q.card) + '</details>';
  fb.className = 'feedback ' + (chosen.correct ? 'correct' : 'wrong');
  fb.innerHTML = html;
  document.getElementById('nextQuestion').classList.remove('hidden');
  document.getElementById('nextQuestion').focus();
  const head = document.querySelector('#quizBody .study-head');
  if (head) head.lastElementChild.textContent = 'Score: ' + quiz.correct + ' / ' + quiz.answered;
}

function nextQuestion() {
  quiz.pos++;
  renderQuiz();
}

function renderQuizSummary() {
  const total = quiz.answered || 0;
  const pct = total ? Math.round((quiz.correct / total) * 100) : 0;
  document.getElementById('quizBody').innerHTML =
    '<div class="quiz-card summary">' +
      '<h2>Quiz complete</h2>' +
      '<div class="big-score">' + quiz.correct + ' / ' + total + '</div>' +
      '<p class="muted">' + pct + '% correct</p>' +
      '<div class="progress"><div class="bar" style="width:' + pct + '%"></div></div>' +
      '<button class="btn primary" type="button" id="restartQuiz">Start again</button>' +
    '</div>';
  document.getElementById('restartQuiz').addEventListener('click', startQuiz);
}
function renderBrowse() {
  const searchEl = document.getElementById('browseSearch');
  const q = searchEl.value.trim().toLowerCase();
  const base = state.section === 'all'
    ? state.cards
    : state.cards.filter(c => c.section === state.section);
  const filtered = q
    ? base.filter(c => c.searchText.indexOf(q) !== -1)
    : base;
  const list = document.getElementById('browseList');
  if (!filtered.length) {
    list.innerHTML = '<p class="muted">No methods match your search.</p>';
    return;
  }
  const groups = new Map();
  for (const c of filtered) {
    const key = c.part + ' \u0000 ' + c.section;
    if (!groups.has(key)) groups.set(key, { part: c.part, section: c.section, items: [] });
    groups.get(key).items.push(c);
  }
  let html = '';
  for (const g of groups.values()) {
    html += '<div class="browse-group"><h3>' + esc(g.section || g.part) + '</h3>';
    for (const c of g.items) {
      html += '<details class="browse-item" data-card="' + state.cards.indexOf(c) + '">' +
        '<summary><span class="browse-title"><code>' + esc(c.name) + '</code>' + sevBadge(c) + '</span><span class="loc">' + esc(c.location) + '</span></summary>' +
        '<div class="browse-detail"></div>' +
      '</details>';
    }
    html += '</div>';
  }
  list.innerHTML = html;
}

function loadBrowseDetail(details) {
  const detail = details.querySelector('.browse-detail');
  if (!detail || detail.dataset.loaded === '1') return;
  const card = state.cards[Number(details.dataset.card)];
  if (!card) return;
  detail.innerHTML = fieldsHtml(card);
  detail.dataset.loaded = '1';
}

function buildSectionFilter() {
  const sel = document.getElementById('sectionFilter');
  const sections = [];
  for (const c of state.cards) {
    if (c.section && sections.indexOf(c.section) === -1) sections.push(c.section);
  }
  let opts = '<option value="all">All sections (' + state.cards.length + ')</option>';
  for (const s of sections) {
    const n = state.cards.filter(c => c.section === s).length;
    opts += '<option value="' + esc(s) + '">' + esc(s) + ' (' + n + ')</option>';
  }
  sel.innerHTML = opts;
  sel.value = state.section;
}

function buildSeverityFilter() {
  const sel = document.getElementById('severityFilter');
  const counts = { all: state.cards.length, major: 0, mid: 0, minor: 0 };
  for (const c of state.cards) counts[c.importance]++;
  sel.innerHTML =
    '<option value="all">All importance (' + counts.all + ')</option>' +
    '<option value="major">Major (' + counts.major + ')</option>' +
    '<option value="mid">Mid (' + counts.mid + ')</option>' +
    '<option value="minor">Minor (' + counts.minor + ')</option>';
  sel.value = state.severity;
}

function updateFooter() {
  const el = document.getElementById('footerStats');
  if (!el) return;
  const counts = { major: 0, mid: 0, minor: 0 };
  for (const c of state.cards) counts[c.importance]++;
  el.textContent = state.cards.length + ' methods loaded (' + counts.major + ' major · ' + counts.mid + ' mid · ' + counts.minor + ' minor) · ' + state.known.size + ' marked known · deck ordered major → mid → minor unless shuffled';
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + mode));
  if (mode === 'flashcards') renderFlashcard();
  else if (mode === 'quiz') startQuiz();
  else renderBrowse();
  updateFooter();
  closeMenu();
}

function setupEvents() {
  const menuToggle = document.getElementById('menuToggle');
  const toolbar = document.getElementById('toolbar');
  menuToggle.addEventListener('click', e => {
    e.stopPropagation();
    const open = !toolbar.classList.contains('open');
    toolbar.classList.toggle('open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => {
    if (!toolbar.classList.contains('open')) return;
    if (toolbar.contains(e.target) || menuToggle.contains(e.target)) return;
    closeMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMenu();
  });

  document.getElementById('tabs').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (tab) setMode(tab.dataset.mode);
  });

  document.getElementById('sectionFilter').addEventListener('change', e => {
    state.section = e.target.value;
    rebuildDeck();
    if (state.mode === 'flashcards') renderFlashcard();
    else if (state.mode === 'quiz') startQuiz();
    else renderBrowse();
    updateFooter();
  });

  document.getElementById('severityFilter').addEventListener('change', e => {
    state.severity = e.target.value;
    rebuildDeck();
    if (state.mode === 'flashcards') renderFlashcard();
    else if (state.mode === 'quiz') startQuiz();
    else renderBrowse();
    updateFooter();
  });

  document.getElementById('shuffleBtn').addEventListener('click', () => {
    state.shuffled = !state.shuffled;
    document.getElementById('shuffleBtn').textContent = 'Shuffle: ' + (state.shuffled ? 'on' : 'off');
    rebuildDeck();
    if (state.mode === 'flashcards') renderFlashcard();
    else if (state.mode === 'quiz') startQuiz();
    else renderBrowse();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    state.known.clear();
    saveProgress();
    quiz = { order: [], pos: 0, correct: 0, answered: 0, current: null, selected: null };
    if (state.mode === 'flashcards') renderFlashcard();
    else if (state.mode === 'quiz') startQuiz();
    else renderBrowse();
    updateFooter();
  });

  document.getElementById('prevCard').addEventListener('click', () => moveCard(-1));
  document.getElementById('nextCard').addEventListener('click', () => moveCard(1));
  document.getElementById('flipCardBtn').addEventListener('click', flipCard);
  document.getElementById('stillBtn').addEventListener('click', () => markCard(false));
  document.getElementById('gotBtn').addEventListener('click', () => markCard(true));
  document.getElementById('fcFront').addEventListener('click', flipCard);
  document.getElementById('fcBack').addEventListener('click', e => {
    if (e.target.closest('.flip-back')) flipCard();
  });

  document.getElementById('browseSearch').addEventListener('input', renderBrowse);
  document.getElementById('browseList').addEventListener('toggle', e => {
    const details = e.target;
    if (details.classList && details.classList.contains('browse-item') && details.open) {
      loadBrowseDetail(details);
    }
  }, true);

  document.getElementById('fileInput').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => start(String(reader.result));
    reader.onerror = () => showLoadError(new Error('Could not read the selected file.'));
    reader.readAsText(file);
  });

  document.addEventListener('keydown', e => {
    if (state.mode !== 'flashcards') return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.code === 'Space') {
      if (tag === 'button' || tag === 'a') return;
      e.preventDefault();
      flipCard();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveCard(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveCard(-1);
    }
  });
}

function showLoadError(err) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('loadError').classList.remove('hidden');
  document.getElementById('loadErrorMsg').textContent = err && err.message ? err.message : String(err);
}

function start(md) {
  state.cards = parseMethods(md);
  if (!state.cards.length) {
    showLoadError(new Error('No method sections (#### headings) were found in METHODS.md.'));
    return;
  }
  loadProgress();
  const validIds = new Set(state.cards.map(c => c.id));
  state.known = new Set(Array.from(state.known).filter(id => validIds.has(id)));
  buildSectionFilter();
  buildSeverityFilter();
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('loadError').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  rebuildDeck();
  setMode('flashcards');
  updateFooter();
}

async function boot() {
  try {
    const res = await fetch('METHODS.md', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (/^\s*<!doctype html/i.test(text)) throw new Error('The server returned an HTML page instead of Markdown.');
    start(text);
  } catch (err) {
    showLoadError(err);
  }
}

setupEvents();
boot();